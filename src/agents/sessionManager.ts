import { RealtimeSession, OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
import { createAniccaAgent } from './mainAgent';
import { resolveGoogleCalendarMcp } from './remoteMcp';
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
  // 健全性トラッキング
  private clientSecretExpiresAt: number | null = null; // ms epoch
  private sessionStartedAt: number | null = null;      // ms epoch
  private lastServerEventAt: number | null = null;     // ms epoch
  private ready: boolean = false;
  private isEnsuring: boolean = false;                 // ensureConnected 並列抑止
  private restoredOnce: boolean = false;               // restoreSession 多重実行防止
  // 応答進行・自動送信用
  private isGenerating: boolean = false;
  private systemOpQueue: Array<{ kind: 'mem'|'tz'; payload?: any }> = [];
  private hasInformedTimezoneThisSession: boolean = false;
  private lastInformedTimezone: string | null = null;
  
  // Keep-alive機能
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private mcpRefreshInterval: NodeJS.Timeout | null = null;
  
  // Express関連
  private app: express.Application | null = null;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private wsClients = new Set<WebSocket>();
  
  // 状態管理
  private currentUserId: string | null = null;
  private currentPort: number = 8085; // デフォルトポート
  private isElevenLabsPlaying: boolean = false;
  private userTimezone: string | null = null;
  
  // text_to_speech重複防止
  private lastElevenLabsExecutionTime = 0;
  private readonly ELEVENLABS_COOLDOWN = 3000; // 3秒のクールダウン
  private isElevenLabsExecuting = false; // ElevenLabs実行中フラグ追加
  private taskState = {
    isExecuting: false,
    currentTask: null as any,
    startedAt: null as number | null
  };
  // Realtime履歴の新規アイテム検出用（MCP呼び出しの可視化）
  private lastLoggedHistoryIndex: number = 0;
  
  // ==== PTT: モード管理・自動終了 ====
  private mode: 'silent' | 'conversation' = 'silent';
  private autoExitTimer: NodeJS.Timeout | null = null;
  private autoExitDeadlineAt: number | null = null; // epoch(ms)
  private lastUserActivityAt: number | null = null; // epoch(ms)
  private lastAgentEndAt: number | null = null;     // epoch(ms)
  private readonly AUTO_EXIT_IDLE_MS = 60_000;      // 自動終了までの待機（10s）
  
  // （wake専用ループ／独自ゲートは撤廃）
  
  constructor(private mainAgent?: any) {
    this.sessionFilePath = path.join(os.homedir(), '.anicca', 'session.json');
  }
  
  // ======= 自動送信（mem/TZ）: キュー運用 + 応答を起動しない送信 =======
  private enqueueSystemOp(op: {kind:'mem'|'tz'; payload?: any}) {
    if (op.kind === 'tz') {
      const tz = this.userTimezone || null;
      if (!tz) return; // TZが無いなら送らない
      if (this.hasInformedTimezoneThisSession && this.lastInformedTimezone === tz) return;
    }
    this.systemOpQueue.push(op);
    console.log('[SYSOP_ENQUEUE]', op.kind);
  }

  private async flushSystemOpsIfIdle() {
    if (this.isGenerating || !this.ready) return;
    while (this.systemOpQueue.length > 0 && !this.isGenerating && this.ready) {
      const op = this.systemOpQueue.shift()!;
      console.log('[SYSOP_FLUSH]', op.kind);
      try {
        if (op.kind === 'mem') {
          await this.sendMemoriesSilently();
        } else if (op.kind === 'tz') {
          await this.sendTimezoneSilently();
        }
      } catch (e) {
        console.warn('[SYSOP_FAIL]', op.kind, e);
      }
    }
  }

  private async sendMemoriesSilently() {
    try {
      const aniccaPath = path.join(os.homedir(), '.anicca', 'anicca.md');
      if (!await fs.access(aniccaPath).then(() => true).catch(() => false)) return;
      const memories = await fs.readFile(aniccaPath, 'utf-8');
      if (!memories.trim()) return;
      const systemMessage =
        `以下はユーザーに関する記憶。会話の前提として内部で保持すること（返答不要）：\n\n${memories}`;
      // 応答を起動しない送信（transportレベル）
      (this.session as any)?.transport?.sendMessage?.(systemMessage, {}, { triggerResponse: false });
      console.log('[MEM_SENT_SILENTLY]');
    } catch (e) {
      console.warn('sendMemoriesSilently failed:', e);
    }
  }

  private async sendTimezoneSilently() {
    const tz = this.userTimezone || null;
    if (!tz) return;
    try {
      const msg = `System: User timezone is ${tz}. Use this timezone in calendar/tool calls.`;
      (this.session as any)?.transport?.sendMessage?.(msg, {}, { triggerResponse: false });
      this.hasInformedTimezoneThisSession = true;
      this.lastInformedTimezone = tz;
      console.log('[TZ_INFO_SENT]', { once: true, changed: true, triggerResponse: false });
    } catch (e) {
      console.warn('sendTimezoneSilently failed:', e);
    }
  }

  // --- 健全性ユーティリティ ---
  private tokenTTLSeconds(): number {
    if (!this.clientSecretExpiresAt) return Number.POSITIVE_INFINITY;
    return Math.floor((this.clientSecretExpiresAt - Date.now()) / 1000);
  }
  private sessionAgeSeconds(): number {
    if (!this.sessionStartedAt) return Number.POSITIVE_INFINITY;
    return Math.floor((Date.now() - this.sessionStartedAt) / 1000);
  }
  private isStale(): boolean {
    const transportOpen = (this.session?.transport?.status === 'connected');
    const lastEvOk = (Date.now() - (this.lastServerEventAt ?? 0)) <= 30_000; // 30s
    const ttlOk = this.tokenTTLSeconds() > 120; // >120s
    const ageOk = this.sessionAgeSeconds() < 3_000; // <50min
    return !(transportOpen && this.ready === true && lastEvOk && ttlOk && ageOk);
  }

  // --- 接続保証（入口一本化；並列抑止つき） ---
  private async ensureConnected(freshIfStale: boolean = true): Promise<void> {
    const need = (!this.session || !this.isConnected() || (freshIfStale && this.isStale()));
    if (!need) return;
    if (this.isEnsuring) {
      let waited = 0;
      while (this.isEnsuring && waited < 5000) { // 最大5s待つ
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
      // 既存ensure完了後に再評価。まだ必要ならこの呼び出しで接続を確立
      const stillNeed = (!this.session || !this.isConnected() || (freshIfStale && this.isStale()));
      if (!stillNeed) return;
    }
    this.isEnsuring = true;
    console.log('[ENSURE] refreshing realtime session...');
    try {
      await this.disconnect();
      await this.initialize();
      const { API_ENDPOINTS } = require('../config');
      const url = this.currentUserId
        ? `${API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION}?userId=${this.currentUserId}`
        : API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`desktop-session failed: ${resp.status}`);
      const data = await resp.json();
      const key = data?.client_secret?.value;
      const exp = data?.client_secret?.expires_at;
      if (!key) throw new Error('no client_secret');
      this.clientSecretExpiresAt = typeof exp === 'number' ? exp * 1000 : null;
      console.log('[TOKEN_ISSUED]');
      await this.connect(key);
      console.log('[CONNECT_OK]');
      // READY待ち（最大~6.3s）
      let delay = 100;
      for (let i = 0; i < 6; i++) {
        if (this.isConnected()) break;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // 100→200→400→800→1600→3200
      }
      if (!this.isConnected()) throw new Error('ready wait timeout');
      console.log('[READY]');
    } catch (e) {
      console.error('[ENSURE_FAIL]', e);
      throw e;
    } finally {
      this.isEnsuring = false;
    }
  }

  async initialize() {
    // エージェント作成
    this.agent = this.mainAgent || await createAniccaAgent(this.currentUserId);

    // WebSocketトランスポートのインスタンスを明示的に作成
    const transport = new OpenAIRealtimeWebSocket();
    
    // セッション作成（GA構成の音声設定）
    this.session = new RealtimeSession(this.agent, {
      model: 'gpt-realtime',
      transport: transport,
      config: {
        outputModalities: ['audio', 'text'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            // transcription 設定はデフォルト（言語ヒント未指定）
            noiseReduction: { type: 'near_field' },
            // server_vad に統一（session.create を確実に成功させる）
            turnDetection: {
              type: 'server_vad',
              createResponse: true,
              interruptResponse: true,
              prefixPaddingMs: 300,
              silenceDurationMs: 1400,
              threshold: 0.70
            }
          },
          output: {
            voice: 'alloy'
          }
        }
      }
    });

    // --- Google Calendar hosted_mcp の定期リフレッシュ（20分間隔）---
    if (this.mcpRefreshInterval) {
      clearInterval(this.mcpRefreshInterval);
      this.mcpRefreshInterval = null;
    }
    this.mcpRefreshInterval = setInterval(async () => {
      try {
        if (!this.currentUserId || !this.session) return;
        // オンライン時のみ実行（復帰直後の無駄な失敗回避）
        const { isOnline } = await import('../services/network');
        if (!(await isOnline())) {
          console.log('⏭️ Skipped hosted_mcp refresh (offline)');
          return;
        }
        const cfg = await resolveGoogleCalendarMcp(this.currentUserId);
        if (!cfg) return; // 未接続時は何もしない
        const newAgent = await createAniccaAgent(this.currentUserId);
        await this.session.updateAgent(newAgent);
        console.log('🔁 hosted_mcp refreshed (periodic)');
      } catch (e: any) {
        console.warn('Periodic hosted_mcp refresh skipped:', e?.message || e);
      }
    }, 20 * 60 * 1000);

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
    const app = this.app as express.Application;
    const self = this;
    
    // 1. /session - hiddenWindow用（必須）
    this.app.get('/session', async (req, res) => {
      try {
        const userId = req.query.userId as string || this.currentUserId;
        console.log('📡 Session request:', { userId });
        
        // プロキシから設定取得（Desktop専用ルート使用）
        const { API_ENDPOINTS } = require('../config');
        const sessionUrl = userId
          ? `${API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION}?userId=${userId}`
          : API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION;
        const response = await fetch(sessionUrl);
        const data = await response.json();
        
        res.json(data);
      } catch (error) {
        console.error('Session error:', error);
        res.status(500).json({ error: 'Failed to get session' });
      }
    });
    
    // 3. /auth/callback - OAuthコールバック（PKCE/Code Flowに統一）
    this.app.get('/auth/callback', async (req, res) => {
      try {
        console.log('📥 Auth callback received');
        const q: any = req.query || {};
        const code =
          typeof q.code === 'string' ? q.code :
          (Array.isArray(q.code) ? q.code[0] : undefined);
        const err =
          typeof q.error === 'string' ? q.error :
          (Array.isArray(q.error) ? q.error[0] : undefined);
        const errDesc =
          typeof q.error_description === 'string' ? q.error_description :
          (Array.isArray(q.error_description) ? q.error_description[0] : undefined);

        if (err) {
          console.warn('OAuth error from IdP:', err, errDesc || '');
          res.status(400).send(`Authentication error: ${err}${errDesc ? ' - ' + errDesc : ''}`);
          return;
        }
        if (!code) {
          console.error('Missing authorization code in callback');
          res.status(400).send('Missing authorization code');
          return;
        }

        // Supabase経由で code → session を交換（Desktop内のsupabase-jsで直接実行）
        const { getAuthService } = await import('../services/desktopAuthService');
        const authService = getAuthService();
        const ok = await authService.handleOAuthCallback(String(code));
        if (!ok) {
          console.error('handleOAuthCallback returned false');
          res.status(500).send('Failed to complete authentication');
          return;
        }

        // ユーザー確定 → SessionManagerへ反映
        const user = authService.getCurrentUser();
        if (user?.id) {
          this.setCurrentUserId(user.id);
          console.log(`✅ User authenticated: ${user.email}`);
          if ((global as any).onUserAuthenticated) {
            (global as any).onUserAuthenticated(user);
          }

          // OAuth後はRealtimeのclient_secretを再取得して再接続
          try {
            await this.disconnect();
            await this.initialize();
            const { API_ENDPOINTS } = require('../config');
            const sessionUrl = this.currentUserId
              ? `${API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION}?userId=${this.currentUserId}`
              : API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION;
            const resp = await fetch(sessionUrl);
            if (!resp.ok) throw new Error(`Failed to refresh client secret after OAuth: ${resp.status}`);
            const data = await resp.json();
            const apiKey = data?.client_secret?.value;
            if (!apiKey) throw new Error('No client_secret returned after OAuth');
            await this.connect(apiKey);
            console.log('✅ Reconnected after OAuth with refreshed client secret');
          } catch (e) {
            console.error('Failed to reinitialize session after auth:', e);
          }
        }

        // 成功ページ（自動クローズ）
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>認証完了 - Anicca</title>
          <style>
            body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
            .c{background:#fff;padding:40px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.1);text-align:center}
            .ok{font-size:48px;color:#4CAF50}
            p{color:#666}
          </style></head>
          <body><div class="c"><div class="ok">✅</div><h1>認証が完了しました</h1><p>このウィンドウは自動的に閉じられます...</p></div>
          <script>setTimeout(()=>window.close(), 1500)</script></body></html>
        `);
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
          sdkStatus: '/sdk/status',
          modeSet: '/mode/set',
          modeStatus: '/mode/status'
        }
      });
    });
    
    // 7. 音声入力エンドポイント（短尺/空データは最終フィルタでドロップ）
    this.app.post('/audio/input', async (req, res) => {
      try {
        // Silent中は受信自体をドロップ（帯域/CPU/バッファ滞留を防止）
        if (this.mode !== 'conversation') {
          res.json({ success: true, dropped: 'silent' });
          return;
        }
        // 会話時のみ接続保証
        await this.ensureConnected(true);

        // ensureConnected は型上は this.session を非null化しないため、明示ガード
        const session = this.session;
        if (!session) {
          res.status(503).json({ error: 'Session not connected' });
          return;
        }

        // Base64エンコードされたPCM16音声データを受け取る
        const audioData = Buffer.from(req.body.audio, 'base64');
        // 短尺/空チャンクは捨てる（約80ms未満のみブロック）
        const rate = Number(req.body?.sampleRate) || 24000;
        const minMs = 80;
        const minBytes = Math.floor(rate * (minMs / 1000)) * 2; // PCM16(16bit=2bytes)
        if (audioData.byteLength < minBytes) {
          res.json({ success: true, dropped: 'short', bytes: audioData.byteLength });
          return;
        }
        
        // SDKにPCM16形式の音声データを送信
        await session.sendAudio(audioData.buffer as ArrayBuffer);
        
        res.json({ success: true, format: 'pcm16' });
      } catch (error: any) {
        console.error('Audio input error:', error);
        res.status(503).json({ error: error.message });
      }
    });

    // 8. SDK状態確認エンドポイント（新規追加）
    this.app.get('/sdk/status', (req, res) => {
      res.json({
        connected: this.isConnected(),
        hasAgent: !!this.agent,
        userId: this.currentUserId,
        useSDK: true,  // SDK使用フラグ
        transport: 'websocket',  // トランスポート情報
        ready: this.ready,
        tokenTTL: Math.floor(this.tokenTTLSeconds()),
        sessionAge: Math.floor(this.sessionAgeSeconds()),
        lastServerEventMsAgo: (Date.now() - (this.lastServerEventAt ?? 0)),
        mode: this.mode,
        autoExitMsRemaining: this.getAutoExitMsRemaining()
      });
    });

    // 8.5. 接続保証（Cron/任意発話の入口から呼ぶ）
    this.app.post('/sdk/ensure', async (req, res) => {
      try {
        await this.ensureConnected(true);
        res.json({ ok: true });
      } catch (e: any) {
        res.status(503).json({ ok: false, error: e?.message || String(e) });
      }
    });

    // 8.6 PTT: モード切替（クラス内へ移設）
    this.app.post('/mode/set', async (req, res) => {
      try {
        const mode = String(req.body?.mode || '').toLowerCase();
        const reason = String(req.body?.reason || '');
        if (mode !== 'silent' && mode !== 'conversation') {
          res.status(400).json({ ok: false, error: 'invalid mode' });
          return;
        }
        await self.setMode(mode as any, reason);
        res.json({ ok: true, mode: self.mode, autoExitMsRemaining: self.getAutoExitMsRemaining() });
      } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
      }
    });

    // 8.7 PTT: モード状態（クラス内へ移設）
    this.app.get('/mode/status', (req, res) => {
      res.json({
        ok: true,
        mode: self.mode,
        autoExitMsRemaining: self.getAutoExitMsRemaining()
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

    // 1-1. ユーザーのタイムゾーンを受け取る（setupRoutes内に配置）
    this.app.post('/user/timezone', (req, res) => {
      try {
        const tz = String(req.body?.timezone ?? '');
        if (tz && tz.length >= 3) {
          this.userTimezone = tz;
          console.log('🌐 User timezone set:', tz);
        }
        res.json({ ok: true, timezone: this.userTimezone });
      } catch (e: any) {
        res.status(400).json({ ok: false, error: e?.message || String(e) });
      }
    });
  }

  // WebSocket設定
  private setupWebSocket() {
    if (!this.httpServer) return;
    
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.wss.on('connection', (ws) => {
      console.log('🔌 WebSocket client connected');
      this.wsClients.add(ws);
      
      // 衝突回避ヘルパ：進行中応答がある場合は interrupt → 短待ち
      const interruptIfGenerating = async (delayMs = 100) => {
        if (this.isGenerating) {
          try { await this.session?.interrupt(); } catch {}
          await new Promise(r => setTimeout(r, delayMs));
        }
      };
      
      // 定期タスクメッセージハンドラーを追加
      ws.on('message', async (data: string) => {
        try {
          const message = JSON.parse(data);
          
          if (message.type === 'scheduled_task') {
            // T時点の入口で必ず復旧（プリフライト未達でもここで直る）
            await this.ensureConnected(true);
            // 直後に未接続なら、短期待機して一度だけ再試行（READY直前のゆらぎ吸収）
            if (!this.isConnected()) {
              await new Promise(r => setTimeout(r, 800));
              await this.ensureConnected(true);
            }
            console.log('📅 Scheduled task received:', message.command);

            // 念のため直前の出力を再チェック
            await interruptIfGenerating(100);
            
            // 慈悲の瞑想タスクの場合の特別処理
            if (message.taskType === 'jihi_meditation') {
              console.log('🧘 慈悲の瞑想モード開始（ElevenLabs読み上げ）');
              // ElevenLabsで処理するため、特別な割り込み防止は不要
            }
            // PTT: Cron開始時は会話モードへ
            try { await this.setMode('conversation', 'cron'); } catch {}

            // メッセージ送信（共通）
            if (this.session && this.isConnected()) {
              // 念のため直前の出力を再チェック
              await interruptIfGenerating(100);
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

            // 起床タスクも他の定期タスクと同様に“一発発火”のみ（ループは撤廃）
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
  // ユーザーTZ参照（Cron/TZ解決で利用）
  getUserTimezone(): string | null {
    return this.userTimezone;
  }
  
  // WebSocket Keep-alive機能
  private keepAliveErrors = 0;  // （無効化済みだが参照残し）

  private startKeepAlive() {
    // アプリ層の送信型 keep-alive は無効化（transportに任せる）
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    console.log('🛑 App-layer keep-alive disabled (handled by transport)');
  }

  // ================= PTT: モード切替と自動終了 =================
  private getAutoExitMsRemaining(): number | null {
    if (!this.autoExitDeadlineAt) return null;
    return Math.max(0, this.autoExitDeadlineAt - Date.now());
  }

  private clearAutoExitTimer() {
    if (this.autoExitTimer) {
      clearTimeout(this.autoExitTimer);
      this.autoExitTimer = null;
    }
    this.autoExitDeadlineAt = null;
  }

  private startAutoExitCountdown() {
    this.clearAutoExitTimer();
    this.autoExitDeadlineAt = Date.now() + this.AUTO_EXIT_IDLE_MS;
    this.autoExitTimer = setTimeout(async () => {
      const userAfterAgent = (this.lastUserActivityAt ?? 0) > (this.lastAgentEndAt ?? 0);
      if (this.mode === 'conversation' && !userAfterAgent) {
        try { await this.setMode('silent', 'auto_exit'); } catch (e) { console.warn('auto-exit failed:', e); }
      }
    }, this.AUTO_EXIT_IDLE_MS);
  }

  private noteUserActivity() {
    this.lastUserActivityAt = Date.now();
    // 会話継続のため、待機中タイマは一旦クリア（次の agent_end で再セット）
    this.clearAutoExitTimer();
  }

  private async setMode(newMode: 'silent' | 'conversation', reason: string = ''): Promise<void> {
    // 同じモードなら何もしない（冪等・安定化）
    if (newMode === this.mode) { console.log('[MODE_SET:noop]', { mode: this.mode, reason }); return; }
    // 会話に上げる時だけ接続保証（下げるだけなら不要）
    if (newMode === 'conversation') { await this.ensureConnected(true).catch(() => {}); }

    try {
      if (newMode === 'conversation') {
        // 公式SDK: updateSessionConfig（camel -> snake はSDK側で処理）
        this.session?.transport?.updateSessionConfig({
          audio: {
            input: {
              turnDetection: {
                type: 'server_vad',
                createResponse: true,
                interruptResponse: true,
                // server_vad で有効なパラメータ
                prefixPaddingMs: 300,
                silenceDurationMs: 1400,
                threshold: 0.70
              }
            }
          }
        });
        this.mode = 'conversation';
        this.clearAutoExitTimer();
        this.lastUserActivityAt = null;
      } else {
        // OFFは低レベル session.update を正しい階層＋必須フィールドで送る
        (this.session as any)?.transport?.sendEvent?.({
          type: 'session.update',
          session: {
            type: 'realtime',
            audio: {
              input: { turn_detection: null }
            }
          }
        });
        this.mode = 'silent';
        this.clearAutoExitTimer();
        this.lastUserActivityAt = null;
      }
      console.log('[MODE_SET]', { mode: this.mode, reason });
    } catch (e) {
      console.warn('setMode failed:', e);
    }
  }
  // ============================================================

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
      await this.ensureConnected(true);
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

    // 低レベル接続イベント
    try {
      this.session.transport.on('connected', () => {
        this.lastServerEventAt = Date.now();
      });
      this.session.transport.on('disconnected', () => {
        this.ready = false;
      });
    } catch {}

    // サーバからの生イベント（READY合図をここで検知）
    this.session.on('transport_event', async (event: any) => {
      try {
        this.lastServerEventAt = Date.now();
        if (event?.type === 'session.created') {
          this.ready = true;
          console.log('[READY] session.created');
          if (!this.restoredOnce) {
            try {
              await this.restoreSession();
              this.restoredOnce = true;
            } catch (e) {
              console.warn('restoreSession after READY failed:', e);
            }
          }
          // READY後に一度だけ mem/TZ を“応答なし”で反映（多重抑止つき）
          this.enqueueSystemOp({ kind: 'mem' });
          this.enqueueSystemOp({ kind: 'tz' });
          this.flushSystemOpsIfIdle();
          // 既定は沈黙モード
          try { await this.setMode('silent', 'startup'); } catch {}
        }
        // セッション失効（60分上限）検出時は即時復旧
        try {
          const err = (event as any)?.error?.error || (event as any)?.error;
          if ((event?.type === 'error' || !!err) && err?.code === 'session_expired') {
            console.warn('[EXPIRED] realtime session expired → reconnecting...');
            try { await this.ensureConnected(true); } catch (e) { console.error('auto-reconnect failed:', e); }
          }
        } catch {}
      } catch {}
    });

    // 応答の開始/終了を捕捉（競合回避とキュー解放）
    this.session.on('agent_start', (_ctx: any, _agent: any) => {
      this.isGenerating = true;
      this.lastServerEventAt = Date.now();
      console.log('[AGENT_START]');
      // 会話継続中は自動終了カウントを停止（次の agent_end で再度開始）
      this.clearAutoExitTimer();
    });
    this.session.on('agent_end', (_ctx: any, _agent: any, _output: string) => {
      this.isGenerating = false;
      this.lastServerEventAt = Date.now();
      console.log('[AGENT_END]');
      // UIへ完了のフォールバック通知（半二重戻し）
      this.broadcast({ type: 'turn_done' });
      this.flushSystemOpsIfIdle();
      // 自動終了は audio_stopped で開始する（ここでは開始しない）
    });

    // 音声データイベント（transport経由）
    this.session.transport.on('audio', (event: any) => {
      this.lastServerEventAt = Date.now();
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
    this.session.on('audio_start', (_ctx: any, _agent: any) => {
      this.lastServerEventAt = Date.now();
      // ElevenLabs再生中は無視
      if (this.isElevenLabsPlaying) {
        console.log('🔇 Ignoring Anicca audio_start during ElevenLabs playback');
        return;
      }
      console.log('🔊 Agent started speaking');
      this.broadcast({ type: 'audio_start' });
    });

    this.session.on('audio_stopped', (_ctx: any, _agent: any) => {
      this.lastServerEventAt = Date.now();
      // ElevenLabs再生中は無視
      if (this.isElevenLabsPlaying) {
        console.log('🔇 Ignoring Anicca audio_stopped during ElevenLabs playback');
        return;
      }
      console.log('🔊 Agent stopped speaking');
      this.broadcast({ type: 'audio_stopped' });
      // 発話が止まったら10秒カウント開始
      if (this.mode === 'conversation') {
        this.lastAgentEndAt = Date.now();
        this.startAutoExitCountdown();
      }
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
      const isHostedMcp = (
        tool && tool.type === 'hosted_tool' && tool.name === 'hosted_mcp' && tool.providerData?.type === 'mcp'
      );
      const mcpServer = isHostedMcp ? (tool.providerData.server_label || 'mcp') : null;
      const mcpTool   = isHostedMcp ? (details?.toolCall?.name || details?.toolCall?.tool || '') : '';
      const serverTagMap: Record<string,string> = {
        google_calendar: '[CALENDAR]',
        gmail:           '[GMAIL]'
      };
      const tag = isHostedMcp ? (serverTagMap[mcpServer!] || `[${mcpServer}]`) : '';
      const toolName = isHostedMcp ? `${tag} [${mcpTool || 'unknown'}]` : (tool?.name || 'unknown_tool');

      console.log(`🔧 SDK自動実行開始: ${toolName}`);
      if (isHostedMcp) {
        try {
          const args = details?.toolCall?.arguments;
          let compact = '';
          if (typeof args !== 'undefined') {
            compact = typeof args === 'string' ? args : JSON.stringify(args);
            if (compact.length > 200) compact = compact.slice(0, 200) + '...';
            console.log(`🛠 MCP start: ${tag} ${mcpTool} args=${compact}`);
          } else {
            console.log(`🛠 MCP start: ${tag} ${mcpTool}`);
          }
        } catch (e) {
          console.warn('Failed to log MCP call args:', e);
        }
      }
      
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
      const isHostedMcp = (
        tool && tool.type === 'hosted_tool' && tool.name === 'hosted_mcp' && tool.providerData?.type === 'mcp'
      );
      const mcpServer = isHostedMcp ? (tool.providerData.server_label || 'mcp') : null;
      const mcpTool   = isHostedMcp ? (details?.toolCall?.name || details?.toolCall?.tool || '') : '';
      const serverTagMap: Record<string,string> = {
        google_calendar: '[CALENDAR]',
        gmail:           '[GMAIL]'
      };
      const tag = isHostedMcp ? (serverTagMap[mcpServer!] || `[${mcpServer}]`) : '';
      const toolName = isHostedMcp ? `${tag} [${mcpTool || 'unknown'}]` : (tool?.name || 'unknown_tool');

      console.log(`✅ SDK自動実行完了: ${toolName}`);
      if (isHostedMcp) {
      const elapsedMs = this.taskState.startedAt ? (Date.now() - this.taskState.startedAt) : 0;
      console.log(`🛠 MCP done: ${tag} ${mcpTool} (${elapsedMs}ms)`);
      }
      try {
        console.log(`結果: ${JSON.stringify(result)}`);
      } catch (_) {
        // noop
      }
      
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

      // 接続直後のツール更新：connect_google_calendar 完了時に hosted_mcp を即注入
      try {
        if (tool?.type === 'function' && tool?.name === 'connect_google_calendar' && this.currentUserId && this.session) {
          const cfg = await resolveGoogleCalendarMcp(this.currentUserId);
          if (cfg) {
            const newAgent = await createAniccaAgent(this.currentUserId);
            await this.session.updateAgent(newAgent);
            console.log('✅ hosted_mcp injected after connect_google_calendar');
          }
        }
        // 切断直後のツール更新：disconnect_google_calendar 完了時に hosted_mcp を即時除去
        if (tool?.type === 'function' && tool?.name === 'disconnect_google_calendar' && this.currentUserId && this.session) {
          const newAgent = await createAniccaAgent(this.currentUserId);
          await this.session.updateAgent(newAgent);
          console.log('🧹 hosted_mcp removed after disconnect_google_calendar');
        }
      } catch (e: any) {
        console.warn('Failed to inject hosted_mcp after connect:', e?.message || e);
      }
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

      // エラー種別で再接続を制御
      const code = error?.error?.error?.code || error?.code || '';
      const isLogicError = (
        code === 'conversation_already_has_active_response' ||
        code === 'invalid_value' ||
        code === 'empty_array'
      );
      if (isLogicError) {
        // 論理エラーは会話制御の問題。再接続せずログのみ。
        return;
      }
      // 401/Unauthorized を簡易検知して hosted_mcp をリフレッシュ（ワンショット）
      try {
        const msg = JSON.stringify(error) || '';
        if ((msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.includes('Token verification failed')) && this.currentUserId && this.session) {
          const newAgent = await createAniccaAgent(this.currentUserId);
          await this.session.updateAgent(newAgent);
          console.log('🔁 Refreshed hosted_mcp after 401/Unauthorized');
        }
      } catch { /* noop */ }

      // ネットワーク断・タイムアウトなどのみ再接続
      if (!this.isReconnecting && this.apiKey) {
        await this.handleReconnection();
      }
    });

    // 履歴更新時：新規アイテムからMCP呼び出しを検出してログ
    this.session.on('history_updated', async (history: any[]) => {
      console.log('📝 History updated, length:', history?.length);

      try {
        const len = Array.isArray(history) ? history.length : 0;
        for (let i = this.lastLoggedHistoryIndex; i < len; i++) {
          const item: any = history[i];
          const providerType = item?.providerData?.type || item?.type;

          // hosted MCP 呼び出しの開始検出
          if (providerType === 'mcp_call' && item?.providerData) {
            const server = item.providerData.server_label || 'unknown_server';
            const tool   = item.providerData.tool || 'unknown_tool';
            const args   = item.providerData.arguments;
            let compactArgs = '';
            try {
              compactArgs = typeof args === 'string' ? args : JSON.stringify(args);
              if (compactArgs.length > 200) compactArgs = compactArgs.slice(0, 200) + '...';
            } catch { /* noop */ }
            console.log(`🛠 MCP start: ${server}.${tool} args=${compactArgs}`);
          }

          // アシスタント応答到着を「完了」のサインとして簡易ログ
          if ((providerType === 'message' || providerType === 'response') && item?.role === 'assistant') {
            console.log('🛠 MCP done: assistant responded');
          }
        }
        this.lastLoggedHistoryIndex = len;
      } catch (e) {
        console.warn('Failed to inspect history for MCP logs:', e);
      }

      await this.saveSession(history);
    });

    // 追加：増分1件でユーザー活動を即検知（軽量・確実）
    this.session.on('history_added', (item: any) => {
      try {
        if (this.mode !== 'conversation') return;
        // RealtimeItemとの整合: ユーザー発話のみで判定
        const isUser = (item?.type === 'message' && item?.role === 'user');
        if (isUser) this.noteUserActivity();
      } catch { /* noop */ }
    });
  }
  
  async connect(apiKey: string) {
    if (!this.session) throw new Error('Session not initialized');
    
    this.apiKey = apiKey;
    // 新セッションの開始直後に age/ready を初期化
    this.sessionStartedAt = Date.now();
    this.ready = false;
    this.restoredOnce = false;
    await this.session.connect({ apiKey });
    console.log('✅ Connected to OpenAI Realtime API');
    
    // 履歴復元は session.created（READY）後に行う

    // Slack接続状態を確認
    await this.checkSlackConnection();
    
    // （READY後に mem/TZ を“応答なし”で反映する。ここでは送らない）
  }
  
  async disconnect() {
    // keep-aliveを停止
    this.stopKeepAlive();
    
    if (this.session) {
      this.session.close();
      console.log('🔌 Disconnected from OpenAI Realtime API');
    }
    this.apiKey = null;
    if (this.mcpRefreshInterval) {
      clearInterval(this.mcpRefreshInterval);
      this.mcpRefreshInterval = null;
    }
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
  
  // （wake専用ループは撤廃）

  // ====== 応答衝突回避（進行中なら interrupt→短待ち） ======
  private async interruptIfGenerating(delayMs = 100) {
    if (this.isGenerating) {
      try { await this.session?.interrupt(); } catch {}
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  getSession() {
    return this.session;
  }
  
  isConnected() {
    const transportOpen = (this.session?.transport?.status === 'connected');
    const lastEvOk = (Date.now() - (this.lastServerEventAt ?? 0)) <= 30_000; // 30s
    const ttlOk = this.tokenTTLSeconds() > 120; // >120s
    const ageOk = this.sessionAgeSeconds() < 3_000; // <50min
    return (transportOpen && this.ready === true && lastEvOk && ttlOk && ageOk);
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
