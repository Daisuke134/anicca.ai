import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AudioConfig {
  sampleRate?: number;
  channels?: number;
  format?: 'pcm16' | 'pcm32';
}

/**
 * AudioService - 音声の録音と再生を管理
 * 
 * macOSのネイティブ機能を使用
 * - 録音: sox または macOS の録音コマンド
 * - 再生: afplay
 */
export class AudioService extends EventEmitter {
  private sampleRate: number;
  private channels: number;
  private format: string;
  private isRecording: boolean = false;
  private recordingProcess: any = null;
  private audioQueue: Buffer[] = [];
  private isPlaying: boolean = false;
  
  // ストリーミング再生用の追加プロパティ（Haconiwa参考）
  private streamBuffer: Buffer[] = [];
  private initialBuffer: Buffer[] = [];
  private bufferThreshold: number = 3; // 最初の3チャンクをバッファ
  private chunkCount: number = 0;
  private bufferingComplete: boolean = false;
  private isStreaming: boolean = false;
  private streamFile: string | null = null;
  
  constructor(config: AudioConfig = {}) {
    super();
    this.sampleRate = config.sampleRate || 24000; // OpenAI Realtime API標準
    this.channels = config.channels || 1;
    this.format = config.format || 'pcm16';
    
    console.log('🔊 Audio Service initialized');
    console.log(`📊 Format: ${this.format}, ${this.sampleRate}Hz, ${this.channels}ch`);
  }
  
  /**
   * 音声録音を開始（macOS用）
   */
  async startRecording(): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    const timestamp = Date.now();
    const tempFile = path.join('/tmp', `anicca_recording_${timestamp}.wav`);
    
    try {
      // macOSのrec コマンドを使用（sox必要）
      // まずsoxがインストールされているか確認
      try {
        await execAsync('which rec');
      } catch {
        console.log('⚠️ sox not found. Please install: brew install sox');
        // 代替方法を使用（後で実装）
        throw new Error('Audio recording requires sox. Please install: brew install sox');
      }
      
      // 録音開始
      const command = `rec -r ${this.sampleRate} -c ${this.channels} -b 16 ${tempFile}`;
      
      this.isRecording = true;
      this.emit('recording-started');
      
      // バックグラウンドで録音プロセスを開始
      const { spawn } = require('child_process');
      this.recordingProcess = spawn('rec', [
        '-r', this.sampleRate.toString(),
        '-c', this.channels.toString(),
        '-b', '16',
        tempFile
      ]);
      
      this.recordingProcess.on('error', (error: Error) => {
        console.error('❌ Recording error:', error);
        this.isRecording = false;
        this.emit('recording-error', error);
      });
      
      console.log('🎙️ Recording started:', tempFile);
      return tempFile;
      
    } catch (error) {
      this.isRecording = false;
      throw error;
    }
  }
  
  /**
   * 音声録音を停止
   */
  async stopRecording(): Promise<Buffer> {
    if (!this.isRecording || !this.recordingProcess) {
      throw new Error('Not recording');
    }
    
    return new Promise((resolve, reject) => {
      // 録音ファイルパスを先に保存
      const audioFile = this.recordingProcess.spawnargs[this.recordingProcess.spawnargs.length - 1];
      
      // 録音プロセスを終了
      this.recordingProcess.kill('SIGTERM');
      
      this.recordingProcess.on('close', async () => {
        this.isRecording = false;
        this.recordingProcess = null;
        this.emit('recording-stopped');
        
        // 録音ファイルを読み込み
        try {
          const audioData = await fs.promises.readFile(audioFile);
          
          // WAVヘッダーを除去してPCMデータのみ取得
          const pcmData = this.extractPCMFromWAV(audioData);
          
          // 一時ファイルを削除
          await fs.promises.unlink(audioFile);
          
          console.log('🛑 Recording stopped');
          resolve(pcmData);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  /**
   * WAVファイルからPCMデータを抽出
   */
  private extractPCMFromWAV(wavData: Buffer): Buffer {
    // WAVヘッダーは通常44バイト
    const headerSize = 44;
    if (wavData.length > headerSize) {
      return wavData.slice(headerSize);
    }
    return wavData;
  }
  
  /**
   * 音声を再生（PCMデータ）
   */
  async playAudio(pcmData: Buffer, immediate: boolean = false): Promise<void> {
    if (!immediate && this.isPlaying) {
      // キューに追加
      this.audioQueue.push(pcmData);
      return;
    }
    
    this.isPlaying = true;
    
    try {
      // PCMデータをWAVファイルに変換
      const tempFile = path.join('/tmp', `anicca_playback_${Date.now()}.wav`);
      const wavData = this.createWAVFromPCM(pcmData);
      
      await fs.promises.writeFile(tempFile, wavData);
      
      // afplayで再生（音量50%）
      await execAsync(`afplay -v 0.5 ${tempFile}`);
      
      // 一時ファイルを削除
      await fs.promises.unlink(tempFile);
      
      this.emit('playback-complete');
      
      // キューに次の音声があれば再生
      if (this.audioQueue.length > 0) {
        const nextAudio = this.audioQueue.shift();
        if (nextAudio) {
          await this.playAudio(nextAudio, true);
        }
      } else {
        this.isPlaying = false;
      }
      
    } catch (error) {
      console.error('❌ Playback error:', error);
      this.isPlaying = false;
      this.emit('playback-error', error);
      throw error;
    }
  }
  
  /**
   * PCMデータからWAVファイルを作成
   */
  createWAVFromPCM(pcmData: Buffer): Buffer {
    const dataSize = pcmData.length;
    const bitsPerSample = 16;
    const numChannels = this.channels;
    const sampleRate = this.sampleRate;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    
    const buffer = Buffer.alloc(44 + dataSize);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // fmt chunk size
    buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmData.copy(buffer, 44);
    
    return buffer;
  }
  
  /**
   * システム通知音を再生
   */
  async playNotificationSound(soundName: string = 'Glass'): Promise<void> {
    try {
      await execAsync(`afplay /System/Library/Sounds/${soundName}.aiff`);
    } catch (error) {
      console.error('❌ Failed to play notification sound:', error);
    }
  }
  
  /**
   * 音声ストリームを処理（Realtime API用）- Haconiwa実装参考
   */
  processAudioStream(audioData: Buffer): void {
    // 音量調整（50%に）
    const adjustedAudio = this.adjustVolume(audioData, 0.5);
    
    this.chunkCount++;
    
    // 初期バッファリング（最初の3チャンク）
    if (!this.bufferingComplete && this.chunkCount <= this.bufferThreshold) {
      this.initialBuffer.push(adjustedAudio);
      console.log(`📦 Buffering chunk ${this.chunkCount}/${this.bufferThreshold}`);
      
      // バッファ閾値に達したら再生開始
      if (this.chunkCount === this.bufferThreshold) {
        console.log('🚀 Starting streaming playback');
        this.startStreamingPlayback();
        this.bufferingComplete = true;
      }
    } else if (this.bufferingComplete) {
      // バッファリング完了後は直接ストリームに追加
      this.streamBuffer.push(adjustedAudio);
    }
  }
  
  /**
   * ストリーミング再生を開始
   */
  private async startStreamingPlayback(): Promise<void> {
    if (this.isStreaming) return;
    
    this.isStreaming = true;
    
    // 初期バッファを結合してWAVファイルとして再生
    const initialData = Buffer.concat(this.initialBuffer);
    const wavData = this.createWAVFromPCM(initialData);
    const timestamp = Date.now();
    const wavFile = path.join('/tmp', `anicca_voice_${timestamp}.wav`);
    
    try {
      await fs.promises.writeFile(wavFile, wavData);
      
      // バックグラウンドで再生
      const { spawn } = require('child_process');
      const player = spawn('afplay', ['-v', '0.5', wavFile]);
      
      player.on('close', async () => {
        // ファイルを削除
        try {
          await fs.promises.unlink(wavFile);
        } catch (error) {
          // エラーは無視
        }
      });
      
      this.initialBuffer = []; // バッファをクリア
      
      // 後続のチャンクを処理
      this.processRemainingChunks();
      
    } catch (error) {
      console.error('❌ Playback error:', error);
    }
  }
  
  /**
   * 残りのチャンクを処理
   */
  private async processRemainingChunks(): Promise<void> {
    // 後続のチャンクを定期的に処理
    const processInterval = setInterval(async () => {
      if (!this.isStreaming || this.streamBuffer.length === 0) {
        return;
      }
      
      // バッファからチャンクを取り出して結合
      const chunks = this.streamBuffer.splice(0, this.streamBuffer.length);
      if (chunks.length > 0) {
        const data = Buffer.concat(chunks);
        const wavData = this.createWAVFromPCM(data);
        const timestamp = Date.now();
        const wavFile = path.join('/tmp', `anicca_voice_cont_${timestamp}.wav`);
        
        try {
          await fs.promises.writeFile(wavFile, wavData);
          
          // afplayで再生
          const { spawn } = require('child_process');
          const player = spawn('afplay', ['-v', '0.5', wavFile]);
          
          player.on('close', async () => {
            try {
              await fs.promises.unlink(wavFile);
            } catch (error) {
              // エラーは無視
            }
          });
        } catch (error) {
          console.error('❌ Continuous playback error:', error);
        }
      }
    }, 500); // 500msごとにチェック
    
    // クリーンアップ時にインターバルをクリア
    this.once('cleanup', () => {
      clearInterval(processInterval);
    });
  }
  
  /**
   * ストリーミングのクリーンアップ
   */
  private async cleanupStreaming(): Promise<void> {
    this.isStreaming = false;
    this.bufferingComplete = false;
    this.chunkCount = 0;
    this.streamBuffer = [];
    this.initialBuffer = [];
    
    // クリーンアップイベントを発火
    this.emit('cleanup');
  }
  
  /**
   * 音量調整
   */
  private adjustVolume(audioData: Buffer, scale: number): Buffer {
    const samples = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.length / 2);
    const adjusted = new Int16Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      adjusted[i] = Math.round(samples[i] * scale);
    }
    
    return Buffer.from(adjusted.buffer);
  }
  
  /**
   * 現在の状態を取得
   */
  getState() {
    return {
      isRecording: this.isRecording,
      isPlaying: this.isPlaying,
      queueLength: this.audioQueue.length
    };
  }
  
  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.isRecording && this.recordingProcess) {
      this.recordingProcess.kill('SIGTERM');
    }
    this.audioQueue = [];
    this.isPlaying = false;
    this.isRecording = false;
    
    // ストリーミング関連のクリーンアップ
    await this.cleanupStreaming();
  }
}