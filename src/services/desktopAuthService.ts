import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { API_ENDPOINTS, PORTS } from '../config';
import { SimpleEncryption } from './simpleEncryption';

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
  // リフレッシュの並行実行を抑止
  private refreshInFlight: boolean = false;
  
  constructor() {
    // 認証情報の保存パス
    const aniccaDir = path.join(os.homedir(), '.anicca');
    if (!fs.existsSync(aniccaDir)) {
      fs.mkdirSync(aniccaDir, { recursive: true });
    }
    this.authFilePath = path.join(aniccaDir, 'auth.encrypted');
    
    // 暗号化サービスの初期化
    this.encryption = new SimpleEncryption();
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

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        const response = await fetch(API_ENDPOINTS.AUTH.REFRESH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: savedSession.refresh_token
          })
        });

        if (!response.ok) {
          // 401/403でも即セッションクリアしない（並行更新による競合の可能性）
          if (response.status === 401 || response.status === 403) {
            console.error('❌ 認証エラー - リフレッシュ中断（セッション保持）');
            return null;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.session) {
          this.currentSession = data.session;
          this.currentUser = data.session.user;
          this.saveSession(data.session);
          console.log('✅ セッションリフレッシュ成功');
          return data.session;
        }
        
        return null;
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
        // リフレッシュ失敗時は通常の間隔でリトライ
        this.startSessionCheck();
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
      const userId = this.getCurrentUserId() || 'desktop-user';
      const response = await fetch(`${API_ENDPOINTS.AUTH.GOOGLE_OAUTH}?userId=${userId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get OAuth URL: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success || !data.url) {
        throw new Error('Invalid response from auth server');
      }
      
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
      const sessionData = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user
      });
      
      // 新しい暗号化方式で保存
      const encrypted = this.encryption.encrypt(sessionData);
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
        const sessionData = JSON.parse(decrypted);
        
        // リフレッシュトークンがあれば期限切れでも返す
        if (sessionData.refresh_token) {
          return sessionData as AuthSession;
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
  
  // 50分間隔の定期チェックは廃止。scheduleNextRefreshのみ使用。
  
  /**
   * セッションを検証
   */
  // validateSessionは未使用につき削除
  
  /**
   * OAuth コールバックを処理
   */
  async handleOAuthCallback(code: string): Promise<boolean> {
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.CALLBACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      
      if (!response.ok) {
        throw new Error('Failed to exchange code for session');
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        this.currentSession = data.session;
        this.currentUser = data.session.user;
        this.saveSession(data.session);
        console.log('✅ OAuth login successful');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      return false;
    }
  }
  
  
  /**
   * ログアウト
   */
  async signOut(): Promise<void> {
    this.currentUser = null;
    this.currentSession = null;
    this.clearSavedSession();
    if (this.sessionCheckInterval) {
      clearTimeout(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
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
      if (this.isProxyJwtValid()) return this.proxyJwt;
      const session = this.loadSavedSession() || this.currentSession;
      const access = session?.access_token || null;
      if (!access) return null;
      const resp = await fetch(API_ENDPOINTS.AUTH.ENTITLEMENT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access}`
        },
        body: JSON.stringify({})
      });
      if (!resp.ok) {
        console.warn('Entitlement HTTP error:', resp.status);
        return null;
      }
      const data = await resp.json();
      if (!data?.token || !data?.expires_at) return null;
      this.proxyJwt = data.token;
      this.proxyJwtExpiresAt = Number(data.expires_at);
      console.log('🎫 Proxy JWT issued (short‑lived)');
      return this.proxyJwt;
    } catch (e: any) {
      console.warn('getProxyJwt error:', e?.message || e);
      return null;
    }
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
