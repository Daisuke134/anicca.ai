import { safeStorage } from 'electron';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { API_ENDPOINTS, PORTS, SUPABASE_CONFIG } from '../config';
import { isOnline } from '../services/network';
import { shouldLog } from '../utils/logRateLimit';
import { SimpleEncryption } from './simpleEncryption';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 認証セッションの型定義
interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

interface AuthUser {
  id: string;
  email: string;
  user_metadata?: any;
}

type EntitlementState = {
  plan: string;
  status: string;
  current_period_end: string | null;
  daily_usage_limit: number | null;
  daily_usage_remaining: number | null;
  daily_usage_count: number;
};

interface StoredSessionPayload {
  version: number;
  project?: {
    url?: string;
    fingerprint?: string;
  };
  session: AuthSession;
}

export class DesktopAuthService {
  private currentUser: AuthUser | null = null;
  private currentSession: AuthSession | null = null;
  private authFilePath: string;
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private encryption: SimpleEncryption;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  // Proxy短命JWT（利用権バッジ）
  private proxyJwt: string | null = null;
  private proxyJwtExpiresAt: number | null = null; // ms epoch
  private readonly proxyJwtSkewMs: number = 2 * 60 * 1000; // 2分の前倒し更新
  // 並行リフレッシュ抑止
  private refreshInFlight: boolean = false;
  // Supabaseクライアント（公開設定のみ／PKCE）
  private supabase: SupabaseClient | null = null;
  private entitlement: EntitlementState;
  private lastEntitlementFetchedAt: number | null = null;
  private readonly projectFingerprint: string;
  private readonly currentSupabaseHost: string | null;
  
  constructor() {
    // 認証情報の保存パス
    const aniccaDir = path.join(os.homedir(), '.anicca');
    if (!fs.existsSync(aniccaDir)) {
      fs.mkdirSync(aniccaDir, { recursive: true });
    }
    this.authFilePath = path.join(aniccaDir, 'auth.encrypted');
    
    // 暗号化サービスの初期化
    this.encryption = new SimpleEncryption();
    this.entitlement = this.createDefaultEntitlement();
    this.projectFingerprint = this.computeProjectFingerprint();
    this.currentSupabaseHost = this.normalizeHost(SUPABASE_CONFIG.URL);

    // Supabaseクライアント初期化（PKCE／公開設定のみ使用。ENVは読まない）
    if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
      console.error('Supabase config missing: embed appConfig.supabase.url / anonKey via extraMetadata.');
      this.supabase = null;
    } else {
      this.supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY, {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: false,  // リフレッシュは自前スケジューラで
          persistSession: false,    // 保存は暗号化ファイルで
          detectSessionInUrl: false
        }
      });
    }
  }
  
  /**
   * トークンの有効期限をローカルでチェック
   * Supabaseの推奨：5分前にリフレッシュ
   */
  private isTokenValid(session: AuthSession): boolean {
    if (!session?.expires_at) return false;
    const buffer = 5 * 60 * 1000; // 5分前
    const now = Date.now();
    const expiresAt = session.expires_at * 1000; // Unix timestamp to ms
    return now < (expiresAt - buffer);
  }

  private createDefaultEntitlement(): EntitlementState {
    return {
      plan: 'free',
      status: 'free',
      current_period_end: null,
      daily_usage_limit: null,
      daily_usage_remaining: null,
      daily_usage_count: 0
    };
  }

  private computeProjectFingerprint(): string {
    return createHash('sha256')
      .update(`${SUPABASE_CONFIG.URL}::${SUPABASE_CONFIG.ANON_KEY}`)
      .digest('hex');
  }

  private normalizeHost(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  }

  private extractJwtIssuerHost(token: string | null | undefined): string | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) normalized += '=';
    try {
      const decoded = Buffer.from(normalized, 'base64').toString('utf8');
      const payload = JSON.parse(decoded);
      if (typeof payload?.iss !== 'string') return null;
      return this.normalizeHost(payload.iss);
    } catch {
      return null;
    }
  }

  private sessionMatchesCurrentProject(
    session: AuthSession,
    projectMeta?: { url?: string; fingerprint?: string }
  ): boolean {
    if (!session) return false;
    if (projectMeta?.fingerprint) {
      return projectMeta.fingerprint === this.projectFingerprint;
    }
    if (projectMeta?.url && this.currentSupabaseHost) {
      const storedHost = this.normalizeHost(projectMeta.url);
      if (storedHost) return storedHost === this.currentSupabaseHost;
    }
    if (!this.currentSupabaseHost) return true;
    const tokenHost = this.extractJwtIssuerHost(session.access_token);
    return !tokenHost || tokenHost === this.currentSupabaseHost;
  }

  /**
   * ネットワークエラーかどうか判定
   * 一時的なネットワーク障害と認証エラーを区別
   */
  private isNetworkError(error: any): boolean {
    const networkErrorCodes = [
      'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 
      'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'
    ];
    
    return networkErrorCodes.includes(error?.code) ||
           error?.message?.includes('fetch failed') ||
           error?.message?.includes('NetworkError') ||
           error?.message?.includes('Failed to fetch');
  }

  /**
   * リトライ付きリフレッシュ
   * ネットワークエラー時は3回まで再試行
   */
  private async refreshWithRetry(): Promise<AuthSession | null> {
    const savedSession = this.loadSavedSession();
    if (!savedSession?.refresh_token) return null;

    if (this.refreshInFlight) {
      return savedSession;
    }
    this.refreshInFlight = true;
    try {
      // オフライン時は即座に最後のセッションを温存して終了
      if (!(await isOnline())) {
        console.log('📶 オフライン検出 - セッション一時維持（refresh skip）');
        return savedSession;
      }
      for (let i = 0; i < this.maxRetries; i++) {
        try {
          if (!this.supabase) throw new Error('Supabase client not initialized');
          const { data, error } = await this.supabase.auth.refreshSession({
            refresh_token: savedSession.refresh_token
          });
          if (error) {
            console.error('❌ 認証エラー - リフレッシュ失敗');
            return null;
          }
          const sess = data.session!;
          const usr = data.user!;
          const newSession: AuthSession = {
            access_token: sess?.access_token || '',
            refresh_token: sess?.refresh_token || '',
            expires_at: (sess?.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
            user: {
              id: usr?.id || '',
              email: usr?.email || '',
              user_metadata: usr?.user_metadata
            }
          };
          this.currentSession = newSession;
          this.currentUser = newSession.user;
          this.saveSession(newSession);
          console.log('✅ セッションリフレッシュ成功');
          return newSession;
        } catch (error) {
          console.log(`🔄 リトライ ${i + 1}/${this.maxRetries}:`, error);
          if (i === this.maxRetries - 1) {
            if (this.isNetworkError(error)) {
              console.log('📶 ネットワークエラー - セッション一時維持');
              return savedSession; // 最後のセッションを維持
            }
            throw error;
          }
          // 指数バックオフ：1秒、2秒、4秒...
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
      return null;
    } finally {
      this.refreshInFlight = false;
    }
  }

  /**
   * 動的スケジューリング
   * expires_atに基づいて最適なタイミングでリフレッシュ
   */
  private scheduleNextRefresh(expiresAt: number) {
    if (this.sessionCheckInterval) {
      clearTimeout(this.sessionCheckInterval);
    }
    
    const now = Date.now();
    const refreshTime = (expiresAt * 1000) - (10 * 60 * 1000); // 10分前
    const delay = Math.max(refreshTime - now, 60 * 1000); // 最小1分
    
    console.log(`⏰ 次回リフレッシュ: ${Math.round(delay / 60000)}分後`);
    
    this.sessionCheckInterval = setTimeout(async () => {
      console.log('🔄 定期リフレッシュ実行');
      const refreshed = await this.refreshWithRetry();
      if (refreshed) {
        this.scheduleNextRefresh(refreshed.expires_at);
      } else {
        // 失敗時は5分後に再試行
        setTimeout(async () => {
          const again = await this.refreshWithRetry();
          if (again) this.scheduleNextRefresh(again.expires_at);
        }, 5 * 60 * 1000);
      }
    }, delay);
  }

  /**
   * 初期化 - 保存された認証情報を復元（完全改良版）
   */
  async initialize(): Promise<void> {
    console.log('🔐 Desktop Auth Service初期化中...');
    
    try {
      this.encryption.cleanupOldFiles();
      const savedSession = this.loadSavedSession();
      
      if (savedSession) {
        console.log('📂 保存済みセッション検出');
        
        // ステップ1: ローカルで有効期限チェック（Context7推奨）
        if (this.isTokenValid(savedSession)) {
          // 有効ならサーバー確認をスキップ
          this.currentSession = savedSession;
          this.currentUser = savedSession.user;
          console.log('✅ セッション有効（ローカル確認のみ）');
          console.log(`✅ ユーザー: ${savedSession.user?.email}`);
          
          // 動的なリフレッシュスケジュール設定
          this.scheduleNextRefresh(savedSession.expires_at);
          return;
        }
        
        // ステップ2: 期限切れならリフレッシュ
        console.log('⏰ トークン期限切れ - リフレッシュ試行');
        try {
          const refreshed = await this.refreshWithRetry();
          if (refreshed) {
            this.scheduleNextRefresh(refreshed.expires_at);
            return;
          }
        } catch (error) {
          if (this.isNetworkError(error)) {
            // ネットワークエラーなら一時的にセッション維持
            console.log('📶 オフライン検出 - 5分後に再試行');
            this.currentSession = savedSession;
            this.currentUser = savedSession.user;
            
            // 5分後に再試行
            setTimeout(() => this.initialize(), 5 * 60 * 1000);
            return;
          }
          // 認証エラーならクリア
          console.log('❌ 認証失敗 - ログイン必要');
          this.clearSavedSession();
        }
      } else {
        console.log('ℹ️ 初回起動 - ログインが必要です');
      }
      
      // 周期チェック（Interval）は廃止。期限前スケジュールのみ。
    } catch (error) {
      console.error('❌ 初期化エラー:', error);
    }
  }
  
  /**
   * 現在のユーザーを取得
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }
  
  /**
   * 現在のユーザーIDを取得
   */
  getCurrentUserId(): string | null {
    return this.currentUser?.id || null;
  }
  
  /**
   * 現在のユーザー名を取得
   */
  getCurrentUserName(): string {
    return this.currentUser?.email || 'ゲスト';
  }
  
  /**
   * 認証済みかどうか
   */
  isAuthenticated(): boolean {
    return !!this.currentUser && !!this.currentSession && this.isTokenValid(this.currentSession);
  }
  
  /**
   * Google OAuth URLを取得
   */
  async getGoogleOAuthUrl(): Promise<string> {
    try {
      if (!this.supabase) throw new Error('Supabase client not initialized');
      const redirectTo = `http://localhost:${PORTS.OAUTH_CALLBACK}/auth/callback`;
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          scopes: 'email profile',
          // 型互換のため any キャスト。実行時はPKCEを有効化
          ...( { flowType: 'pkce' } as any ),
          // リフレッシュ発行を確実化
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No OAuth URL generated');
      return data.url;
    } catch (error) {
      console.error('❌ Failed to get Google OAuth URL:', error);
      throw error;
    }
  }
  
  /**
   * セッションをリフレッシュ（レガシー互換用）
   */
  async refreshSession(): Promise<AuthSession | null> {
    return await this.refreshWithRetry();
  }
  
  /**
   * セッションを保存
   */
  private saveSession(session: AuthSession): void {
    try {
      const sessionData: StoredSessionPayload = {
        version: 2,
        project: {
          url: SUPABASE_CONFIG.URL,
          fingerprint: this.projectFingerprint
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user: session.user
        }
      };
      
      // 新しい暗号化方式で保存
      const encrypted = this.encryption.encrypt(JSON.stringify(sessionData));
      fs.writeFileSync(this.authFilePath, encrypted, 'utf8');
      console.log('💾 Session saved securely with dual encryption');
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  }
  
  /**
   * 保存されたセッションを読み込む
   */
  private loadSavedSession(): AuthSession | null {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const encrypted = fs.readFileSync(this.authFilePath, 'utf8');
        
        // 新しい暗号化方式で復号
        const decrypted = this.encryption.decrypt(encrypted);
        const payload = JSON.parse(decrypted);

        if (payload?.version === 2 && payload?.session) {
          const stored = payload as StoredSessionPayload;
          if (!this.sessionMatchesCurrentProject(stored.session, stored.project)) {
            console.warn('♻️ Saved Supabase session belongs to another project, resetting.');
            this.reset('supabase project mismatch');
            return null;
          }
          return stored.session;
        }

        if (payload?.refresh_token) {
          const legacySession = payload as AuthSession;
          if (!this.sessionMatchesCurrentProject(legacySession)) {
            console.warn('♻️ Legacy Supabase session belongs to another project, resetting.');
            this.reset('legacy supabase project mismatch');
            return null;
          }
          return legacySession;
        }
      }
    } catch (error) {
      console.error('❌ Failed to load saved session:', error);
      // エラー時は破損したファイルを削除
      this.clearSavedSession();
    }
    
    return null;
  }

  /**
   * セッションと内部状態を完全にリセット
   */
  reset(reason?: string): void {
    console.log(`♻️ DesktopAuthService reset${reason ? ` (${reason})` : ''}`);
    this.currentUser = null;
    this.currentSession = null;
    this.proxyJwt = null;
    this.proxyJwtExpiresAt = null;
    this.refreshInFlight = false;
    this.retryCount = 0;
    if (this.sessionCheckInterval) {
      clearTimeout(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    this.entitlement = this.createDefaultEntitlement();
    this.lastEntitlementFetchedAt = null;
    this.clearSavedSession();
  }

  /**
   * 保存されたセッションをクリア
   */
  private clearSavedSession(): void {
    try {
      if (fs.existsSync(this.authFilePath)) {
        fs.unlinkSync(this.authFilePath);
        console.log('🗑️ Saved session cleared');
      }
    } catch (error) {
      console.error('❌ Failed to clear saved session:', error);
    }
  }
  
  /**
   * 定期的なセッションチェックを開始（50分間隔）
   */
  // 削除：Interval方式の周期チェックは使用しない

  /**
   * セッションチェックを停止
   */
  // 削除：stopSessionCheck は不要
  
  /**
   * セッションを検証
   */
  private async validateSession(session: AuthSession): Promise<AuthSession | null> {
    // 削除：未使用
    return null;
  }
  
  /**
   * OAuth コールバックを処理
   */
  async handleOAuthCallback(code: string): Promise<boolean> {
    try {
      if (!this.supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await this.supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      const sess = data.session!;
      const usr = data.user!;
      const newSession: AuthSession = {
        access_token: sess?.access_token || '',
        refresh_token: sess?.refresh_token || '',
        expires_at: (sess?.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
        user: {
          id: usr?.id || '',
          email: usr?.email || '',
          user_metadata: usr?.user_metadata
        }
      };
      this.currentSession = newSession;
      this.currentUser = newSession.user;
      this.saveSession(newSession);
      this.scheduleNextRefresh(newSession.expires_at);
      console.log('✅ OAuth login successful');
      await this.refreshPlan().catch(() => null);
      return true;
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      return false;
    }
  }
  
  
  /**
   * ログアウト
   */
  async signOut(): Promise<void> {
    this.reset('sign-out');
  }

  /**
   * 現在のデスクトップJWT（Proxy API 認可用）
   */
  getJwt(): string | null {
    return this.currentSession?.access_token || null;
  }

  /**
   * Proxy JWTが有効か
   */
  private isProxyJwtValid(): boolean {
    if (!this.proxyJwt || !this.proxyJwtExpiresAt) return false;
    return Date.now() < (this.proxyJwtExpiresAt - this.proxyJwtSkewMs);
  }

  /**
   * Proxy API用の短命JWTを取得（必要時に発行）。メモリ保持のみ。
   * Authorization: Bearer <Supabase access_token>
   */
  async getProxyJwt(): Promise<string | null> {
    try {
      if (!(await isOnline())) {
        if (shouldLog('getProxyJwt.offline', 30000)) {
          console.log('📶 オフライン検出 - Proxy JWT発行をスキップ');
        }
        return null;
      }
      if (this.isProxyJwtValid()) return this.proxyJwt;
      const session = this.loadSavedSession() || this.currentSession;
      const access = session?.access_token || null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (access) {
        headers.Authorization = `Bearer ${access}`;
      }
      const resp = await fetch(API_ENDPOINTS.AUTH.ENTITLEMENT, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      if (resp.status === 401) {
        console.warn('Entitlement HTTP error: 401 - clearing stored Supabase session');
        this.reset('proxy unauthorized');
        return null;
      }
      if (resp.status === 402) {
        const data = await resp.json().catch(() => ({}));
        this.updateEntitlement(data?.entitlement);
        const err: any = new Error(data?.message || 'Quota exceeded');
        err.code = 'PAYMENT_REQUIRED';
        err.entitlement = this.getPlanInfo();
        throw err;
      }
      if (!resp.ok) {
        console.warn('Entitlement HTTP error:', resp.status);
        return null;
      }
      const data = await resp.json();
      if (!data?.token || !data?.expires_at) return null;
      if (data?.entitlement) {
        this.updateEntitlement(data.entitlement);
      }
      this.proxyJwt = data.token;
      this.proxyJwtExpiresAt = Number(data.expires_at);
      this.lastEntitlementFetchedAt = Date.now();
      console.log('🎫 Proxy JWT issued (short‑lived)');
      return this.proxyJwt;
    } catch (e: any) {
      if (shouldLog('getProxyJwt.error', 30000)) {
        console.warn('getProxyJwt error:', e?.message || e);
      }
      throw e;
    }
  }

  private updateEntitlement(info?: any) {
    if (!info) {
      return;
    }
    this.entitlement = {
      plan: info.plan || 'free',
      status: info.status || info.plan || 'free',
      current_period_end: info.current_period_end ?? null,
      daily_usage_limit: typeof info.daily_usage_limit === 'number' ? info.daily_usage_limit : null,
      daily_usage_remaining: typeof info.daily_usage_remaining === 'number' ? info.daily_usage_remaining : null,
      daily_usage_count: typeof info.daily_usage_count === 'number' ? info.daily_usage_count : 0
    };
    this.lastEntitlementFetchedAt = Date.now();
  }

  getPlanInfo() {
    return {
      ...this.entitlement,
      fetched_at: this.lastEntitlementFetchedAt
    };
  }

  async refreshPlan() {
    this.proxyJwt = null;
    this.proxyJwtExpiresAt = null;
    await this.getProxyJwt().catch(() => null);
    return this.getPlanInfo();
  }
}

// シングルトンインスタンス
let authServiceInstance: DesktopAuthService | null = null;

export function getAuthService(): DesktopAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new DesktopAuthService();
  }
  return authServiceInstance;
}
