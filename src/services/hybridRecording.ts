import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * ハイブリッド録音サービス
 * 
 * AutoStopRecordingの機能（VADによる自動停止）とEnterキーによる手動停止を両立
 * どちらか早い方で録音を停止する
 */
export class HybridRecording {
  private recordingProcess: ChildProcess | null = null;
  private isRecording: boolean = false;
  private audioData: Buffer[] = [];  // 全録音データ
  private audioBuffer: Buffer[] = [];  // 音量監視用バッファ
  private silenceStartTime: number | null = null;
  private readonly SILENCE_THRESHOLD = 400; // 音量閾値（適切な感度に調整）
  private readonly SILENCE_DURATION = 1500; // 1.5秒
  private volumeCheckInterval: NodeJS.Timeout | null = null;
  private recordingStartTime: number = 0;
  private rl: readline.Interface | null = null;
  private enterKeyHandler: (() => void) | null = null;

  constructor() {
    console.log('🎙️ Hybrid Recording Service initialized (VAD + Enter key)');
  }

  /**
   * 録音を開始（自動停止 + Enterキー手動停止）
   * @returns 録音データのBuffer
   */
  async startRecordingWithHybridStop(): Promise<Buffer> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    this.isRecording = true;
    this.audioData = [];
    this.audioBuffer = [];
    this.silenceStartTime = null;
    this.recordingStartTime = Date.now();

    console.log('🎙️ Recording started...');
    console.log('💡 Press Enter to stop manually, or wait for 2 seconds of silence');

    return new Promise((resolve, reject) => {
      // recコマンドで録音開始（rawフォーマットで出力を取得）
      this.recordingProcess = spawn('rec', [
        '-q',           // 静音モード
        '-r', '24000',  // サンプルレート
        '-c', '1',      // モノラル
        '-b', '16',     // 16bit
        '-e', 'signed-integer',
        '-t', 'raw',    // raw出力（リアルタイム処理用）
        '-',            // 標準出力へ
      ]);

      // キーボード入力を設定
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      // Enterキーハンドラー
      this.enterKeyHandler = () => {
        if (this.isRecording) {
          console.log('\n⏎ Enter key detected - stopping recording');
          // 終了音を再生
          spawn('afplay', ['/System/Library/Sounds/Pop.aiff']);
          this.stopRecording();
        }
      };
      
      // Enterキー待機
      this.rl.on('line', this.enterKeyHandler);

      // 音量監視を開始
      this.startVolumeMonitoring();

      // エラーハンドリング
      this.recordingProcess.on('error', (err) => {
        this.cleanup();
        reject(err);
      });

      // 録音プロセス終了時
      this.recordingProcess.on('close', () => {
        // 全録音データをWAV形式に変換
        const rawData = Buffer.concat(this.audioData);
        const wavData = this.createWAVFromPCM(rawData);
        
        const duration = (Date.now() - this.recordingStartTime) / 1000;
        console.log(`🛑 Recording stopped (${duration.toFixed(1)}s)`);
        
        this.cleanup();
        resolve(wavData);
      });

      // 録音データをバッファに蓄積
      this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
        // 全データを保存
        this.audioData.push(chunk);
        
        // 音量監視用バッファ
        this.audioBuffer.push(chunk);
        if (this.audioBuffer.length > 30) {  // 30個まで保持（約3秒分）
          this.audioBuffer.shift();
        }
      });

      // 最大録音時間（60秒）
      setTimeout(() => {
        if (this.isRecording) {
          console.log('⏱️ Maximum recording time reached (60s)');
          // 終了音を再生
          spawn('afplay', ['/System/Library/Sounds/Pop.aiff']);
          this.stopRecording();
        }
      }, 60000);
    });
  }

  /**
   * 音量監視を開始
   */
  private startVolumeMonitoring(): void {
    let logCounter = 0; // ログ出力を制限
    this.volumeCheckInterval = setInterval(() => {
      const volume = this.getCurrentVolume();
      
      // 1秒ごとに音量をログ出力（デバッグ用）
      if (logCounter % 10 === 0) {
        console.log(`🎤 Volume: ${Math.round(volume)} (threshold: ${this.SILENCE_THRESHOLD})`);
      }
      logCounter++;
      
      if (volume < this.SILENCE_THRESHOLD) {
        // 静音開始
        if (!this.silenceStartTime) {
          this.silenceStartTime = Date.now();
          console.log(`🔇 Silence detected (volume: ${Math.round(volume)})`);
        } else {
          // 静音継続時間をチェック
          const silenceDuration = Date.now() - this.silenceStartTime;
          if (silenceDuration >= this.SILENCE_DURATION) {
            console.log(`🛑 Auto-stopping due to silence (${silenceDuration}ms >= ${this.SILENCE_DURATION}ms)`);
            // 終了音を再生
            spawn('afplay', ['/System/Library/Sounds/Pop.aiff']);
            this.stopRecording();
          }
        }
      } else {
        // 音声検出
        if (this.silenceStartTime) {
          console.log(`🗣️ Speech detected (volume: ${Math.round(volume)}), resetting silence timer`);
          this.silenceStartTime = null;
        }
      }
    }, 100); // 100msごとにチェック
  }

  /**
   * 現在の音量を計算（複数バッファの平均RMS）
   */
  private getCurrentVolume(): number {
    if (this.audioBuffer.length === 0) return 0;

    // 最新の5個のバッファの平均音量を計算（約0.5秒分）
    const buffersToCheck = Math.min(5, this.audioBuffer.length);
    const recentBuffers = this.audioBuffer.slice(-buffersToCheck);
    
    let totalRms = 0;
    
    for (const buffer of recentBuffers) {
      let sum = 0;
      // 16bit signed integerとして処理
      for (let i = 0; i < buffer.length - 1; i += 2) {
        const sample = buffer.readInt16LE(i);
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / (buffer.length / 2));
      totalRms += rms;
    }
    
    // 平均RMSを返す
    return totalRms / buffersToCheck;
  }

  /**
   * 録音を停止
   */
  stopRecording(): void {
    if (this.recordingProcess && this.isRecording) {
      this.recordingProcess.kill('SIGTERM');
    }
  }

  /**
   * クリーンアップ
   */
  private cleanup(): void {
    this.isRecording = false;
    this.audioData = [];
    this.audioBuffer = [];
    this.silenceStartTime = null;
    
    // キーボード入力をクリーンアップ
    if (this.rl && this.enterKeyHandler) {
      this.rl.removeListener('line', this.enterKeyHandler);
      this.rl.close();
      this.rl = null;
      this.enterKeyHandler = null;
    }
    
    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval);
      this.volumeCheckInterval = null;
    }
    
    this.recordingProcess = null;
  }

  /**
   * PCMデータからWAVファイルを作成
   */
  private createWAVFromPCM(pcmData: Buffer): Buffer {
    const dataSize = pcmData.length;
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);  // PCM format
    header.writeUInt16LE(1, 22);  // Mono
    header.writeUInt32LE(24000, 24);  // Sample rate
    header.writeUInt32LE(24000 * 2, 28);  // Byte rate
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}