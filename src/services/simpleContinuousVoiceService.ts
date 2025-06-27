import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { spawn } from 'child_process';

interface SimpleContinuousVoiceConfig {
  apiKey?: string;  // プロキシ使用時は不要
  hotwords?: string[];
  recordDuration?: number;
  checkInterval?: number;
  language?: 'en-US' | 'ja-JP';
  useProxy?: boolean;  // プロキシ使用フラグ
  logger?: (message: string) => void;  // ログ関数
}

/**
 * SimpleContinuousVoiceService - Realtime API無しのシンプルな音声監視
 * 
 * ホットワード検出に特化し、検出後の処理は外部に委譲
 * OpenAI Realtime APIは使用しない
 */
export class SimpleContinuousVoiceService extends EventEmitter {
  private apiKey?: string;
  private hotwords: string[];
  private recordDuration: number;
  private checkInterval: number;
  private language: string;
  private isListening: boolean = false;
  private isInConversation: boolean = false;
  private listeningInterval: NodeJS.Timeout | null = null;
  private useProxy: boolean;
  private isCheckingHotword: boolean = false;  // 重複チェック防止
  private log: (message: string) => void;  // ログ関数
  
  constructor(config: SimpleContinuousVoiceConfig) {
    super();
    this.apiKey = config.apiKey;
    this.useProxy = config.useProxy ?? true;  // デフォルトでプロキシを使用
    this.hotwords = config.hotwords || ['Hey Anicca', 'Anicca', 'アニッチャ'];
    this.recordDuration = config.recordDuration || 2000; // 2秒
    this.checkInterval = config.checkInterval || 500; // 0.5秒間隔
    this.language = config.language || 'ja-JP';
    this.log = config.logger || console.log;  // ログ関数（デフォルトはconsole.log）
    
    this.log('🎤 Simple Continuous Voice Service initialized');
    this.log(`🎯 Listening for: ${this.hotwords.join(', ')}`);
    this.log(`🌐 Using ${this.useProxy ? 'proxy' : 'direct API'} mode`);
  }
  
  /**
   * 音声監視を開始
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      return;
    }
    
    this.isListening = true;
    this.log('👂 Started continuous listening...');
    this.log(`🔄 Check interval: ${this.checkInterval}ms`);
    this.log(`🎙️ Record duration: ${this.recordDuration}ms`);
    
    // 最初のチェックを即座に実行
    this.log('🚀 Starting first hotword check immediately...');
    this.checkForHotword().catch(error => {
      this.log(`❌ First hotword check error: ${error}`);
    });
    
    // 監視ループを開始（高速化：連続的にチェック）
    this.listeningInterval = setInterval(async () => {
      if (!this.isListening || this.isInConversation) {
        return;
      }
      
      try {
        await this.checkForHotword();
      } catch (error) {
        this.log(`❌ Hotword check error: ${error}`);
      }
    }, this.checkInterval); // 500ms間隔で高速チェック
  }
  
  /**
   * 音声監視を停止
   */
  stopListening(): void {
    this.isListening = false;
    
    if (this.listeningInterval) {
      clearInterval(this.listeningInterval);
      this.listeningInterval = null;
    }
    
    this.log('🛑 Stopped continuous listening');
  }
  
  /**
   * ホットワードをチェック
   */
  private async checkForHotword(): Promise<void> {
    // 既に処理中の場合はスキップ
    if (this.isCheckingHotword) {
      this.log('⏭️ Skipping - already checking hotword');
      return;
    }
    
    this.isCheckingHotword = true;
    
    try {
      this.log('🔍 checkForHotword: Starting hotword detection cycle');
      
      // SOXで短い録音を実行
      const audioData = await this.recordWithSOX(this.recordDuration);
      this.log(`🛑 checkForHotword: Recording stopped - got ${audioData.length} bytes`);
      
      // Whisper APIで音声認識
      this.log('🗣️ checkForHotword: Calling transcribeAudio...');
      const transcription = await this.transcribeAudio(audioData);
      this.log(`📝 checkForHotword: Transcription result: ${transcription ? `"${transcription}"` : 'null'}`);
      
      if (transcription) {
        this.log(`🎧 Heard: "${transcription}"`);
        
        // ホットワードチェック
        const detected = this.checkHotwordInText(transcription);
        if (detected) {
          this.log(`🎯 Hotword detected: "${detected}"`);
          this.isInConversation = true;
          this.emit('hotword-detected', detected);
        }
      }
    } catch (error) {
      // すべてのエラーをログ出力
      if (error instanceof Error) {
        if (error.message.includes('Already recording')) {
          this.log('⚠️ checkForHotword: Already recording - skipping this cycle');
        } else {
          this.log(`❌ checkForHotword error: ${error.message}`);
          this.log(`Stack trace: ${error.stack}`);
        }
      } else {
        this.log(`❌ checkForHotword: Unknown error: ${error}`);
      }
    } finally {
      this.isCheckingHotword = false;  // 処理完了をマーク
    }
  }
  
  /**
   * SOXで指定時間録音
   */
  private async recordWithSOX(duration: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const audioChunks: Buffer[] = [];
      
      this.log(`📼 Recording with SOX for ${duration}ms...`);
      
      // SOXコマンドで録音（WAVフォーマットで直接出力）
      this.log(`🎤 Spawning SOX process...`);
      const recordProcess = spawn('rec', [
        '-q',           // 静音モード
        '-r', '16000',  // サンプリングレート 16kHz
        '-c', '1',      // モノラル
        '-e', 'signed-integer', // エンコーディング
        '-b', '16',     // ビット深度
        '-t', 'wav',    // WAVフォーマット
        '-'             // 標準出力に出力
      ]);
      
      this.log(`🎤 SOX process spawned with PID: ${recordProcess.pid}`);
      
      recordProcess.stdout.on('data', (chunk) => {
        audioChunks.push(chunk);
      });
      
      recordProcess.on('error', (error) => {
        this.log(`❌ SOX recording error: ${error}`);
        reject(error);
      });
      
      recordProcess.on('close', (code) => {
        if (code === 0) {
          const audioData = Buffer.concat(audioChunks);
          this.log(`✅ SOX recording completed: ${audioData.length} bytes`);
          resolve(audioData);
        } else {
          reject(new Error(`SOX process exited with code ${code}`));
        }
      });
      
      // 指定時間後に録音を停止
      setTimeout(() => {
        recordProcess.kill('SIGTERM');
      }, duration);
    });
  }
  
  /**
   * 音声をテキストに変換（Whisper API）- リトライ機能付き
   */
  async transcribeAudio(audioData: Buffer): Promise<string | null> {
    this.log(`🎙️ transcribeAudio called with data size: ${audioData.length} bytes`);
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    // リトライループ
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // リトライの場合は待機（指数バックオフ）
        if (attempt > 1) {
          const waitTime = Math.pow(2, attempt - 1) * 1000; // 1秒, 2秒, 4秒
          this.log(`🔄 Retrying Whisper API (attempt ${attempt}/${maxRetries}) after ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // WebMまたはWAVデータをチェック
        const isWAV = audioData.slice(0, 4).toString() === 'RIFF';
        const isWebM = audioData.slice(0, 4).toString('hex') === '1a45dfa3';
        const first4Bytes = audioData.slice(0, 4).toString('hex');
        
        this.log(`📊 Audio format check - First 4 bytes: ${first4Bytes}, isWAV: ${isWAV}, isWebM: ${isWebM}`);
        
        // ファイルサイズチェック（25MB制限）
        const fileSizeMB = audioData.length / (1024 * 1024);
        this.log(`📏 Audio file size: ${fileSizeMB.toFixed(2)}MB`);
        
        if (fileSizeMB > 25) {
          this.log(`⚠️ Audio file too large: ${fileSizeMB.toFixed(2)}MB (max 25MB)`);
          return null;
        }
        
        // プロキシ使用時はBase64エンコード
        if (this.useProxy) {
          const audioBase64 = audioData.toString('base64');
          const proxyUrl = 'https://anicca-proxy-ten.vercel.app/api/whisper';
          
          this.log(`🌐 Using proxy mode - Base64 size: ${audioBase64.length} chars`);
          this.log(`📤 Sending to proxy: ${proxyUrl}`);
          
          // AbortControllerでタイムアウト設定
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
            this.log('⏰ Whisper API request timeout (30s)');
          }, 30000); // 30秒タイムアウト

          try {
            const response = await fetch(proxyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                audio: audioBase64,
                language: this.language === 'ja-JP' ? 'ja' : 'en'
              }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.log(`📥 Proxy response status: ${response.status}`);
            
            if (!response.ok) {
              const errorText = await response.text();
              this.log(`❌ Proxy error response: ${errorText}`);
              throw new Error(`Proxy API error: ${response.status}`);
            }
            
            const result = await response.json() as { success: boolean; text: string };
            this.log(`✅ Proxy response: ${JSON.stringify(result)}`);
            
            if (!result.success) {
              throw new Error('Proxy transcription failed');
            }
            return result.text.trim();
            
          } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
          }
          
        } else {
          // 直接API使用（従来の実装）
          const form = new FormData();
          const filename = isWebM ? `audio_${Date.now()}.webm` : `audio_${Date.now()}.wav`;
          const contentType = isWebM ? 'audio/webm' : 'audio/wav';
          
          form.append('file', audioData, {
            filename: filename,
            contentType: contentType
          });
          form.append('model', 'whisper-1');
          form.append('prompt', this.hotwords.join(', '));
        
          // AbortControllerでタイムアウト設定
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
            this.log('⏰ Whisper API request timeout (30s)');
          }, 30000); // 30秒タイムアウト

          try {
            // Whisper APIにリクエスト
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                ...form.getHeaders()
              },
              body: form,
              signal: controller.signal
            });
            
            // タイムアウトをクリア
            clearTimeout(timeoutId);
          
            if (!response.ok) {
              throw new Error(`Whisper API error: ${response.status}`);
            }
          
            const result = await response.json() as { text: string };
            return result.text.trim();
            
          } catch (fetchError) {
            // タイムアウトの場合は再度クリア（念のため）
            clearTimeout(timeoutId);
            throw fetchError;
          }
        }
      
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (error instanceof Error && error.name === 'AbortError') {
          this.log(`❌ Attempt ${attempt}: Whisper API timeout`);
        } else {
          this.log(`❌ Attempt ${attempt}: Transcription error: ${error}`);
        }
        
        // 最後の試行でなければ続行
        if (attempt < maxRetries) {
          continue;
        }
      }
    }
    
    // すべての試行が失敗
    this.log(`❌ All Whisper API attempts failed: ${lastError?.message}`);
    this.log('⚠️ transcribeAudio returning null');
    return null;
  }
  
  /**
   * テキスト内のホットワードをチェック
   */
  private checkHotwordInText(text: string): string | null {
    const lowerText = text.toLowerCase();
    
    for (const hotword of this.hotwords) {
      if (lowerText.includes(hotword.toLowerCase())) {
        return hotword;
      }
    }
    
    // 部分一致も許可（例: "anicca" が "anita" と認識される場合）
    for (const hotword of this.hotwords) {
      const hotwordLower = hotword.toLowerCase();
      if (this.fuzzyMatch(lowerText, hotwordLower)) {
        return hotword;
      }
    }
    
    return null;
  }
  
  /**
   * あいまい一致チェック
   */
  private fuzzyMatch(text: string, pattern: string): boolean {
    // 簡易的な実装：編集距離が2以下なら一致とみなす
    const words = text.split(/\s+/);
    for (const word of words) {
      if (this.levenshteinDistance(word, pattern) <= 2) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * レーベンシュタイン距離を計算
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  /**
   * 会話モードを終了
   */
  endConversation(): void {
    this.isInConversation = false;
    this.log('👂 Returning to hotword detection mode');
  }
  
  
  /**
   * 現在の状態を取得
   */
  getState() {
    return {
      isListening: this.isListening,
      isInConversation: this.isInConversation,
      hotwords: this.hotwords
    };
  }
  
  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    this.stopListening();
  }
}