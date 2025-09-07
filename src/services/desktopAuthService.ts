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
          // 401/403は認証エラーなのでリトライしない
          if (response.status === 401 || response.status === 403) {
            console.error('❌ 認証エラー - セッションクリア');
            this.clearSavedSession();
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
      
      // デフォルトのチェック間隔を設定
      this.startSessionCheck();
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
  
  /**
   * 定期的なセッションチェックを開始（50分間隔）
   */
  private startSessionCheck(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
    
    // 50分ごとにチェック（Supabaseトークン有効期限1時間）
    this.sessionCheckInterval = setInterval(async () => {
      const saved = this.loadSavedSession();
      if (saved && !this.isTokenValid(saved)) {
        console.log('🔄 定期チェック: トークンリフレッシュ');
        await this.refreshWithRetry();
      }
    }, 50 * 60 * 1000); // 50分
  }

  /**
   * セッションチェックを停止
   */
  private stopSessionCheck(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }
  
  /**
   * セッションを検証
   */
  private async validateSession(session: AuthSession): Promise<AuthSession | null> {
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.SESSION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        return data.session;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Session validation error:', error);
      return null;
    }
  }
  
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
   * トークンを直接処理（Implicit Flow用）
   */
  async handleTokens(tokens: { access_token: string; refresh_token: string; expires_at: number }): Promise<boolean> {
    try {
      // プロキシ経由でセッションを検証
      const response = await fetch(API_ENDPOINTS.AUTH.SESSION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to validate session');
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        // セッションを保存
        this.currentSession = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          user: data.session.user
        };
        this.currentUser = data.session.user;
        this.saveSession(this.currentSession);
        console.log('✅ Token authentication successful');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Token handling error:', error);
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
    this.stopSessionCheck();
  }

  /**
   * 現在のデスクトップJWT（Proxy API 認可用）
   */
  getJwt(): string | null {
    return this.currentSession?.access_token || null;
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
