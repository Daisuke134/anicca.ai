import { RealtimeSession, OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
import { createAniccaAgent } from './mainAgent';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import express, { Request, Response } from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export class AniccaSessionManager {
  private session: RealtimeSession | null = null;
  private agent: any = null;
  private sessionFilePath: string;
  private apiKey: string | null = null;
  private isReconnecting: boolean = false;
  
  // Keep-alive機能
  private keepAliveInterval: NodeJS.Timeout | null = null;
  
  // Express関連
  private app: express.Application | null = null;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private wsClients = new Set<WebSocket>();
  
  // 状態管理
  private currentUserId: string | null = null;
  private currentPort: number = 8085; // デフォルトポート
  private isElevenLabsPlaying: boolean = false;
  
  // text_to_speech重複防止
  private lastElevenLabsExecutionTime = 0;
  private readonly ELEVENLABS_COOLDOWN = 3000; // 3秒のクールダウン
  private isElevenLabsExecuting = false; // ElevenLabs実行中フラグ追加
  private taskState = {
    isExecuting: false,
    currentTask: null as any,
    startedAt: null as number | null
  };
  
  constructor(private mainAgent?: any) {
    this.sessionFilePath = path.join(os.homedir(), '.anicca', 'session.json');
  }
  
  async initialize() {
    // エージェント作成
    this.agent = this.mainAgent || await createAniccaAgent(this.currentUserId);

    // WebSocketトランスポートのインスタンスを明示的に作成
    const transport = new OpenAIRealtimeWebSocket();
    
    // セッション作成（WebSocketトランスポート使用）
    this.session = new RealtimeSession(this.agent, {
      model: 'gpt-4o-mini-realtime-preview-2024-12-17',
      transport: transport,  // ← インスタンスで指定
      config: {
        turnDetection: {
          type: 'semantic_vad',
          eagerness: 'medium',    // ユーザー発話終了後、即座に応答開始
          createResponse: true,
          interruptResponse: true,
        },
      }
    });

    // イベントハンドラー設定
    this.setupEventHandlers();
    
    // WebSocket keep-alive設定
    this.startKeepAlive();
    
    // 注意: restoreSession()はconnect()の後で呼ぶ必要がある
  }

  // Express/WebSocketサーバー起動（新規追加）
  async startBridge(port: number) {
    if (this.app) return; // 既に起動済み
    
    this.currentPort = port; // ポート番号を保存
    this.app = express();
    this.app.use(express.json());
    
    // ルート設定
    this.setupRoutes();
    
    // HTTPサーバー起動
    this.httpServer = http.createServer(this.app);
    
    // WebSocket設定
    this.setupWebSocket();
    
    // サーバー起動
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, () => {
        console.log(`🌉 Bridge server started on port ${port}`);
        resolve();
      });
    });
  }

  // ルート設定
  private setupRoutes() {
    if (!this.app) return;
    
    // 1. /session - hiddenWindow用（必須）
    this.app.get('/session', async (req, res) => {
      try {
        const userId = req.query.userId as string || this.currentUserId;
        console.log('📡 Session request:', { userId });
        
        // プロキシから設定取得（既存ロジック）
        const PROXY_BASE_URL = process.env.PROXY_BASE_URL || 'https://anicca-proxy-staging.up.railway.app';
        const response = await fetch(`${PROXY_BASE_URL}/api/openai-proxy/session${userId ? `?userId=${userId}` : ''}`);
        const data = await response.json();
        
        res.json(data);
      } catch (error) {
        console.error('Session error:', error);
        res.status(500).json({ error: 'Failed to get session' });
      }
    });
    
    // 3. /auth/complete - OAuth完了
    this.app.post('/auth/complete', async (req, res) => {
      try {
        const { access_token, refresh_token, expires_at } = req.body;
        console.log('🔐 Received auth tokens');
        
        // desktopAuthService経由で処理
        const { getAuthService } = await import('../services/desktopAuthService');
        const authService = getAuthService();
        
        const success = await authService.handleTokens({
          access_token,
          refresh_token,
          expires_at: parseInt(expires_at)
        });
        
        if (!success) {
          throw new Error('Failed to authenticate');
        }
        
        const user = authService.getCurrentUser();
        if (user) {
          this.setCurrentUserId(user.id);
          console.log(`✅ User authenticated: ${user.email}`);
          
          // メインプロセスに通知
          if ((global as any).onUserAuthenticated) {
            (global as any).onUserAuthenticated(user);
          }
        }
        
        res.json({ success: true });
      } catch (error) {
        console.error('Auth complete error:', error);
        res.status(500).json({ error: 'Failed to complete authentication' });
      }
    });
    
    // 4. /auth/callback - OAuthコールバック
    this.app.get('/auth/callback', async (req, res) => {
      try {
        console.log('📥 Auth callback received');
        
        // HTMLページ返却（動的ポート番号を使用）
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>認証成功 - Anicca</title>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              h1 { color: #333; }
              p { color: #666; margin: 20px 0; }
              .success { color: #4CAF50; font-size: 48px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅</div>
              <h1>認証が完了しました</h1>
              <p>このウィンドウは自動的に閉じられます...</p>
            </div>
            <script>
              const hash = window.location.hash.substring(1);
              const params = new URLSearchParams(hash);
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              const expiresAt = params.get('expires_at');
              
              if (accessToken && refreshToken) {
                fetch(\`http://localhost:${this.currentPort}/auth/complete\`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: expiresAt
                  })
                }).then(() => {
                  setTimeout(() => window.close(), 2000);
                });
              } else {
                console.error('No tokens found in URL');
              }
            </script>
          </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (error) {
        console.error('Auth callback error:', error);
        res.status(500).send('Authentication error');
      }
    });
    
    // 5. その他のエンドポイント
    this.app.get('/task-status', (req, res) => {
      if (this.taskState.isExecuting) {
        const elapsed = Date.now() - (this.taskState.startedAt || 0);
        const elapsedSeconds = Math.floor(elapsed / 1000);
        res.json({
          isExecuting: true,
          currentTask: this.taskState.currentTask,
          elapsedSeconds: elapsedSeconds
        });
      } else {
        res.json({
          isExecuting: false,
          currentTask: null,
          elapsedSeconds: 0
        });
      }
    });
    
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // 6. メインページ
    this.app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'Anicca SDK Bridge Server',
        endpoints: {
          session: '/session',
          taskStatus: '/task-status',
          health: '/health',
          audioInput: '/audio/input',
          sdkStatus: '/sdk/status'
        }
      });
    });
    
    // 7. 音声入力エンドポイント（新規追加）
    this.app.post('/audio/input', async (req, res) => {
      try {
        if (!this.session || !this.isConnected()) {
          res.status(400).json({ error: 'Session not connected' });
          return;
        }

        // Base64エンコードされたPCM16音声データを受け取る
        const audioData = Buffer.from(req.body.audio, 'base64');
        
        // SDKにPCM16形式の音声データを送信
        await this.session.sendAudio(audioData.buffer as ArrayBuffer);
        
        res.json({ success: true, format: 'pcm16' });
      } catch (error: any) {
        console.error('Audio input error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // 8. SDK状態確認エンドポイント（新規追加）
    this.app.get('/sdk/status', (req, res) => {
      res.json({
        connected: this.isConnected(),
        hasAgent: !!this.agent,
        userId: this.currentUserId,
        useSDK: true,  // SDK使用フラグ
        transport: 'websocket'  // トランスポート情報
      });
    });

    // 9. ElevenLabs再生状態の通知を受け取る
    this.app.post('/elevenlabs/status', (req, res) => {
      const { status } = req.body; // 'playing' | 'completed'
      
      if (status === 'playing') {
        this.isElevenLabsPlaying = true;
        console.log('🎵 ElevenLabs playback started - Anicca muted');
      } else if (status === 'completed') {
        this.isElevenLabsPlaying = false;
        console.log('✅ ElevenLabs playback completed - Anicca unmuted');
      }
      
      res.json({ success: true });
    });
  }

  // WebSocket設定
  private setupWebSocket() {
    if (!this.httpServer) return;
    
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.wss.on('connection', (ws) => {
      console.log('🔌 WebSocket client connected');
      this.wsClients.add(ws);
      
      // 定期タスクメッセージハンドラーを追加
      ws.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data);
          
          if (message.type === 'scheduled_task') {
            console.log('📅 Scheduled task received:', message.command);
            
            // 慈悲の瞑想タスクの場合の特別処理
            if (message.taskType === 'jihi_meditation') {
              console.log('🧘 慈悲の瞑想モード開始（ElevenLabs読み上げ）');
              // ElevenLabsで処理するため、特別な割り込み防止は不要
            }
            
            // メッセージ送信（共通）
            if (this.session && this.isConnected()) {
              await this.sendMessage(message.command);
              console.log('✅ Task sent to Anicca');
              
              // タスク受付の応答
              ws.send(JSON.stringify({
                type: 'scheduled_task_accepted',
                message: 'タスクを受け付けました'
              }));
            } else {
              console.error('❌ Session not connected, cannot execute scheduled task');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not connected'
              }));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.wsClients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  // WebSocketブロードキャスト
  private broadcast(message: any) {
    const data = JSON.stringify(message);
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // ユーザーID管理
  setCurrentUserId(userId: string | null) {
    this.currentUserId = userId;
    console.log(`👤 Current user ID set to: ${userId}`);
    
    // 環境変数にも設定（tools.tsが参照）
    if (userId) {
      process.env.CURRENT_USER_ID = userId;
    }
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
  
  // WebSocket Keep-alive機能
  private keepAliveErrors = 0;  // エラーカウンター追加
  
  private startKeepAlive() {
    // 既存のインターバルをクリア
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    
    // 30秒ごとにkeep-aliveを送信
    this.keepAliveInterval = setInterval(async () => {
      if (this.session && this.isConnected()) {
        try {
          // 修正: sendMessageでテキストping送信（エラーにならない）
          await this.sendMessage(" ");  // スペース1文字
          console.log('💓 Keep-alive sent');
          this.keepAliveErrors = 0;  // 成功時はカウンターリセット
        } catch (error) {
          console.error('❌ Keep-alive failed:', error);
          this.keepAliveErrors++;
          // 修正: 3回失敗で再接続（頻繁な再接続を防ぐ）
          if (!this.isReconnecting && this.apiKey && this.keepAliveErrors > 3) {
            await this.handleReconnection();
            this.keepAliveErrors = 0;
          }
        }
      }
    }, 30000); // 30秒ごと
    
    console.log('✅ Keep-alive started (30s interval)');
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      console.log('🛑 Keep-alive stopped');
    }
  }

  // 再接続処理の共通化
  private async handleReconnection() {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    console.log('🔄 Attempting reconnection...');
    
    // keep-aliveを一時停止
    this.stopKeepAlive();
    
    try {
      // 既存セッションをクリーンアップ
      if (this.session) {
        this.session.close();
      }
      
      // 再初期化
      await this.initialize();
      await this.connect(this.apiKey!);
      
      console.log('✅ Reconnected successfully');
      this.broadcast({ type: 'websocket_reconnected' });
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      // 5秒後に再試行
      setTimeout(() => {
        this.isReconnecting = false;
        this.handleReconnection();
      }, 5000);
    } finally {
      this.isReconnecting = false;
    }
  }

  private setupEventHandlers() {
    if (!this.session) return;

    // 音声データイベント（transport経由）
    this.session.transport.on('audio', (event: any) => {
      // ElevenLabs再生中は音声出力を送信しない
      if (this.isElevenLabsPlaying) {
        // ログは出さない（大量に出るため）
        return;
      }
      
      // PCM16形式の音声データをWebSocketにブロードキャスト
      this.broadcast({
        type: 'audio_output',
        data: Buffer.from(event.data).toString('base64'),
        format: 'pcm16'
      });
    });

    // 音声開始/終了
    this.session.on('audio_start', () => {
      // ElevenLabs再生中は無視
      if (this.isElevenLabsPlaying) {
        console.log('🔇 Ignoring Anicca audio_start during ElevenLabs playback');
        return;
      }
      console.log('🔊 Agent started speaking');
      this.broadcast({ type: 'audio_start' });
    });

    this.session.on('audio_stopped', () => {
      // ElevenLabs再生中は無視
      if (this.isElevenLabsPlaying) {
        console.log('🔇 Ignoring Anicca audio_stopped during ElevenLabs playback');
        return;
      }
      console.log('🔊 Agent stopped speaking');
      this.broadcast({ type: 'audio_stopped' });
    });

    // 音声中断処理（transport経由）
    this.session.transport.on('audio_interrupted', () => {
      // ElevenLabs再生中は割り込みを無視（慈悲の瞑想はElevenLabsで処理）
      if (this.isElevenLabsPlaying) {
        console.log('🔇 ElevenLabs再生中 - 割り込みを無視');
        return;
      }
      
      console.log('⚠️ Audio interrupted');
      this.broadcast({ type: 'audio_interrupted' });
    });

    // WebSocket切断/エラー検知（transport層）
    if (this.session?.transport) {
      // WebSocket切断イベント
      this.session.transport.on('close', async () => {
        console.error('🔌 WebSocket disconnected!');
        this.broadcast({ type: 'websocket_disconnected' });
        
        // 自動再接続
        if (!this.isReconnecting && this.apiKey) {
          await this.handleReconnection();
        }
      });
      
      // WebSocketエラーイベント  
      this.session.transport.on('error', (error: any) => {
        console.error('🔌 WebSocket error:', error);
        // エラー種別によって処理を分岐
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          if (!this.isReconnecting && this.apiKey) {
            this.handleReconnection();
          }
        }
      });
    }

    // ツール実行イベント（正しいプロパティ名）
    this.session.on('agent_tool_start', async (context: any, agent: any, tool: any, details: any) => {
      const toolName = tool.name;  // ← 正しいプロパティ
      console.log(`🔧 SDK自動実行開始: ${toolName}`);
      
      // text_to_speech重複防止チェック
      if (toolName === 'text_to_speech') {
        // 実行中なら即座にブロック
        if (this.isElevenLabsExecuting) {
          console.warn('❌ ElevenLabs既に実行中 - 完全にブロック');
          return;
        }
        
        // クールダウンチェック
        const now = Date.now();
        if (now - this.lastElevenLabsExecutionTime < this.ELEVENLABS_COOLDOWN) {
          console.warn('❌ ElevenLabs実行が3秒以内で重複 - ブロック');
          return;
        }
        
        // 実行開始をマーク
        this.isElevenLabsExecuting = true;
        this.lastElevenLabsExecutionTime = now;
      }
      
      // タスク状態更新
      this.taskState.isExecuting = true;
      this.taskState.currentTask = toolName;
      this.taskState.startedAt = Date.now();
      
      // WebSocketで通知
      this.broadcast({
        type: 'tool_execution_start',
        toolName: toolName,
        args: details.toolCall
      });
    });

    this.session.on('agent_tool_end', async (context: any, agent: any, tool: any, result: any, details: any) => {
      const toolName = tool.name;  // ← 正しいプロパティ
      console.log(`✅ SDK自動実行完了: ${toolName}`);
      console.log(`結果: ${JSON.stringify(result)}`);
      
      // ElevenLabs音声データの処理
      if (toolName === 'text_to_speech') {
        // 実行完了をマーク
        this.isElevenLabsExecuting = false;
        console.log('✅ ElevenLabs実行完了 - フラグクリア');
        
        // OpenAI SDKはツール結果を文字列化するので、パースが必要
        let parsedResult = result;
        if (typeof result === 'string') {
          try {
            parsedResult = JSON.parse(result);
          } catch (e) {
            console.error('Failed to parse result:', e);
          }
        }
        
        if (parsedResult?.audioBase64) {
          console.log('🎵 Sending ElevenLabs audio to client for playback');
          
          // 即座にElevenLabs再生フラグを設定（interrupt前に設定）
          this.isElevenLabsPlaying = true;
          console.log('🔇 Pre-emptively muting Anicca for ElevenLabs playback');
          
          // OpenAI Realtimeの現在の応答を中断（音声競合回避）
          if (this.session) {
            try {
              await this.session.interrupt();
              console.log('🛑 OpenAI session interrupted for ElevenLabs playback');
            } catch (error) {
              console.warn('Failed to interrupt session:', error);
            }
          }
          
          this.broadcast({
            type: 'elevenlabs_audio',
            audioBase64: parsedResult.audioBase64
          });
        }
      }
      
      // タスク状態更新
      this.taskState.isExecuting = false;
      this.taskState.currentTask = null;
      this.taskState.startedAt = null;
      
      // WebSocketで通知
      this.broadcast({
        type: 'tool_execution_complete',
        toolName: toolName,
        result: result
      });
    });

    // エラー処理
    this.session.on('error', async (error: any) => {
      console.error('❌ Session error:', error);
      
      // empty_arrayエラーの特別処理
      if (error?.error?.error?.code === 'empty_array') {
        console.error('🔴 Empty array error detected - Invalid content in history');
        console.error('🔴 Message:', error.error.error.message);
        
        // historyプロパティを使用（getHistory()ではない）
        if (this.session && this.session.history) {
          const currentHistory = this.session.history;
          const problematicItems = currentHistory.filter((item: any) => 
            !item.content || (Array.isArray(item.content) && item.content.length === 0)
          );
          
          if (problematicItems.length > 0) {
            console.error(`🔴 Found ${problematicItems.length} items with empty content`);
            // 自動的にクリーンアップ
            const cleanedHistory = currentHistory.filter((item: any) => 
              item.content && Array.isArray(item.content) && item.content.length > 0
            );
            this.session.updateHistory(cleanedHistory);
            console.log('✅ History cleaned automatically');
          }
        }
      }
      
      this.broadcast({ type: 'error', error: error.message });
      
      // 自動再接続（handleReconnection()を使用）
      if (!this.isReconnecting && this.apiKey) {
        await this.handleReconnection();
      }
    });

    // 履歴更新時に保存
    this.session.on('history_updated', async (history: any) => {
      console.log('📝 History updated, length:', history?.length);
      
      // 慈悲の瞑想はElevenLabsで処理するため、終了検知は不要
      
      await this.saveSession(history);
    });

  }
  
  async connect(apiKey: string) {
    if (!this.session) throw new Error('Session not initialized');
    
    this.apiKey = apiKey;
    await this.session.connect({ apiKey });
    console.log('✅ Connected to OpenAI Realtime API');
    
    // 接続後に履歴を復元
    await this.restoreSession();
    
    // Slack接続状態を確認
    await this.checkSlackConnection();
    
    // Serenaの記憶を確認
    await this.checkMemories();
  }
  
  async disconnect() {
    // keep-aliveを停止
    this.stopKeepAlive();
    
    if (this.session) {
      this.session.close();
      console.log('🔌 Disconnected from OpenAI Realtime API');
    }
    this.apiKey = null;
  }
  
  async sendAudio(audioData: Uint8Array) {
    if (!this.session) throw new Error('Session not connected');
    
    // ElevenLabs再生中は音声入力を無視（慈悲の瞑想はElevenLabsで処理）
    if (this.isElevenLabsPlaying) {
      console.log('🔇 Ignoring audio input during ElevenLabs');
      return;
    }
    
    await this.session.sendAudio(audioData.buffer as ArrayBuffer);
  }
  
  async sendMessage(message: string) {
    if (!this.session) throw new Error('Session not connected');
    
    // 空メッセージチェック
    if (!message || !message.trim()) {
      console.warn('⚠️ Empty message, skipping send');
      return;
    }
    
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
      
      if (!this.isElevenLabsPlaying) {
        console.log('💾 Session saved');
      }
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }
  
  public async restoreSession() {
    try {
      const data = await fs.readFile(this.sessionFilePath, 'utf8');
      
      // 空ファイルチェック
      if (!data.trim()) {
        console.log('📂 Session file is empty, skipping restore');
        return;
      }
      
      // JSONパースエラー対策
      let sessionData;
      try {
        sessionData = JSON.parse(data);
      } catch (parseError) {
        console.error('❌ Session file corrupted, resetting:', parseError);
        // 壊れたセッションファイルを削除
        await fs.unlink(this.sessionFilePath).catch(() => {});
        return;
      }
      
      if (sessionData.history && this.session && typeof this.session.updateHistory === 'function') {
        // 不正なデータをフィルタリング
        const cleanedHistory = sessionData.history
          .filter((item: any) => {
            // contentが存在しない、または空配列の場合は除外
            if (!item.content || (Array.isArray(item.content) && item.content.length === 0)) {
              return false;
            }
            
            // nullのaudio contentを持つ項目を除外
            if (item.content && Array.isArray(item.content)) {
              return !item.content.some((c: any) => c.audio === null);
            }
            return true;
          })
          .map((item: any) => {
            if (item.status === 'in_progress') {
              return { ...item, status: 'incomplete' };
            }
            return item;
          });
        
        // セッション履歴を復元
        this.session.updateHistory(cleanedHistory);
        console.log('📂 Session restored (cleaned)');
      }
    } catch (error: any) {
      // ファイルが存在しない場合は無視
      if (error.code === 'ENOENT') {
        console.log('📂 No previous session found');
      } else {
        console.error('Failed to restore session:', error);
      }
    }
  }
  
  private broadcastAudioToClient(audioData: any) {
    // WebSocketで音声データをブロードキャスト
    this.broadcast({
      type: 'audio_data',
      data: audioData
    });
  }
  
  getSession() {
    return this.session;
  }
  
  isConnected() {
    return this.session !== null && this.apiKey !== null;
  }

  // クリーンアップ

  // Slack接続確認
  async checkSlackConnection(): Promise<{ connected: boolean; teamName?: string; tokens?: any }> {
    try {
      if (!this.currentUserId) {
        console.log('⚠️ No user ID available for Slack connection check');
        return { connected: false };
      }

      console.log('🔍 Checking Slack connection for user:', this.currentUserId);
      
      const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getTokens',
          arguments: {},
          userId: this.currentUserId
        })
      });

      if (!response.ok) {
        console.log('❌ Failed to check Slack connection:', response.status);
        return { connected: false };
      }

      const data = await response.json();
      
      if (data.bot_token) {
        console.log('✅ Connected to Slack workspace:', data.team_name || 'Unknown workspace');
        
        // WebSocket経由で通知
        this.broadcast({
          type: 'slack_connected',
          teamName: data.team_name,
          userId: this.currentUserId
        });
        
        return {
          connected: true,
          teamName: data.team_name,
          tokens: {
            bot_token: data.bot_token,
            user_token: data.user_token,
            userId: this.currentUserId
          }
        };
      } else {
        console.log('❌ No Slack tokens found - please connect Slack first');
        return { connected: false };
      }
    } catch (error) {
      console.error('❌ Error checking Slack connection:', error);
      return { connected: false };
    }
  }

  // 起動時にanicca.mdの記憶を自動読み込み
  private async checkMemories() {
    try {
      console.log('📚 Loading user memories from anicca.md...');
      
      const aniccaPath = path.join(os.homedir(), '.anicca', 'anicca.md');
      
      // ファイルが存在しない場合は作成
      if (!await fs.access(aniccaPath).then(() => true).catch(() => false)) {
        const initialContent = `# ユーザー情報
- 名前: 

# Slack設定
- よく使うチャンネル: 
- 返信スタイル:

# 習慣・ルーティン

# 重要な会話履歴
`;
        await fs.writeFile(aniccaPath, initialContent, 'utf-8');
        console.log('📝 Created initial anicca.md');
        return;
      }
      
      // 記憶を読み込み
      const memories = await fs.readFile(aniccaPath, 'utf-8');
      
      // 記憶が空でない場合、システムメッセージとして送信
      if (memories.trim()) {
        // Aniccaに記憶を認識させる
        const systemMessage = `以下はあなたのユーザーについての記憶です。この情報は既に読み込み済みとして扱い、会話の前提としてください：

${memories}

重要：新しい情報を得たら、必ずread_fileで既存内容を確認してからwrite_fileで更新すること。この指示への返答は不要です。`;

        // RealtimeSessionのsendMessageメソッドを使用
        await this.session?.sendMessage(systemMessage);
        console.log('✅ User memories loaded successfully');
      }
    } catch (error) {
      console.error('Failed to load user memories:', error);
    }
  }

  async stop() {
    // keep-aliveを停止
    this.stopKeepAlive();
    
    // WebSocket切断
    this.wsClients.forEach(client => client.close());
    this.wsClients.clear();
    
    // サーバー停止
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
    
    // セッション切断
    await this.disconnect();
    
    console.log('🛑 SessionManager stopped');
  }
}