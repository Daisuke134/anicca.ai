import { RealtimeSession } from '@openai/agents/realtime';
import { createAniccaAgent } from './mainAgent';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

export class AniccaSessionManager {
  private session: RealtimeSession | null = null;
  private agent: any = null;
  private sessionFilePath: string;
  private apiKey: string | null = null;
  private isReconnecting: boolean = false;
  
  constructor(private mainAgent?: any) {
    this.sessionFilePath = path.join(os.homedir(), '.anicca', 'session.json');
  }
  
  async initialize() {
    // エージェント作成
    this.agent = this.mainAgent || createAniccaAgent();
    
    // セッション作成
    this.session = new RealtimeSession(this.agent, {
      model: 'gpt-4o-realtime-preview-2025-06-03',
      config: {
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    });
    
    // セッション履歴を復元
    await this.restoreSession();
    
    // イベントハンドラー設定
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    if (!this.session) return;
    
    // 音声出力処理
    this.session.on('audio_start', () => {
      console.log('🔊 Agent started speaking');
    });
    
    this.session.on('audio_stopped', () => {
      console.log('🔊 Agent stopped speaking');
    });
    
    // 音声中断処理
    this.session.on('audio_interrupted', () => {
      console.log('⚠️ Audio interrupted');
    });
    
    // エラー処理
    this.session.on('error', async (error: any) => {
      console.error('❌ Session error:', error);
      
      // 自動再接続（3秒後）
      if (!this.isReconnecting && this.apiKey) {
        this.isReconnecting = true;
        console.log('🔄 Attempting to reconnect in 3 seconds...');
        
        setTimeout(async () => {
          try {
            await this.connect(this.apiKey!);
            console.log('✅ Reconnected successfully');
          } catch (reconnectError) {
            console.error('❌ Reconnection failed:', reconnectError);
          } finally {
            this.isReconnecting = false;
          }
        }, 3000);
      }
    });
    
    // 履歴更新時に保存
    this.session.on('history_updated', async (history: any) => {
      await this.saveSession(history);
    });
    
    // 音声データ受信処理（Agentからの音声）
    this.session.on('audio', (audioEvent: any) => {
      // ブラウザに音声データを送信
      this.broadcastAudioToClient(audioEvent.data);
    });
  }
  
  async connect(apiKey: string) {
    if (!this.session) throw new Error('Session not initialized');
    
    this.apiKey = apiKey;
    await this.session.connect({ apiKey });
    console.log('✅ Connected to OpenAI Realtime API');
  }
  
  async disconnect() {
    if (this.session) {
      // RealtimeSessionでは接続管理は自動で行われるため、
      // 明示的なdisconnectは不要
      this.apiKey = null;
      console.log('👋 Disconnected from OpenAI Realtime API');
    }
  }
  
  async sendAudio(audioData: Uint8Array) {
    if (!this.session) throw new Error('Session not connected');
    
    // Uint8Array形式の音声データをそのまま送信
    // SDKが自動でPCM16形式に変換
    await this.session.sendAudio(audioData);
  }
  
  async sendMessage(message: string) {
    if (!this.session) throw new Error('Session not connected');
    await this.session.sendMessage(message);
  }
  
  private async saveSession(history: any) {
    try {
      const dir = path.dirname(this.sessionFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      const sessionData = {
        history,
        timestamp: new Date().toISOString()
      };
      
      await fs.writeFile(
        this.sessionFilePath,
        JSON.stringify(sessionData, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }
  
  public async restoreSession() {
    try {
      const data = await fs.readFile(this.sessionFilePath, 'utf8');
      const sessionData = JSON.parse(data);
      
      if (sessionData.history && this.session && typeof this.session.updateHistory === 'function') {
        // セッション履歴を復元
        this.session.updateHistory(sessionData.history);
        console.log('📚 Session history restored');
      }
    } catch (error: any) {
      // ファイルが存在しない場合は無視
      if (error.code !== 'ENOENT') {
        console.error('Failed to restore session:', error);
      }
    }
  }
  
  private broadcastAudioToClient(audioData: any) {
    // この部分はmain-voice-simple.tsでExpressサーバー経由で
    // ブラウザにWebSocketまたはHTTPで送信する
    // ここではイベントを発火させるだけ
    if (typeof process !== 'undefined' && typeof process.emit === 'function') {
      // Node.js環境でのみイベント発火
      (process as any).emit('audio-chunk', audioData);
    }
  }
  
  getSession() {
    return this.session;
  }
  
  isConnected() {
    return this.session && !this.isReconnecting;
  }
}