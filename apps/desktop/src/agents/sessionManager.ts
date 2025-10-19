import { RealtimeSession, OpenAIRealtimeWebSocket } from '@openai/agents/realtime';
import { createAniccaAgent } from './mainAgent';
import { resolveGoogleCalendarMcp } from './remoteMcp';
import { getAuthService } from '../services/desktopAuthService';
import { SimpleEncryption } from '../services/simpleEncryption';
import { resolveLanguageAssets } from '../services/onboardingBootstrap';
import {
  lockWakeAdvance,
  unlockWakeAdvance,
  markWakeRoutineActive,
  markWakeRoutineInactive,
  isWakeRoutineActive
} from './wakeAdvanceGate';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import express, { Request, Response } from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import net from 'net';

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

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
  private httpSockets = new Set<net.Socket>();
  private wss: WebSocketServer | null = null;
  private wsClients = new Set<WebSocket>();
  private onboardingState: 'idle' | 'running' = 'idle';
  private readyWaiters: ReadyWaiter[] = [];
  private historyEncryption: SimpleEncryption;
  private bridgeToken: string;
  
  // 状態管理
  private currentUserId: string | null = null;
  private currentPort: number = 8085; // デフォルトポート
  private userTimezone: string | null = null;
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
  private readonly AUTO_EXIT_IDLE_MS = 30_000;      // 自動終了までの待機（約30秒）
  private readonly AUTO_EXIT_IDLE_WAKE_MS = 30_000;  // 起床ルーチン中も同じ待機（約30秒）
  private awaitingPlaybackDrain: boolean = false;
  private playbackDrainInterval: NodeJS.Timeout | null = null;
  private isRendererPlaying: boolean = false;

  // wake起床タスクの連続発話（sticky）制御
  private stickyTask: 'wake_up' | null = null;
  private wakeActive: boolean = false;
  // wake専用：アシスタントの最初の発話（audio_start）までは解除判定を無効化
  private stickyReady: boolean = false;
  private pendingAssistantResponse: boolean = false;
  private wakeFollowUpTimer: NodeJS.Timeout | null = null;
  
  // （wake専用ループ／独自ゲートは撤廃）
  
  constructor(private mainAgent: any | undefined, bridgeToken: string) {
    this.sessionFilePath = path.join(os.homedir(), '.anicca', 'session.json');
    this.historyEncryption = new SimpleEncryption();
    this.bridgeToken = bridgeToken;
  }

  private async updateUserLanguageInProfile(timezone: string): Promise<void> {
    if (!timezone) return;

    try {
      const assets = resolveLanguageAssets();
      const profilePath = path.join(os.homedir(), '.anicca', 'anicca.md');
      await fs.access(profilePath);
      const content = await fs.readFile(profilePath, 'utf8');
      const timezoneLine = `${assets.timezoneLinePrefix} ${timezone}`;
      const languageLine = assets.languageLine;
      const block = `${timezoneLine}\n${languageLine}\n`;
      let next = content
        .replace(/^- タイムゾーン:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- Timezone:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- 言語:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- Language:[^\r\n]*\r?\n?/gm, '')
        .replace(/^Language:[^\r\n]*\r?\n?/gm, '');

      if (/# ユーザー情報\r?\n/.test(next)) {
        next = next.replace(/(# ユーザー情報\r?\n)/, `$1${block}`);
      } else if (/# USER PROFILE\r?\n/.test(next)) {
        next = next.replace(/(# USER PROFILE\r?\n)/, `$1${block}`);
      } else {
        next = `${block}${next}`;
      }

      if (next !== content) {
        await fs.writeFile(profilePath, next, 'utf8');
      }
    } catch {
      // プロファイル未生成などで失敗した場合は無視
    }
  }

  private isOnboardingActive(): boolean {
    return this.onboardingState === 'running';
  }

  public setOnboardingState(state: 'idle' | 'running') {
    this.onboardingState = state;
  }

  public isOnboardingRunning(): boolean {
    return this.onboardingState === 'running';
  }

  public hasBridgeClient(): boolean {
    return this.wsClients.size > 0;
  }

  public async waitForBridgeClient(timeoutMs = 5000): Promise<boolean> {
    const interval = 100;
    let waited = 0;
    while (!this.hasBridgeClient()) {
      if (waited >= timeoutMs) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      waited += interval;
    }
    return true;
  }

  private resolveReadyWaiters(error?: Error) {
    if (this.readyWaiters.length === 0) return;
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timeout);
      if (error) {
        waiter.reject(error);
      } else {
        waiter.resolve();
      }
    });
  }

  public waitForReady(timeoutMs: number = 8000): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const entry: ReadyWaiter = {
        resolve: () => {
          clearTimeout(entry.timeout);
          this.readyWaiters = this.readyWaiters.filter((item) => item !== entry);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(entry.timeout);
          this.readyWaiters = this.readyWaiters.filter((item) => item !== entry);
          reject(error);
        },
        timeout: setTimeout(() => {
          this.readyWaiters = this.readyWaiters.filter((item) => item !== entry);
          reject(new Error('waitForReady timeout'));
        }, timeoutMs)
      };

      this.readyWaiters.push(entry);
    });
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
    if (isWakeRoutineActive()) {
      return false;
    }
    const transportOpen = (this.session?.transport?.status === 'connected');
    const lastEvOk = (Date.now() - (this.lastServerEventAt ?? 0)) <= 600_000; // 10min
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
    if (this.session?.transport?.status === 'connecting') {
      let waited = 0;
      while (this.session?.transport?.status === 'connecting' && waited < 5000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
      const stillNeedAfterConnect = (!this.session || !this.isConnected() || (freshIfStale && this.isStale()));
      if (!stillNeedAfterConnect) return;
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
      const authService = getAuthService();
      const proxyJwt = await authService.getProxyJwt();
      if (!proxyJwt) throw new Error('missing proxy jwt');
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${proxyJwt}` } });
      if (resp.status === 402) {
        const payload = await resp.json().catch(() => ({ message: null }));
        const message = typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : 'You have reached the free tier limit. Please upgrade to Anicca Pro.';
        throw new Error(`desktop-session quota exceeded: ${message}`);
      }
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
            turnDetection: {
              type: 'server_vad',
              threshold: 0.5,
              prefixPaddingMs: 300,
              silenceDurationMs: 500,
              interruptResponse: true,
              createResponse: true,
              idleTimeoutMs: 30_000
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

  private ensureBridgeToken(): string {
    if (!this.bridgeToken || this.bridgeToken.length === 0) {
      throw new Error('Bridge token is not set');
    }
    return this.bridgeToken;
  }

  private isLoopbackAddress(address?: string | null): boolean {
    if (!address) return false;
    if (address === '127.0.0.1' || address === '::1') return true;
    if (address.startsWith('::ffff:')) {
      const mapped = address.split(':').pop();
      return mapped === '127.0.0.1';
    }
    return false;
  }

  private matchesBridgeToken(value: string | string[] | undefined): boolean {
    const token = this.ensureBridgeToken();
    if (!value) return false;
    const candidates = Array.isArray(value)
      ? value
      : value.split(',');
    return candidates.map((item) => item.trim()).includes(token);
  }

  // Express/WebSocketサーバー起動（新規追加）
  async startBridge(port: number) {
    if (this.app) return; // 既に起動済み
    
    this.ensureBridgeToken();
    this.currentPort = port; // ポート番号を保存
    this.app = express();
    this.app.use((req, res, next) => {
      if (req.path === '/auth/callback') {
        next();
        return;
      }
      if (!this.isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const queryToken = typeof req.query?.bridge_token === 'string' ? req.query.bridge_token : undefined;
      if (!this.matchesBridgeToken(req.headers['x-anicca-bridge-token']) && !this.matchesBridgeToken(queryToken)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      if (req.query && 'bridge_token' in req.query) {
        delete (req.query as any).bridge_token;
      }
      next();
    });
    this.app.use(express.json());
    
    // ルート設定
    this.setupRoutes();
    
    // HTTPサーバー起動
    this.httpServer = http.createServer(this.app);
    this.httpServer.on('connection', (socket) => {
      this.httpSockets.add(socket);
      socket.on('close', () => this.httpSockets.delete(socket));
    });
    
    // WebSocket設定
    this.setupWebSocket();
    
    // サーバー起動
    await new Promise<void>((resolve) => {
      this.httpServer!.listen({ port, host: '::1', ipv6Only: false }, () => {
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
        const authService = getAuthService();
        let proxyJwt: string | null = null;
        try {
          proxyJwt = await authService.getProxyJwt();
        } catch (err: any) {
          if (err?.code === 'PAYMENT_REQUIRED') {
            res.status(402).json({
              error: 'Quota exceeded',
              message: err?.message,
              entitlement: err?.entitlement || authService.getPlanInfo()
            });
            return;
          }
          throw err;
        }
        if (!proxyJwt) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }
        const response = await fetch(sessionUrl, {
          headers: { Authorization: `Bearer ${proxyJwt}` }
        });
        if (response.status === 402) {
          const payload = await response.json().catch(() => ({ error: 'Quota exceeded' }));
          res.status(402).json(payload);
          return;
        }
        if (!response.ok) {
          const text = await response.text();
          res.status(response.status).json({ error: 'Failed to get session', detail: text });
          return;
        }
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
            const authService = getAuthService();
            const proxyJwt = await authService.getProxyJwt();
            if (!proxyJwt) throw new Error('Missing proxy entitlement after OAuth');
            const resp = await fetch(sessionUrl, { headers: { Authorization: `Bearer ${proxyJwt}` } });
            if (resp.status === 402) {
              const payload = await resp.json().catch(() => ({ message: 'Quota exceeded' }));
              throw new Error(`Quota exceeded after OAuth: ${payload?.message || 'payment required'}`);
            }
            if (!resp.ok) throw new Error(`Failed to refresh client secret after OAuth: ${resp.status}`);
            const data = await resp.json();
            const apiKey = data?.client_secret?.value;
            if (!apiKey) throw new Error('No client_secret returned after OAuth');
            await this.connect(apiKey);
            if (!this.isConnected()) {
              await this.waitForReady(8000);
            }
            await this.waitForBridgeClient(5000);
            console.log('✅ Reconnected after OAuth with refreshed client secret');
          } catch (e) {
            console.error('Failed to reinitialize session after auth:', e);
          }
        }

        // 成功ページ（自動クローズ）
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>Authentication complete - Anicca</title>
          <style>
            body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
            .c{background:#fff;padding:40px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.1);text-align:center}
            .ok{font-size:48px;color:#4CAF50}
            p{color:#666}
          </style></head>
          <body><div class="c"><div class="ok">✅</div><h1>Authentication complete</h1><p>This window will close automatically…</p></div>
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
          sdkStatus: '/sdk/status',
          modeSet: '/mode/set',
          modeStatus: '/mode/status'
        }
      });
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

    // 1-1. ユーザーのタイムゾーンを受け取る（setupRoutes内に配置）
    this.app.post('/user/timezone', async (req, res) => {
      try {
        const tz = String(req.body?.timezone ?? '');
        if (tz && tz.length >= 3) {
          this.userTimezone = tz;
          console.log('🌐 User timezone set:', tz);
          await this.updateUserLanguageInProfile(tz);
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
    
    this.ensureBridgeToken();
    this.wss = new WebSocketServer({
      server: this.httpServer!,
      verifyClient: (info, done) => {
        if (!this.isLoopbackAddress(info.req.socket.remoteAddress)) {
          done(false, 401, 'Unauthorized');
          return;
        }
        if (!this.matchesBridgeToken(info.req.headers['sec-websocket-protocol'])) {
          done(false, 401, 'Unauthorized');
          return;
        }
        done(true);
      }
    });

    this.wss.on('connection', (ws, req) => {
      if (!this.matchesBridgeToken(req.headers['sec-websocket-protocol'])) {
        ws.close(1008, 'unauthorized');
        return;
      }
      console.log('🔌 WebSocket client connected');
      this.wsClients.add(ws);
      
      // 衝突回避ヘルパ：進行中応答がある場合は interrupt → 短待ち
      const interruptIfGenerating = async (delayMs = 100) => {
        if (this.isGenerating && this.isRendererPlaying) {
          try { await this.session?.interrupt(); } catch {}
          await new Promise(r => setTimeout(r, delayMs));
        }
      };
      
      // 定期タスク/音声フレームのメッセージハンドラー（isBinary で正確に判定）
      ws.on('message', async (data: any, isBinary: boolean) => {
        try {
          // 1) バイナリ（PCM16）入力: SDKへ直結
          if (isBinary) {
            if (this.mode !== 'conversation') return;
            await this.ensureConnected(true);
            if (!this.session) return;
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            await this.sendAudio(new Uint8Array(buf));
            return;
          }

          // 2) JSON メッセージ（BufferでもUTF-8文字列へ変換して解釈）
          const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
          const message = JSON.parse(text);
          if (message.type === 'playback_state') {
            this.isRendererPlaying = !!message.playing;
            if (!this.isRendererPlaying && this.awaitingPlaybackDrain) {
              this.awaitingPlaybackDrain = false;
              this.clearPlaybackDrainWatch();
              this.startAutoExitCountdown();
            }
            return;
          }
          if (message.type === 'playback_idle') {
            if (this.awaitingPlaybackDrain) {
              this.awaitingPlaybackDrain = false;
              this.clearPlaybackDrainWatch();
              this.startAutoExitCountdown();
            }
            return;
          }
          
          if (message.type === 'scheduled_task') {
            // T時点の入口で一度だけ復旧（重複ensureを排除）
            await this.ensureConnected(true);
            console.log('📅 Scheduled task received:', message.command);

            // 念のため直前の出力を再チェック
            await interruptIfGenerating(100);
            
            // wake_up の場合は第一声の前に sticky を先に有効化（ゲートを確実に先出し）
            try {
              const t = String(message.taskType || message.taskId || '').toLowerCase();
              if (t.startsWith('wake_up')) {
                this.stickyTask = 'wake_up';
                this.wakeActive = true;
                this.stickyReady = false; // audio_start が来るまで解除不可
                markWakeRoutineActive('cron_start');
                lockWakeAdvance('cron_start');
              }
            } catch {}

            // PTT: Cron開始時は会話モードへ（stickyを立てた後）
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

            // 起床タスクは sticky により音声停止ごとに連鎖（audio_stopped 起点）
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.isRendererPlaying = false;
        if (this.awaitingPlaybackDrain) {
          this.awaitingPlaybackDrain = false;
          this.clearPlaybackDrainWatch();
          this.startAutoExitCountdown();
        }
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

  public async forceConversationMode(reason: string = 'manual'): Promise<void> {
    await this.setMode('conversation', reason);
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
  private clearPlaybackDrainWatch() {
    if (this.playbackDrainInterval) {
      clearInterval(this.playbackDrainInterval);
      this.playbackDrainInterval = null;
    }
  }

  private startAutoExitCountdown() {
    this.clearAutoExitTimer();
    const wakeMode = isWakeRoutineActive();
    const idleMs = wakeMode ? this.AUTO_EXIT_IDLE_WAKE_MS : this.AUTO_EXIT_IDLE_MS;
    this.autoExitDeadlineAt = Date.now() + idleMs;
    this.autoExitTimer = setTimeout(async () => {
      const userAfterAgent = (this.lastUserActivityAt ?? 0) > (this.lastAgentEndAt ?? 0);
      if (this.mode === 'conversation' && !userAfterAgent) {
        try { await this.setMode('silent', 'auto_exit'); } catch (e) { console.warn('auto-exit failed:', e); }
      }
    }, idleMs);
  }

  private noteUserActivity() {
    this.lastUserActivityAt = Date.now();
    // 会話継続のため、待機中タイマは一旦クリア（次の agent_end で再セット）
    this.clearAutoExitTimer();
  }

  // 起床タスクの粘着モードを明示的に解除し、差分指示をベースに戻す
  private clearWakeSticky(reason: string) {
    try {
      if (this.stickyTask === 'wake_up' && this.wakeActive) {
        unlockWakeAdvance(reason);
        this.wakeActive = false;
        this.stickyTask = null;
        this.stickyReady = false;
        if (this.wakeFollowUpTimer) {
          clearTimeout(this.wakeFollowUpTimer);
          this.wakeFollowUpTimer = null;
        }
        console.log('[WAKE_STICKY_CLEAR]', { reason });
      }
    } catch {}
  }

  private scheduleWakeFollowUp(delayMs = 30) {
    if (!this.session) return;
    if (this.wakeFollowUpTimer) {
      clearTimeout(this.wakeFollowUpTimer);
    }
    this.wakeFollowUpTimer = setTimeout(() => {
      this.wakeFollowUpTimer = null;
      if (!this.session) return;
      if (this.stickyTask !== 'wake_up' || !this.wakeActive) return;
      if (this.isGenerating || this.pendingAssistantResponse) {
        this.scheduleWakeFollowUp(50);
        return;
      }
      try {
        this.pendingAssistantResponse = true;
        (this.session as any)?.transport?.sendEvent?.({ type: 'response.create' });
      } catch (e) {
        this.pendingAssistantResponse = false;
        console.warn('Failed to queue wake follow-up:', e);
      }
    }, delayMs);
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
                threshold: 0.5,
                prefixPaddingMs: 300,
                silenceDurationMs: 500,
                interruptResponse: true,
                createResponse: true,
                idleTimeoutMs: 30_000
              }
            }
          }
        });
        this.mode = 'conversation';
        this.clearAutoExitTimer();
        this.lastUserActivityAt = null;
      } else {
        this.setOnboardingState('idle');
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
      // UI へ確定モードを通知（PTTフィードバック用）
      this.broadcast({ type: 'mode_set', mode: this.mode, reason });
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
          this.resolveReadyWaiters();
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
          // モード復元：wake中 or 生成中 or 直前が会話なら conversation 維持
          try {
            const wakeSticky = (this.stickyTask === 'wake_up' && this.wakeActive);
            const wantConversation = wakeSticky || this.isGenerating || this.mode === 'conversation';
            const desired: 'silent' | 'conversation' = wantConversation ? 'conversation' : 'silent';
            await this.setMode(desired, wakeSticky ? 'ready_wake_sticky' : (wantConversation ? 'ready_restore' : 'startup'));
          } catch {}
        } else if (
          event?.type === 'response.canceled' ||
          event?.type === 'response.completed' ||
          event?.type === 'response.done' ||
          event?.type === 'response.failed'
        ) {
          this.pendingAssistantResponse = false;
          this.flushSystemOpsIfIdle();
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
      this.pendingAssistantResponse = true;
      this.lastServerEventAt = Date.now();
      console.log('[AGENT_START]');
      // 会話継続中は自動終了カウントを停止（次の agent_end で再度開始）
      this.clearAutoExitTimer();
    });
    this.session.on('agent_end', (_ctx: any, _agent: any, _output: string) => {
      this.isGenerating = false;
      this.lastServerEventAt = Date.now();
      this.pendingAssistantResponse = false;
      console.log('[AGENT_END]');
      // 公式イベントに一本化
      this.broadcast({ type: 'agent_end' });
      this.flushSystemOpsIfIdle();
      // 自動終了は audio_stopped で開始する（ここでは開始しない）
    });

    // 音声データイベント（transport経由）
    this.session.transport.on('audio', (event: any) => {
      this.lastServerEventAt = Date.now();
      // PCM16形式の音声データをWebSocketにブロードキャスト
      this.broadcast({
        type: 'audio_output',
        data: Buffer.from(event.data).toString('base64'),
        format: 'pcm16'
      });
    });

    this.session.transport.on('input_audio_buffer.speech_started', () => {
      if (this.mode === 'conversation') {
        this.noteUserActivity();
      }
    });

    // 音声開始/終了
    this.session.on('audio_start', (_ctx: any, _agent: any) => {
      this.lastServerEventAt = Date.now();
      this.clearPlaybackDrainWatch();
      this.awaitingPlaybackDrain = false;
      this.isRendererPlaying = true;
      // wake中は最初の発話が始まった時点で解除ゲートを開く
      if (this.stickyTask === 'wake_up' && this.wakeActive && !this.stickyReady) {
        this.stickyReady = true;
      }
      console.log('🔊 Agent started speaking');
      this.broadcast({ type: 'audio_start' });
    });

    this.session.on('audio_stopped', (_ctx: any, _agent: any) => {
      this.lastServerEventAt = Date.now();
      console.log('🔊 Agent stopped speaking');
      this.broadcast({ type: 'audio_stopped' });
      // 起床中は即連鎖。非wakeは通常の無応答タイマー開始（AUTO_EXIT_IDLE_MS）
      if (this.stickyTask === 'wake_up' && this.wakeActive) {
        this.scheduleWakeFollowUp();
      } else {
        if (this.mode === 'conversation') {
          this.lastAgentEndAt = Date.now();
          this.awaitingPlaybackDrain = true;
          this.clearPlaybackDrainWatch();
          if (!this.isRendererPlaying) {
            this.awaitingPlaybackDrain = false;
            this.startAutoExitCountdown();
          } else {
            const startedAt = Date.now();
            this.playbackDrainInterval = setInterval(() => {
              if (!this.awaitingPlaybackDrain) {
                this.clearPlaybackDrainWatch();
                return;
              }
              if (!this.isRendererPlaying) {
                this.awaitingPlaybackDrain = false;
                this.clearPlaybackDrainWatch();
                this.startAutoExitCountdown();
                return;
              }
              if (Date.now() - startedAt >= this.AUTO_EXIT_IDLE_MS) {
                console.warn('playback drain timeout (renderer still playing)');
                this.awaitingPlaybackDrain = false;
                this.isRendererPlaying = false;
                this.clearPlaybackDrainWatch();
                this.startAutoExitCountdown();
              }
            }, 200);
          }
        }
      }
    });

    // 音声中断処理（transport経由）
    this.session.transport.on('audio_interrupted', () => {
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
        if (code === 'conversation_already_has_active_response') {
          this.pendingAssistantResponse = false;
        }
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
        // wake中はモードに関係なく、audio_start前の'user'は無視する
        if (this.stickyTask !== 'wake_up' || !this.wakeActive) {
          if (this.mode !== 'conversation') return;
        }
        // RealtimeItemとの整合: ユーザー発話のみで判定
        const isUser = (item?.type === 'message' && item?.role === 'user');
        if (isUser) {
          this.noteUserActivity();
          if (this.stickyTask === 'wake_up' && this.wakeActive) {
            if (!this.stickyReady) return;
            unlockWakeAdvance('user_message');
            this.clearWakeSticky('user_message');
            return;
          }
          unlockWakeAdvance('user_message');
        }
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

    // transport が完全に open するまで待機（readyState 0 で send しない）
    await new Promise<void>((resolve) => {
      const transport: any = this.session?.transport;
      if (!transport || transport.status === 'connected') {
        resolve();
        return;
      }
      const onConnected = () => {
        transport.off('connected', onConnected);
        resolve();
      };
      transport.once('connected', onConnected);
    });
    
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
    this.pendingAssistantResponse = false;
    this.apiKey = null;
    if (this.mcpRefreshInterval) {
      clearInterval(this.mcpRefreshInterval);
      this.mcpRefreshInterval = null;
    }
  }
  
  async sendAudio(audioData: Uint8Array) {
    if (!this.session) throw new Error('Session not connected');
    await this.session.sendAudio(audioData.buffer as ArrayBuffer);
  }
  
  async sendMessage(message: string) {
    if (!this.session) throw new Error('Session not connected');
    
    // 空メッセージチェック
    if (!message || !message.trim()) {
      console.warn('⚠️ Empty message, skipping send');
      return;
    }
    
    while (this.pendingAssistantResponse) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.pendingAssistantResponse = true;
    try {
      await this.session.sendMessage(message);
    } catch (error) {
      this.pendingAssistantResponse = false;
      throw error;
    }
  }
  
  private async saveSession(history: any) {
    try {
      const dir = path.dirname(this.sessionFilePath);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      try { await fs.chmod(dir, 0o700); } catch {}
      
      const sessionData = {
        history,
        timestamp: new Date().toISOString()
      };
      
      const encrypted = this.historyEncryption.encrypt(JSON.stringify(sessionData));
      await fs.writeFile(
        this.sessionFilePath,
        encrypted,
        { encoding: 'utf8', mode: 0o600 }
      );
      try { await fs.chmod(this.sessionFilePath, 0o600); } catch {}
      
      console.log('💾 Session saved');
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }
  
  public async restoreSession() {
    try {
      const data = await fs.readFile(this.sessionFilePath, 'utf8');
      if (!data.trim()) {
        console.log('📂 Session file is empty, skipping restore');
        return;
      }

      let decrypted: string;
      try {
        decrypted = this.historyEncryption.decrypt(data);
      } catch (decryptError) {
        console.error('❌ Session file decryption failed, resetting:', decryptError);
        await fs.unlink(this.sessionFilePath).catch(() => {});
        return;
      }

      let sessionData;
      try {
        sessionData = JSON.parse(decrypted);
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
    const lastEvOk = (Date.now() - (this.lastServerEventAt ?? 0)) <= 600_000; // 10min
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
      
      const { API_ENDPOINTS } = require('../config');
      const response = await fetch(API_ENDPOINTS.TOOLS.SLACK, {
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
- 呼び名:
- タイムゾーン:
- 起床トーン:
- 就寝場所:

## ルーティン
- 起床:
- 就寝:
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
        await this.sendMessage(systemMessage);
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
      const server = this.httpServer;
      this.httpServer = null;
      this.httpSockets.forEach((socket) => {
        try { socket.destroy(); } catch {}
      });
      this.httpSockets.clear();
      await Promise.race([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 500))
      ]);
    }
    
    // セッション切断
    await this.disconnect();
    
    console.log('🛑 SessionManager stopped');
  }
}
