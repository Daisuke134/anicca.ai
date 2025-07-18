import { safeStorage } from 'electron';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Supabase設定（Web版と同じプロジェクト）
const SUPABASE_URL = 'https://mzkwtwourrkduqkrsxpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16a3d0d291cnJrZHVxa3JzeHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExNzQ1NjYsImV4cCI6MjA2Njc1MDU2Nn0.ihBs1cpz_sgR6UUZpIrICuN3b-gJNrfzWsfNVlpP4hs';

export class DesktopAuthService {
  private supabase: SupabaseClient;
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private authFilePath: string;
  
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // 認証情報の保存パス
    const aniccaDir = path.join(os.homedir(), '.anicca');
    if (!fs.existsSync(aniccaDir)) {
      fs.mkdirSync(aniccaDir, { recursive: true });
    }
    this.authFilePath = path.join(aniccaDir, 'auth.encrypted');
  }
  
  /**
   * 初期化 - 保存された認証情報を復元
   */
  async initialize(): Promise<void> {
    console.log('🔐 Initializing Desktop Auth Service...');
    
    try {
      // 保存された認証情報を読み込む
      const savedSession = this.loadSavedSession();
      if (savedSession) {
        console.log('📂 Found saved session, attempting to restore...');
        const { data, error } = await this.supabase.auth.setSession(savedSession);
        
        if (data?.session && !error) {
          this.currentSession = data.session;
          this.currentUser = data.user;
          console.log('✅ Session restored successfully for user:', data.user?.email);
        } else {
          console.log('❌ Failed to restore session:', error?.message);
          // 無効なセッションを削除
          this.clearSavedSession();
        }
      }
      
      // 認証状態の変更を監視
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔄 Auth state changed:', event);
        this.currentSession = session;
        this.currentUser = session?.user || null;
        
        if (event === 'SIGNED_IN' && session) {
          // ログイン成功時にセッションを保存
          this.saveSession(session);
        } else if (event === 'SIGNED_OUT') {
          // ログアウト時に保存情報をクリア
          this.clearSavedSession();
        }
      });
      
    } catch (error) {
      console.error('❌ Auth initialization error:', error);
    }
  }
  
  /**
   * 現在のユーザーを取得
   */
  getCurrentUser(): User | null {
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
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
        skipBrowserRedirect: true
      }
    });
    
    if (error) {
      throw error;
    }
    
    return data.url;
  }
  
  /**
   * セッションを保存
   */
  private saveSession(session: Session): void {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const sessionData = JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at
        });
        const encrypted = safeStorage.encryptString(sessionData);
        fs.writeFileSync(this.authFilePath, encrypted);
        console.log('💾 Session saved securely');
      }
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  }
  
  /**
   * 保存されたセッションを読み込む
   */
  private loadSavedSession(): Session | null {
    try {
      if (fs.existsSync(this.authFilePath) && safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(this.authFilePath);
        const decrypted = safeStorage.decryptString(encrypted);
        const sessionData = JSON.parse(decrypted);
        
        // 有効期限チェック
        if (sessionData.expires_at && new Date(sessionData.expires_at * 1000) > new Date()) {
          return sessionData as Session;
        }
      }
    } catch (error) {
      console.error('❌ Failed to load saved session:', error);
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
   * ログアウト
   */
  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUser = null;
    this.currentSession = null;
    this.clearSavedSession();
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