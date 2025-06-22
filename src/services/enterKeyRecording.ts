import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import * as fs from 'fs';

interface EnterKeyRecordingConfig {
  sampleRate?: number;
  channels?: number;
  maxDuration?: number; // 安全のための最大録音時間
  enableVAD?: boolean; // VADを有効にするか
  silenceThreshold?: number; // 音量閾値
  silenceDuration?: number; // 無音判定時間
}

/**
 * ハイブリッド録音サービス
 * VADによる自動停止とEnterキーによる手動停止の両方をサポート
 */
export class EnterKeyRecording extends EventEmitter {
  private sampleRate: number;
  private channels: number;
  private maxDuration: number;
  private recordingProcess: ChildProcess | null = null;
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private rl: readline.Interface | null = null;
  
  // VAD関連のプロパティ
  private enableVAD: boolean;
  private audioData: Buffer[] = [];
  private audioBuffer: Buffer[] = [];
  private silenceStartTime: number | null = null;
  private readonly SILENCE_THRESHOLD: number;
  private readonly SILENCE_DURATION: number;
  private volumeCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(config: EnterKeyRecordingConfig = {}) {
    super();
    this.sampleRate = config.sampleRate || 24000;
    this.channels = config.channels || 1;
    this.maxDuration = config.maxDuration || 300000; // 5分まで
    this.enableVAD = config.enableVAD !== false; // デフォルトでVAD有効
    this.SILENCE_THRESHOLD = config.silenceThreshold || 2000; // さらに余裕を持たせる
    this.SILENCE_DURATION = config.silenceDuration || 1500; // 1.5秒（AutoStopRecordingと統一）
  }
  
  /**
   * ハイブリッド録音開始（VAD + Enterキー）
   */
  async startRecordingUntilEnter(): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    const tempFile = `/tmp/enter_recording_${Date.now()}.wav`;
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.audioData = [];
    this.audioBuffer = [];
    this.silenceStartTime = null;
    
    console.log('🎙️ Recording started...');
    if (this.enableVAD) {
      console.log('💡 Press Enter to stop manually, or wait for 2 seconds of silence');
    } else {
      console.log('⏎ Press Enter when done speaking');
    }
    console.log('-'.repeat(40));
    
    return new Promise((resolve, reject) => {
      // VAD使用時はrawフォーマットで録音
      if (this.enableVAD) {
        this.recordingProcess = spawn('rec', [
          '-q',  // 静音モード
          '-r', this.sampleRate.toString(),
          '-c', this.channels.toString(),
          '-b', '16',
          '-e', 'signed-integer',
          '-t', 'raw',    // raw出力（リアルタイム処理用）
          '-',            // 標準出力へ
        ]);
      } else {
        // VADなしの場合は直接ファイルに保存
        this.recordingProcess = spawn('rec', [
          '-q',  // 静音モード
          '-r', this.sampleRate.toString(),
          '-c', this.channels.toString(),
          '-b', '16',
          tempFile
        ]);
      }
      
      // キーボード入力を設定
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      // Enterキー待機
      this.rl.on('line', () => {
        if (this.isRecording) {
          console.log('\n⏎ Enter key detected - stopping recording');
          // 終了音を再生
          spawn('afplay', ['/System/Library/Sounds/Pop.aiff']);
          this.stopRecording();
        }
      });
      
      // VAD使用時はデータ処理と音量監視を開始
      if (this.enableVAD && this.recordingProcess.stdout) {
        // 録音データをバッファに蓄積
        this.recordingProcess.stdout.on('data', (chunk: Buffer) => {
          // 全データを保存
          this.audioData.push(chunk);
          
          // 音量監視用バッファ
          this.audioBuffer.push(chunk);
          if (this.audioBuffer.length > 30) {  // 30個まで保持（約3秒分）
            this.audioBuffer.shift();
          }
        });
        
        // 音量監視を開始
        this.startVolumeMonitoring();
      }
      
      // 最大録音時間のタイマー（安全のため）
      const maxTimer = setTimeout(() => {
        if (this.isRecording) {
          console.log('\n⏱️ Maximum recording time reached (5 min)');
          this.stopRecording();
        }
      }, this.maxDuration);
      
      // プロセス終了時
      this.recordingProcess.on('close', async (code) => {
        clearTimeout(maxTimer);
        this.isRecording = false;
        this.recordingProcess = null;
        
        // クリーンアップ
        this.cleanup();
        
        const duration = Date.now() - this.recordingStartTime;
        console.log(`\n🛑 Recording stopped (${(duration / 1000).toFixed(1)}s)`);
        
        if (code === 0) {
          // VAD使用時はWAVファイルを生成
          if (this.enableVAD && this.audioData.length > 0) {
            try {
              const rawData = Buffer.concat(this.audioData);
              const wavData = this.createWAVFromPCM(rawData);
              fs.writeFileSync(tempFile, wavData);
              resolve(tempFile);
            } catch (error) {
              reject(error);
            }
          } else {
            resolve(tempFile);
          }
        } else {
          reject(new Error(`Recording failed with code ${code}`));
        }
      });
      
      // エラー処理
      this.recordingProcess.on('error', (error) => {
        clearTimeout(maxTimer);
        this.isRecording = false;
        this.recordingProcess = null;
        this.cleanup();
        reject(error);
      });
      
      // 録音中の表示
      let dots = 0;
      const indicator = setInterval(() => {
        if (this.isRecording) {
          process.stdout.write('\r🔴 Recording' + '.'.repeat(dots % 4) + '   ');
          dots++;
        } else {
          clearInterval(indicator);
        }
      }, 500);
    });
  }
  
  /**
   * 録音を停止
   */
  private stopRecording(): void {
    if (this.recordingProcess && this.isRecording) {
      this.recordingProcess.kill('SIGTERM');
    }
  }
  
  /**
   * 音量監視を開始
   */
  private startVolumeMonitoring(): void {
    this.volumeCheckInterval = setInterval(() => {
      const volume = this.getCurrentVolume();
      
      if (volume < this.SILENCE_THRESHOLD) {
        // 静音開始
        if (!this.silenceStartTime) {
          this.silenceStartTime = Date.now();
        } else {
          // 静音継続時間をチェック
          const silenceDuration = Date.now() - this.silenceStartTime;
          if (silenceDuration >= this.SILENCE_DURATION) {
            console.log('\n🛑 Auto-stopping due to silence');
            // 終了音を再生
            spawn('afplay', ['/System/Library/Sounds/Pop.aiff']);
            this.stopRecording();
          }
        }
      } else {
        // 音声検出
        if (this.silenceStartTime) {
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
   * クリーンアップ
   */
  private cleanup(): void {
    // キーボード入力をクリーンアップ
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    // 音量監視を停止
    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval);
      this.volumeCheckInterval = null;
    }
    
    // バッファをクリア
    this.audioData = [];
    this.audioBuffer = [];
    this.silenceStartTime = null;
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
    header.writeUInt16LE(this.channels, 22);  // Channels
    header.writeUInt32LE(this.sampleRate, 24);  // Sample rate
    header.writeUInt32LE(this.sampleRate * this.channels * 2, 28);  // Byte rate
    header.writeUInt16LE(this.channels * 2, 32);  // Block align
    header.writeUInt16LE(16, 34);  // Bits per sample

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
  
  /**
   * 現在録音中かどうか
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
  
  /**
   * VADを無効化（Enterキーのみ）
   */
  disableVAD(): void {
    this.enableVAD = false;
  }
  
  /**
   * VADを有効化
   */
  enableVoiceActivityDetection(): void {
    this.enableVAD = true;
  }
}