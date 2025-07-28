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
   * 初期化 - 保存された認証情報を復元
   */
  async initialize(): Promise<void> {
    console.log('🔐 Initializing Desktop Auth Service...');
    
    try {
      // 古い暗号化ファイルのクリーンアップ
      this.encryption.cleanupOldFiles();
      
      // 保存された認証情報を読み込む
      const savedSession = this.loadSavedSession();
      if (savedSession) {
        console.log('📂 Found saved session, attempting to restore...');
        
        // プロキシ経由でセッションを確認
        const validatedSession = await this.validateSession(savedSession);
        
        if (validatedSession) {
          this.currentSession = validatedSession;
          this.currentUser = validatedSession.user;
          console.log('✅ Session restored successfully for user:', validatedSession.user?.email);
        } else if (savedSession.refresh_token) {
          // セッションが無効ならリフレッシュを試行
          console.log('🔄 Session expired, attempting to refresh...');
          const refreshedSession = await this.refreshSession();
          if (!refreshedSession) {
            this.clearSavedSession();
          }
        } else {
          console.log('❌ Failed to restore session');
          this.clearSavedSession();
        }
      }
      
      // 30分ごとにセッションをチェック
      this.startSessionCheck();
      
    } catch (error) {
      console.error('❌ Auth initialization error:', error);
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
    return !!this.currentUser && !!this.currentSession;
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
   * セッションをリフレッシュ
   */
  async refreshSession(): Promise<AuthSession | null> {
    try {
      const savedSession = this.loadSavedSession();
      if (!savedSession?.refresh_token) {
        return null;
      }
      
      const response = await fetch(API_ENDPOINTS.AUTH.REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: savedSession.refresh_token
        })
      });
      
      if (!response.ok) {
        console.error('❌ Failed to refresh session:', response.statusText);
        return null;
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        this.currentSession = data.session;
        this.currentUser = data.session.user;
        this.saveSession(data.session);
        console.log('✅ Session refreshed successfully');
        return data.session;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Refresh session error:', error);
      return null;
    }
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
   * 定期的なセッションチェックを開始
   */
  private startSessionCheck(): void {
    // 既存のインターバルがあればクリア
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
    
    // 30分ごとにチェック
    this.sessionCheckInterval = setInterval(async () => {
      if (this.currentSession) {
        const expiresAt = this.currentSession.expires_at;
        if (expiresAt) {
          const expiresIn = expiresAt * 1000 - Date.now();
          // 有効期限が1時間以内に迫ったらリフレッシュ
          if (expiresIn < 60 * 60 * 1000) {
            console.log('🔄 Session expires soon, refreshing...');
            await this.refreshSession();
          }
        }
      }
    }, 30 * 60 * 1000); // 30分
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
}

// シングルトンインスタンス
let authServiceInstance: DesktopAuthService | null = null;

export function getAuthService(): DesktopAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new DesktopAuthService();
  }
  return authServiceInstance;
}