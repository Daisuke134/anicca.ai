import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DesktopAuthService } from '../../services/desktopAuthService';
import { AniccaSessionManager } from '../sessionManager';
import fetch from 'node-fetch';

// Electronのテスト環境対応: safeStorageをモック
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false, // テスト環境では暗号化無効
    encryptString: (text: string) => Buffer.from(text, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8')
  },
  app: {
    getPath: (name: string) => '/tmp/test-anicca'
  }
}));

/**
 * TDD-RED: 認証フロー統合テスト
 * 
 * 目的: Google認証後のトレイ更新が失敗する問題を検証する
 * 対象問題:
 * 1. main-voice-simple.ts:60行目のauthService.initialize()再呼び出し
 * 2. onUserAuthenticatedコールバックでセッション破壊
 * 3. SessionManagerとvoiceServerの/auth/complete動作差異
 * 
 * 期待: これらのテストは失敗する（TDD-RED）
 */
describe('認証フロー統合テスト - 実際の問題検証', () => {
  let sessionManager: AniccaSessionManager;
  let authService: DesktopAuthService;
  
  beforeAll(async () => {
    console.log('🧪 認証フロー問題検証テスト開始');
    
    // 実際のクラスインスタンスを作成（モックなし）
    authService = new DesktopAuthService();
    await authService.initialize();
    
    sessionManager = new AniccaSessionManager();
    await sessionManager.initialize();
    await sessionManager.startBridge(8085); // 実際のポート番号
  }, 30000);
  
  afterAll(async () => {
    if (sessionManager) {
      await sessionManager.stop();
    }
    console.log('🛑 認証フロー問題検証テスト終了');
  });

  /**
   * 核心的問題1: authService.initialize()の再呼び出し
   * 
   * 期待する入力/出力ペア:
   * 入力: 有効なセッション保存後、initialize()を再度呼ぶ
   * 期待する出力: セッションが保持される
   * 実際の出力: セッションが破壊される（TDD-RED）
   */
  it('authService.initialize()の再呼び出しでセッションが破壊される問題', async () => {
    console.log('🔍 テスト1: authService.initialize()再呼び出し問題');
    
    // 1. 有効なセッションデータを作成
    const validSession = {
      access_token: 'test-access-token-' + Date.now(),
      refresh_token: 'test-refresh-token-' + Date.now(),
      expires_at: Date.now() + 3600000, // 1時間後
      user: {
        id: 'test-user-12345',
        email: 'test.user@example.com',
        user_metadata: { 
          full_name: 'Test User',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      }
    };
    
    // 2. セッションを直接設定（currentSessionとcurrentUserの両方）
    (authService as any).currentSession = validSession;
    (authService as any).currentUser = validSession.user;
    
    // 3. 認証済み状態を確認
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getCurrentUserName()).toBe('Test User');
    expect(authService.getCurrentUserId()).toBe('test-user-12345');
    
    console.log('✅ セッション設定完了:', {
      authenticated: authService.isAuthenticated(),
      userName: authService.getCurrentUserName(),
      userId: authService.getCurrentUserId()
    });
    
    // 4. main-voice-simple.ts:60行目と同じ処理を実行
    // 問題のコード: await authService.initialize();
    await authService.initialize();
    
    // 5. 期待: セッションが保持される（TDD-RED: 実際は破壊される）
    console.log('🔍 initialize()再呼び出し後の状態:', {
      authenticated: authService.isAuthenticated(),
      userName: authService.getCurrentUserName(),
      userId: authService.getCurrentUserId()
    });
    
    // このテストは失敗するはず（セッションが消える）
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getCurrentUserName()).toBe('Test User');
    expect(authService.getCurrentUserId()).toBe('test-user-12345');
  });

  /**
   * 核心的問題2: onUserAuthenticatedコールバックの問題
   * 
   * 期待する入力/出力ペア:
   * 入力: Google認証完了後のユーザーデータ
   * 期待する出力: トレイメニューが更新される
   * 実際の出力: initialize()でセッション破壊、トレイ更新失敗
   */
  it('onUserAuthenticatedコールバックでトレイ更新が失敗する問題', async () => {
    console.log('🔍 テスト2: onUserAuthenticatedコールバック問題');
    
    // 1. 認証前の状態を設定
    (authService as any).currentSession = null;
    (authService as any).currentUser = null;
    expect(authService.isAuthenticated()).toBe(false);
    
    // 2. トレイ更新のスパイ関数
    let trayUpdateCalled = false;
    const mockUpdateTrayMenu = vi.fn(() => {
      trayUpdateCalled = true;
    });
    
    // 3. グローバルupdateTrayMenu関数をモック
    const originalUpdateTrayMenu = (global as any).updateTrayMenu;
    (global as any).updateTrayMenu = mockUpdateTrayMenu;
    
    // 4. 現在のmain-voice-simple.ts:55-71行目のコードを再現
    const problematicOnUserAuthenticated = async (user: any) => {
      console.log('🎉 User authenticated via browser:', user.email);
      
      // 問題のコード: authService.initialize()を再度呼ぶ
      if (authService) {
        await authService.initialize(); // ← これが問題！
      }
      
      // sessionManagerにユーザーIDを設定
      if (sessionManager && user.id) {
        sessionManager?.setCurrentUserId(user.id);
        console.log(`✅ Updated session manager with user ID: ${user.id}`);
      }
      
      // トレイメニュー更新
      if ((global as any).updateTrayMenu) {
        (global as any).updateTrayMenu();
      }
    };
    
    // 5. 認証成功をシミュレート（先にhandleTokensでセッション作成）
    const testTokens = {
      access_token: 'callback-token-' + Date.now(),
      refresh_token: 'callback-refresh-' + Date.now(),
      expires_at: Date.now() + 3600000
    };
    
    // セッションを設定（handleTokensの代わり）
    (authService as any).currentSession = {
      ...testTokens,
      user: {
        id: 'callback-user-id',
        email: 'callback@example.com',
        user_metadata: { full_name: 'Callback User' }
      }
    };
    (authService as any).currentUser = {
      id: 'callback-user-id',
      email: 'callback@example.com',
      user_metadata: { full_name: 'Callback User' }
    };
    
    expect(authService.isAuthenticated()).toBe(true);
    console.log('✅ 認証セッション設定完了');
    
    // 6. 問題のコールバックを実行
    await problematicOnUserAuthenticated({
      id: 'callback-user-id',
      email: 'callback@example.com',
      user_metadata: { full_name: 'Callback User' }
    });
    
    // 7. 期待: 認証状態が保持され、トレイが更新される（TDD-RED: 実際は失敗）
    console.log('🔍 コールバック実行後の状態:', {
      authenticated: authService.isAuthenticated(),
      trayUpdateCalled: trayUpdateCalled,
      mockCallCount: mockUpdateTrayMenu.mock.calls.length
    });
    
    // このテストは失敗するはず（initialize()でセッション破壊）
    expect(authService.isAuthenticated()).toBe(true);
    expect(trayUpdateCalled).toBe(true);
    
    // クリーンアップ
    (global as any).updateTrayMenu = originalUpdateTrayMenu;
  });

  /**
   * 核心的問題3: SessionManagerの/auth/completeエンドポイント
   * 
   * 期待する入力/出力ペア:
   * 入力: Google OAuthからのトークン
   * 期待する出力: 認証成功、onUserAuthenticatedコールバック発火
   * 実際の出力: プロキシ検証失敗（テストトークンのため）
   */
  it('SessionManagerの/auth/completeが実際のトークン検証で失敗する', async () => {
    console.log('🔍 テスト3: SessionManagerの/auth/completeエンドポイント');
    
    // 1. onUserAuthenticatedコールバックのスパイ
    let callbackCalled = false;
    let callbackUser: any = null;
    const originalCallback = (global as any).onUserAuthenticated;
    
    (global as any).onUserAuthenticated = (user: any) => {
      callbackCalled = true;
      callbackUser = user;
      console.log('🎉 onUserAuthenticated called with:', user);
    };
    
    // 2. テスト用のトークンデータ（実際のプロキシでは検証失敗する）
    const testAuthData = {
      access_token: 'fake-test-token-' + Date.now(),
      refresh_token: 'fake-test-refresh-' + Date.now(),
      expires_at: String(Date.now() + 3600000)
    };
    
    console.log('📤 /auth/completeにPOST送信:', testAuthData);
    
    // 3. SessionManagerの/auth/completeエンドポイントに送信
    const response = await fetch('http://localhost:8085/auth/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testAuthData)
    });
    
    const responseData = await response.json();
    console.log('📥 /auth/complete レスポンス:', {
      status: response.status,
      ok: response.ok,
      data: responseData
    });
    
    // 4. 期待: 認証成功、コールバック発火（TDD-RED: プロキシ検証で失敗）
    // 実際はプロキシの/api/auth/google/sessionでテストトークンを検証できないため失敗
    expect(response.ok).toBe(true);
    expect(callbackCalled).toBe(true);
    expect(callbackUser).toBeDefined();
    expect(callbackUser.email).toBeDefined();
    
    console.log('🔍 コールバック実行結果:', {
      callbackCalled,
      callbackUser: callbackUser ? callbackUser.email : null
    });
    
    // クリーンアップ
    (global as any).onUserAuthenticated = originalCallback;
  });

  /**
   * 補助テスト: 前提条件の確認
   */
  it('SessionManagerとDesktopAuthServiceが正しく初期化されている', async () => {
    // 前提条件のテスト（これは成功するはず）
    console.log('🔍 前提条件確認');
    
    expect(sessionManager).toBeDefined();
    expect(authService).toBeDefined();
    expect(sessionManager.isConnected()).toBe(false); // APIキーなしなので未接続
    
    console.log('✅ 前提条件確認完了:', {
      sessionManager: !!sessionManager,
      authService: !!authService,
      connected: sessionManager.isConnected()
    });
  });
});