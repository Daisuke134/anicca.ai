import { app, Tray, Menu, nativeImage, BrowserWindow, powerSaveBlocker, dialog, powerMonitor, globalShortcut, shell, MenuItemConstructorOptions, ipcMain } from 'electron';
import { jsonrepair } from 'jsonrepair';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { setTracingDisabled } from '@openai/agents';
import { getAuthService, DesktopAuthService } from './services/desktopAuthService';
import { API_ENDPOINTS, PORTS, UPDATE_CONFIG } from './config';
import { resolveBridgeAuthToken } from './services/bridgeToken';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as os from 'os';
// SDK imports
import { AniccaSessionManager } from './agents/sessionManager';
import { createAniccaAgent } from './agents/mainAgent';
import {
  ensureBaselineFiles,
  shouldRunOnboarding,
  resolveOnboardingPrompt,
  syncTodayTasksFromMarkdown
} from './services/onboardingBootstrap';
import { buildRoutinePrompt } from './services/routines';

// 環境変数を読み込み
dotenv.config();
let BRIDGE_AUTH_TOKEN: string | null = null;
const getBridgeToken = (): string => {
  if (!BRIDGE_AUTH_TOKEN) {
    throw new Error('Bridge token not initialized');
  }
  return BRIDGE_AUTH_TOKEN;
};
// ログ初期化（全環境でファイル出力）
const log = require('electron-log/main');
log.initialize();
log.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
// すべてのconsole出力をelectron-logに流す（main.logに記録）
;(console as any).log = (...args: any[]) => log.info(...args);
;(console as any).info = (...args: any[]) => log.info(...args);
;(console as any).warn = (...args: any[]) => log.warn(...args);
;(console as any).error = (...args: any[]) => log.error(...args);
;(console as any).debug = (...args: any[]) => log.debug(...args);

// グローバル変数
let tray: Tray | null = null;
let hiddenWindow: BrowserWindow | null = null;
let sessionManager: AniccaSessionManager | null = null;
let mainAgent: any = null;
let currentUserId: string | null = null;
let isListening = false;
let authService: DesktopAuthService | null = null;
let powerSaveBlockerId: number | null = null;
let updateCheckIntervalId: NodeJS.Timeout | null = null;
let planRefreshIntervalId: NodeJS.Timeout | null = null;
let planRefreshBurstIntervalId: NodeJS.Timeout | null = null;
let planRefreshBurstDeadline = 0;
let sessionEventDisposer: (() => void) | null = null;

const forwardSessionEvent = (payload: any) => {
  try {
    hiddenWindow?.webContents.send('realtime:event', payload);
  } catch (error) {
    console.warn('Failed to forward realtime event to renderer:', error);
  }
};

const attachSessionEventSink = () => {
  if (!sessionManager) return;
  sessionEventDisposer?.();
  sessionEventDisposer = sessionManager.onEvent(forwardSessionEvent);
};

ipcMain.handle('realtime:get-client-secret', async () => {
  if (!sessionManager) throw new Error('Session manager not initialized');
  return sessionManager.getClientSecret();
});

ipcMain.on('realtime:call-id', async (_event, callId: string) => {
  if (!sessionManager) {
    console.warn('call_id received before session manager init');
    return;
  }
  await sessionManager.attachSideband(callId);
});

ipcMain.handle('realtime:set-mode', async (_event, payload: { mode: 'silent' | 'conversation'; reason: string }) => {
  if (!sessionManager) throw new Error('Session manager not initialized');
  await sessionManager.controlMode(payload.mode, payload.reason ?? 'ipc');
});

ipcMain.handle('realtime:restart', async () => {
  if (!sessionManager) return;
  await sessionManager.forceConversationMode('renderer_restart');
});

ipcMain.handle('realtime:set-timezone', async (_event, tz: string) => {
  if (!sessionManager) throw new Error('Session manager not initialized');
  await sessionManager.setUserTimezone(tz);
});

// 起動モードの判定
const isWorkerMode = process.env.WORKER_MODE === 'true';

// 定期タスク管理
const cronJobs = new Map<string, any>();
let cronInitialized = false; // 多重登録防止（冪等化フラグ）
let tasksWatcherRegistered = false;
let onboardingQueued = false;
const homeDir = os.homedir();
const aniccaDir = path.join(homeDir, '.anicca');
const scheduledTasksPath = path.join(aniccaDir, 'scheduled_tasks.json');
const todaySchedulePath = path.join(aniccaDir, 'today_schedule.json');
const tasksMarkdownPath = path.join(aniccaDir, 'tasks.md');

// アプリの初期化
async function initializeApp() {
  BRIDGE_AUTH_TOKEN = resolveBridgeAuthToken();
  if (!BRIDGE_AUTH_TOKEN) {
    throw new Error('Failed to resolve bridge auth token');
  }
  process.env.BRIDGE_AUTH_TOKEN = BRIDGE_AUTH_TOKEN;
  (global as any).BRIDGE_AUTH_TOKEN = BRIDGE_AUTH_TOKEN;

  await ensureBaselineFiles();
  syncTodayTasksFromMarkdown();
  const shouldLaunchOnboarding = false; // TODO: Re-enable after onboarding prompt revamp

  // トレースを無効化（MCPツールの取得でエラーになるため）
  setTracingDisabled(true);
  
  // 実行時のチャンネル/接続先を可視化
  try {
    // 遅延importで循環依存を避ける
    const { UPDATE_CONFIG, PROXY_URL, APP_VERSION_STR } = require('./config');
    console.log(`🔎 App Version: ${APP_VERSION_STR}`);
    console.log(`🔎 Update Channel: ${UPDATE_CONFIG.CHANNEL}`);
    console.log(`🔎 Proxy URL: ${PROXY_URL}`);
  } catch (e) {
    console.warn('⚠️ Failed to log runtime config:', e);
  }

  console.log('🎩 Anicca Voice Assistant Starting...');
  
  try {
    // 認証サービスの初期化
    authService = getAuthService();
    await authService.initialize();
    console.log('✅ Auth service initialized');

    await authService.refreshPlan().catch(() => null);
    startPlanRefreshInterval();
    updateTrayMenu();

    // 認証状態をチェック
    if (!authService.isAuthenticated()) {
      console.log('⚠️ User not authenticated');
      showNotification('Login required', 'Open the tray icon and click "Login with Google" to continue.');
    } else {
      const userName = authService.getCurrentUserName();
      console.log(`✅ Authenticated as: ${userName}`);
      showNotification('Welcome', `Welcome to Anicca, ${userName}!`);
    }
    
    // 認証成功時のグローバルコールバックを設定
    (global as any).onUserAuthenticated = async (user: any) => {
      console.log('🎉 User authenticated via browser:', user.email);
      
      // authServiceを更新
      if (authService) {
        await authService.initialize();
        await authService.refreshPlan().catch(() => null);
      }
      
      // sessionManagerにユーザーIDを設定
      if (sessionManager && user.id) {
        sessionManager?.setCurrentUserId(user.id);
        console.log(`✅ Updated session manager with user ID: ${user.id}`);
      }
      
      // 通知とトレイメニュー更新
      showNotification('Login successful', `Signed in as ${user.email}`);
      updateTrayMenu();

      // 認証完了後に定期タスク登録を必ず一度だけ起動（冪等）
      if (!cronInitialized) {
        console.log('👤 Auth completed, starting scheduled tasks (post-login)...');
        syncTodayTasksFromMarkdown();
        initializeScheduledTasks();
        cronInitialized = true;
        console.log('✅ Scheduled tasks started (post-login)');
        if (!tasksWatcherRegistered) {
          fs.watchFile(tasksMarkdownPath, { interval: 1000 }, () => {
            try {
              syncTodayTasksFromMarkdown();
              rebuildTodayIndex();
            } catch (err) {
              console.warn('⚠️ tasks.md watch update failed:', err);
            }
          });
          tasksWatcherRegistered = true;
        }
      }
    };
    
    // マイク権限をリクエスト
    const { systemPreferences } = require('electron');
    
    if (process.platform === 'darwin') {
      const microphoneAccess = systemPreferences.getMediaAccessStatus('microphone');
      console.log('🎤 Microphone access status:', microphoneAccess);
      
      if (microphoneAccess === 'not-determined' || microphoneAccess === 'denied') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        console.log('🎤 Microphone permission:', granted ? '✅ Granted' : '❌ Denied');
        
        if (!granted) {
          throw new Error('Microphone permission is required for voice commands');
        }
      }
    }
    
    // 全てのAPI呼び出しはプロキシ経由で行われる
    console.log('🌐 Using proxy for all API calls');
    
    
    // SDK版の初期化
    try {
      // 先にユーザーIDを取得
      const userId = authService.getCurrentUserId();
      
      // userIdを渡してエージェント作成
      mainAgent = await createAniccaAgent(userId);
      sessionManager = new AniccaSessionManager(mainAgent, getBridgeToken());
      await sessionManager.initialize();
      attachSessionEventSink();
      
      // 認証済みユーザーIDを設定（SessionManager初期化後）
      if (userId) {
        sessionManager.setCurrentUserId(userId);
        console.log(`✅ User ID set in session manager: ${userId}`);
      }
      
      updateTrayMenu();
    } catch (error) {
      console.error('❌ Failed to initialize session manager:', error);
      throw error;
    }
    
    if (!sessionManager) {
      throw new Error('SessionManager not initialized');
    }

    await sessionManager.startBridge(PORTS.OAUTH_CALLBACK);
    console.log('✅ Bridge server started');

    if (shouldLaunchOnboarding && sessionManager && !onboardingQueued) {
      onboardingQueued = true;
      const manager = sessionManager;

      const runOnboarding = async (attempt = 1): Promise<void> => {
        try {
          const prompt = resolveOnboardingPrompt();
          await manager.waitForReady(8000);
          manager.setOnboardingState('running');
          await manager.forceConversationMode('onboarding');
          await manager.sendMessage(prompt);
          console.log('🚀 Onboarding prompt dispatched');
        } catch (error) {
          console.error(`❌ Failed to dispatch onboarding prompt (attempt ${attempt}):`, error);
          manager.setOnboardingState('idle');
          if (attempt < 3) {
            setTimeout(() => {
              void runOnboarding(attempt + 1);
            }, 1000);
          }
        }
      };

      void runOnboarding();
    }
    
    // 少し待ってからBrowserWindowを作成
    setTimeout(() => {
      createHiddenWindow();
      console.log('✅ Hidden browser window created');
    }, 1000);
    
    // 自動更新チェック（本番環境のみ）
    if (process.env.NODE_ENV === 'production') {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify();
      
      // 定期的な自動更新チェック（1時間ごと）
      updateCheckIntervalId = setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, UPDATE_CONFIG.CHECK_INTERVAL);
      
      console.log('⏰ Auto-update checks scheduled (production only)');
    }
    
    // コンポーネントの初期化順序を最適化
    console.log('🔄 Initializing voice components...');
    
    // システムトレイの作成
    await createSystemTray();
    console.log('✅ System tray created');
    
    // PTT: Option+Z を登録（失敗したら今は諦める）
    const triggerConversation = () => {
      if (!sessionManager) return;
      sessionManager.controlMode('conversation', 'hotkey').catch((error) => {
        console.warn('Failed to trigger conversation mode via hotkey:', error);
      });
    };

    const hotkeyRegistered = globalShortcut.register('Option+Z', triggerConversation);
    console.log(
      hotkeyRegistered
        ? '🎚️ PTT shortcut (Option+Z) registered'
        : '⚠️ Failed to register PTT shortcut (Option+Z)'
    );
    
  // スリープ防止の設定
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log('✅ Power save blocker started');

  // 復帰時の即時リフレッシュと接続保証（段階的＆オフライン待ち）
  let resumeRecoveryInFlight = false;
  powerMonitor.on('resume', async () => {
    if (resumeRecoveryInFlight) return;
    resumeRecoveryInFlight = true;
    console.log('⏰ System resume detected - staged recovery start');
    try {
      const { waitForOnline } = await import('./services/network');
      const online = await waitForOnline({ timeoutTotal: 15000, interval: 1000 });
      if (!online) {
        console.log('📶 Still offline after resume window; defer recovery to later triggers');
        return;
      }
      if (authService) {
        try { await authService.refreshSession(); } catch (e) {
          console.warn('Auth refresh on resume failed:', (e as any)?.message || e);
        }
        try {
          await authService.getProxyJwt();
          updateTrayMenu();
        } catch (err: any) {
          if (err?.code === 'PAYMENT_REQUIRED') {
            notifyQuotaExceeded(err?.message, err?.entitlement);
          }
        }
      }
      if (sessionManager) {
        sessionManager.getClientSecret(true).catch(() => {});
      }
      hiddenWindow?.webContents.send('voice:restart');

      // 復帰時にも認証が有効なら、定期タスク登録を確実に起動（冪等）
      try {
        if (authService?.isAuthenticated() && !cronInitialized) {
          console.log('⏰ System resume: ensuring scheduled tasks started...');
          initializeScheduledTasks();
          cronInitialized = true;
          console.log('✅ Scheduled tasks started (on resume)');
        }
      } catch { /* noop */ }
    } finally {
      resumeRecoveryInFlight = false;
    }
  });
    // 起動直後に既にログイン済みなら、定期タスクを一度だけ起動（冪等）
    if (authService.isAuthenticated() && !cronInitialized) {
      console.log('👤 User is authenticated, starting scheduled tasks...');
      initializeScheduledTasks();
      cronInitialized = true;
      console.log('✅ Scheduled tasks started');
    }

    console.log('🚀 Anicca Voice Assistant started successfully!');
    console.log('🎤 Say "Anicca" to begin conversation');
  } catch (error) {
    console.error('💥 Failed to initialize application:', error);
    throw error;
  }
}


// 非表示のBrowserWindowを作成
function createHiddenWindow() {
  hiddenWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload-webrtc.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  hiddenWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  if (!app.isPackaged) {
    hiddenWindow.webContents.openDevTools({ mode: 'detach' });
  }

  hiddenWindow.webContents.on('did-finish-load', () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      hiddenWindow?.webContents.send('anisca:timezone', tz);
    } catch (error) {
      console.warn('Failed to send timezone to renderer:', error);
    }
  });

  hiddenWindow.on('closed', () => {
    hiddenWindow = null;
  });
}

// システムトレイの作成
function createSystemTray() {
  // 新しい配置: assets/desktop/tray-icon.png（@2xあり）
  // asar内のパス(__dirname)を優先し、次にresourcesPathをフォールバック
  const iconCandidates = [
    path.join(__dirname, '../assets/desktop/tray-icon.png'),
    path.join(process.resourcesPath, 'assets', 'desktop', 'tray-icon.png'),
    path.join(process.resourcesPath, 'desktop', 'tray-icon.png')
  ];

  let trayIconPath = iconCandidates.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  if (!trayIconPath) {
    console.warn('⚠️ Tray icon file not found in candidates. Using empty image.');
  }

  let trayIcon;
  try {
    trayIcon = trayIconPath ? nativeImage.createFromPath(trayIconPath) : nativeImage.createEmpty();
    if (trayIcon.isEmpty()) {
      console.warn('⚠️ Loaded tray image is empty. Falling back to empty image.');
      trayIcon = nativeImage.createEmpty();
    }
  } catch (error) {
    console.warn('⚠️ Tray icon load failed, using empty image:', error);
    trayIcon = nativeImage.createEmpty();
  }

  // macOSではテンプレート画像として扱うことでライト/ダークに自動追従させる
  if (process.platform === 'darwin') {
    try { trayIcon.setTemplateImage(true); } catch {}
  }

  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip('Anicca - Say "Anicca" to begin');
}

// トレイメニューを更新
function updateTrayMenu() {
  const userName = authService?.isAuthenticated() ? authService.getCurrentUserName() : 'Guest';
  const isAuthenticated = authService?.isAuthenticated() || false;
  const planInfo = authService?.getPlanInfo();
  const planKey = planInfo?.plan || 'free';
  const planLabel = planKey === 'pro' ? 'Pro' : (planKey === 'grace' ? 'Grace' : 'Free');
  const usageLabel = planInfo?.daily_usage_limit
    ? `Usage ${planInfo?.daily_usage_remaining ?? 0}/${planInfo.daily_usage_limit}`
    : 'Unlimited';

  const billingItems: MenuItemConstructorOptions[] = [];
  if (planKey !== 'pro') {
    billingItems.push({
      label: 'Upgrade to Anicca Pro ($5/mo)',
      enabled: isAuthenticated,
      click: async () => { await openBillingCheckout(); }
    });
  }
  if (isAuthenticated) {
    billingItems.push({
      label: 'Manage Subscription',
      enabled: planKey !== 'free',
      click: async () => { await openBillingPortal(); }
    });
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `👤 ${userName}`,
      enabled: false
    },
    {
      label: `⭐ Plan: ${planLabel}` + (planInfo?.daily_usage_limit ? ` (${usageLabel})` : ''),
      enabled: false
    },
    { type: 'separator' },
    ...(!isAuthenticated ? [{
      label: 'Login with Google',
      click: async () => {
        const { shell } = require('electron');
        try {
          if (authService) {
            const oauthUrl = await authService.getGoogleOAuthUrl();
            shell.openExternal(oauthUrl);
          } else {
            console.error('Auth service not initialized');
            showNotification('Error', 'Authentication service is not ready.');
          }
        } catch (error) {
          console.error('Failed to get Google OAuth URL:', error);
          showNotification('Error', 'We could not start the login flow. Please try again.');
        }
      }
    }] : []),
    ...(isAuthenticated ? [{
      label: 'Logout',
      click: async () => {
        if (authService && authService.isAuthenticated()) {
          const userName = authService.getCurrentUserName();
          await authService.signOut();
          showNotification('Signed out', `Goodbye, ${userName}`);

          if (planRefreshIntervalId) {
            clearInterval(planRefreshIntervalId);
            planRefreshIntervalId = null;
          }
          updateTrayMenu();

          if (sessionManager) {
            sessionManager.setCurrentUserId('desktop-user');
          }
        }
      }
    }] : []),
    { type: 'separator' },
    ...billingItems,
    { type: 'separator' },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  if (tray) {
    tray.setContextMenu(contextMenu);
  }
}

// 通知表示
function showNotification(title: string, body: string) {
  const { Notification } = require('electron');
  new Notification({ title, body }).show();
}

function startPlanRefreshInterval() {
  if (planRefreshIntervalId) {
    clearInterval(planRefreshIntervalId);
    planRefreshIntervalId = null;
  }
  if (!authService) return;
  planRefreshIntervalId = setInterval(async () => {
    if (!authService || !authService.isAuthenticated()) return;
    try {
      await authService.refreshPlan();
      updateTrayMenu();
    } catch (err: any) {
      console.warn('Plan refresh interval failed:', err?.message || err);
    }
  }, 10 * 60 * 1000);
}

function startPlanRefreshBurst(durationMs = 90 * 1000, intervalMs = 2 * 1000) {
  if (!authService || !authService.isAuthenticated()) return;
  if (planRefreshBurstIntervalId) {
    clearInterval(planRefreshBurstIntervalId);
    planRefreshBurstIntervalId = null;
  }
  planRefreshBurstDeadline = Date.now() + durationMs;
  const tick = async () => {
    if (!authService || !authService.isAuthenticated()) return;
    if (Date.now() >= planRefreshBurstDeadline) {
      if (planRefreshBurstIntervalId) {
        clearInterval(planRefreshBurstIntervalId);
        planRefreshBurstIntervalId = null;
      }
      return;
    }
    try {
      await authService.refreshPlan();
      updateTrayMenu();
    } catch (err: any) {
      console.warn('Plan refresh burst failed:', err?.message || err);
    }
  };
  tick();
  planRefreshBurstIntervalId = setInterval(tick, intervalMs);
  setTimeout(() => {
    if (!authService || !authService.isAuthenticated()) return;
    authService.refreshPlan().catch(() => null).then(() => updateTrayMenu());
  }, intervalMs);
}

let lastQuotaNotifiedAt = 0;

function notifyQuotaExceeded(message?: string, entitlement?: any) {
  const now = Date.now();
  if (now - lastQuotaNotifiedAt < 60000) return;
  lastQuotaNotifiedAt = now;
  const body = message || 'You have reached the free plan limit. Please consider upgrading to Anicca Pro.';
  showNotification('Usage limit reached', body);
  if (authService) {
    authService.refreshPlan().catch(() => null).finally(() => updateTrayMenu());
  } else {
    updateTrayMenu();
  }
}

async function requestBillingUrl(kind: 'checkout' | 'portal') {
  if (!authService) throw new Error('Auth service not initialized');
  const endpoint = kind === 'checkout'
    ? API_ENDPOINTS.BILLING.CHECKOUT_SESSION
    : API_ENDPOINTS.BILLING.PORTAL_SESSION;
  let jwt: string | null = null;
  try {
    jwt = await authService.getProxyJwt();
  } catch (err: any) {
    if (err?.code === 'PAYMENT_REQUIRED') {
      notifyQuotaExceeded(err?.message, err?.entitlement);
      return null;
    }
    throw err;
  }
  if (!jwt) {
    throw new Error('Proxy JWT unavailable');
  }
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    }
  });
  if (resp.status === 402) {
    const payload = await resp.json().catch(() => ({}));
    notifyQuotaExceeded(payload?.message, payload?.entitlement);
    return null;
  }
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Billing endpoint ${kind} failed: ${resp.status} ${detail}`);
  }
  const json = await resp.json();
  return json?.url || null;
}

async function openBillingCheckout() {
  try {
    const url = await requestBillingUrl('checkout');
    if (url) {
      await shell.openExternal(url);
      startPlanRefreshBurst();
    }
  } catch (err: any) {
    console.error('Failed to open checkout session:', err);
    showNotification('Error', 'We could not open the checkout page. Please try again shortly.');
  }
}

async function openBillingPortal() {
  try {
    const url = await requestBillingUrl('portal');
    if (url) {
      await shell.openExternal(url);
      startPlanRefreshBurst();
    }
  } catch (err: any) {
    console.error('Failed to open billing portal:', err);
    showNotification('Error', 'We could not open the billing portal. Please try again shortly.');
  }
}

// アプリケーションイベント
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  // ウィンドウがなくても終了しない
});

app.on('before-quit', async (event) => {
  console.log('👋 Anicca shutting down...');
  
  // 非同期処理のためデフォルトの終了を防ぐ
  event.preventDefault();
  
  try {
    // SDKのクリーンアップ
    if (sessionManager) {
      await sessionManager.disconnect();
      console.log('✅ SessionManager disconnected');
    }
    
    if (sessionManager) {
      await sessionManager.stop();
    }
    
    if (hiddenWindow) {
      hiddenWindow.close();
    }
    
    if (tray) {
      tray.destroy();
    }

    if (planRefreshIntervalId) {
      clearInterval(planRefreshIntervalId);
      planRefreshIntervalId = null;
    }
  } catch (error) {
    console.error('Error during shutdown:', error);
  } finally {
    // 終了処理が完了したらアプリを終了
    app.exit(0);
  }
});

// プロセス終了シグナルのハンドラー
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  app.quit();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  app.quit();
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});

function parseScheduledJson(content: string): { data: any; repaired: boolean; repairedContent: string } {
  try {
    return { data: JSON.parse(content), repaired: false, repairedContent: content };
  } catch (err) {
    const repairedContent = jsonrepair(content);
    return { data: JSON.parse(repairedContent), repaired: true, repairedContent };
  }
}

// 定期タスク管理関数
function initializeScheduledTasks() {
  if (fs.existsSync(scheduledTasksPath)) {
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    const { data, repaired, repairedContent } = parseScheduledJson(content);
    if (repaired) {
      fs.writeFileSync(scheduledTasksPath, repairedContent, 'utf8');
      console.log('🛠️ scheduled_tasks.json を自動修復しました');
    }
    const tasks = data.tasks || [];

    tasks.forEach((task: any) => {
      registerCronJob(task);
    });

    console.log(`📅 ${tasks.length}個の定期タスクを登録しました`);
  }

  // ファイル監視
  fs.watchFile(scheduledTasksPath, { interval: 1000 }, () => {
    console.log('📝 scheduled_tasks.jsonが変更されました');
    reloadScheduledTasks();
    rebuildTodayIndex();
  });
}

// --------------- Today Index（読み上げビュー） ---------------
function buildTodayIndex(tasks: Array<{ id: string; schedule: string; description?: string }>, now = new Date()): Array<[string, string]> {
  // 前提：毎日（MM HH * * *）と今日だけ（idに _today）だけを対象にし、「今日の全予定」を出力する（現在時刻での除外はしない）
  const pad = (n: number) => n.toString().padStart(2, '0');
  const items: Array<[string, string]> = [];

  const dailyRegex = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/; // MM HH * * *

  for (const t of tasks) {
    if (!t || !t.schedule || typeof t.schedule !== 'string') continue;
    const m = t.schedule.match(dailyRegex);
    if (!m) continue; // 複雑なcronは対象外（発火はnode-cron任せ）
    const mm = parseInt(m[1], 10);
    const hh = parseInt(m[2], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;

    const timeStr = `${pad(hh)}:${pad(mm)}`;
    const labelSrc = (t.description || t.id || '').trim();
    // 軽いノイズ除去（任意）：末尾の「に」「毎日」「今日だけ」を緩く削ぐ
    const label = labelSrc
      .replace(/^\s*毎日\s*/g, '')
      .replace(/^\s*今日だけ\s*/g, '')
      .replace(/\s*に\s*$/g, '')
      || t.id;

    // _today の有無は index には関係ない（発火・削除は cron 側の責務）
    items.push([timeStr, label]);
  }

  // 時刻昇順で並べる
  items.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return items;
}

function writeTodayIndex(items: Array<[string, string]>) {
  try {
    const dir = path.dirname(todaySchedulePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(todaySchedulePath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`✅ today_schedule.json を更新: ${items.length}件`);
  } catch (e) {
    console.warn('⚠️ today_schedule.json の書き込みに失敗:', e);
  }
}

function rebuildTodayIndex() {
  try {
    if (!fs.existsSync(scheduledTasksPath)) return;
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    if (!content.trim()) return;
    const { data, repaired, repairedContent } = parseScheduledJson(content);
    if (repaired) {
      fs.writeFileSync(scheduledTasksPath, repairedContent, 'utf8');
      console.log('🛠️ scheduled_tasks.json を自動修復しました');
    }
    const tasks = Array.isArray((data as any)?.tasks) ? (data as any).tasks : [];
    const items = buildTodayIndex(tasks, new Date());
    writeTodayIndex(items);
  } catch (e) {
    console.warn('⚠️ today index 再生成に失敗:', e);
  }
}

function registerCronJob(task: any) {
  const job = cron.schedule(task.schedule, async () => {
    console.log(`🔔 定期タスク実行: ${task.description}`);
    await executeScheduledTask(task);
    
    // 今日のみタスクは実行後に削除
    if (task.id.includes('_today')) {
      console.log(`🗑️ 今日のみタスクを削除: ${task.id}`);
      removeTaskFromJson(task.id);
      cronJobs.delete(task.id);
      job.stop();
    }
  }, {
    timezone: resolveTZ(task),
    scheduled: true
  });

  cronJobs.set(task.id, job);

  // ------- 事前プレフライト（T-1分；簡易MM HH対応） -------
  try {
    const m = String(task.schedule || '').match(/^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/);
    if (m) {
      const mm = parseInt(m[1], 10);
      const hh = parseInt(m[2], 10);
      const preMinute = (mm >= 1 ? mm - 1 : 59);
      const preHour = (mm >= 1 ? hh : (hh + 23) % 24);
      const preSpec = `${preMinute} ${preHour} * * *`;
      const preflight = cron.schedule(preSpec, async () => {
        try {
          if (sessionManager) {
            await sessionManager.getClientSecret(true);
          }
          hiddenWindow?.webContents.send('voice:restart');
          console.log('[CRON_PREFLIGHT]', task.id);
        } catch (e) {
          console.warn('[CRON_PREFLIGHT_FAIL]', task.id, e);
        }
      }, {
        timezone: resolveTZ(task),
        scheduled: true
      });
      cronJobs.set(`${task.id}__preflight`, preflight);
    }
  } catch (e) {
    console.warn('⚠️ preflight setup failed:', e);
  }
}

// ---- タイムゾーン解決（タスク→ユーザー→OS→UTC）----
function resolveTZ(task: any): string {
  try {
    if (task && typeof task.timezone === 'string' && task.timezone.length >= 3) {
      return task.timezone;
    }
    const userTz = (sessionManager as any)?.getUserTimezone?.();
    if (userTz && typeof userTz === 'string' && userTz.length >= 3) {
      return userTz;
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function removeTaskFromJson(taskId: string) {
  if (fs.existsSync(scheduledTasksPath)) {
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    const { data, repaired, repairedContent } = parseScheduledJson(content);
    if (repaired) {
      fs.writeFileSync(scheduledTasksPath, repairedContent, 'utf8');
      console.log('🛠️ scheduled_tasks.json を自動修復しました');
    }
    data.tasks = data.tasks.filter((t: any) => t.id !== taskId);
    fs.writeFileSync(scheduledTasksPath, JSON.stringify(data, null, 2));
    console.log(`✅ タスク削除完了: ${taskId}`);
  }
}

async function executeScheduledTask(task: any) {
  if (!sessionManager) {
    console.warn('executeScheduledTask skipped: session manager not ready');
    return;
  }

  const id = String(task.id || '');
  let tpl = 'default.txt';
  if (id.startsWith('jihi_') || id.startsWith('jihi__')) tpl = 'jihi_meditation.txt';
  else if (id.startsWith('wake_up_') || id.startsWith('wake_up__')) tpl = 'wake_up.txt';
  else if (id.startsWith('sleep_') || id.startsWith('sleep__')) tpl = 'sleep.txt';
  else if (id.startsWith('standup_') || id.startsWith('standup__')) tpl = 'standup.txt';
  else if (id.startsWith('zange_') || id.startsWith('zange__')) tpl = 'zange.txt';
  else if (id.startsWith('five_') || id.startsWith('five__')) tpl = 'five.txt';
  else if (id.startsWith('mtg_pre_')) tpl = 'mtg_pre.txt';
  else if (id.startsWith('mtg_start_')) tpl = 'mtg_start.txt';

  const appRoot = path.resolve(__dirname, '..');
  const candidates = [
    path.join(appRoot, 'prompts'),
    path.join(process.cwd(), 'prompts'),
  ];
  const promptsDir = candidates.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || path.join(process.cwd(), 'prompts');
  const commonPath = path.join(promptsDir, 'common.txt');
  const tplPath = path.join(promptsDir, tpl);
  let commonText = '';
  let templateText = '';
  try { commonText = fs.readFileSync(commonPath, 'utf8'); } catch {}
  try { templateText = fs.readFileSync(tplPath, 'utf8'); } catch { templateText = '今、{{taskDescription}}の時間になった。'; }
  let resolvedTemplate = templateText;
  if (tpl === 'sleep.txt') {
    try {
      resolvedTemplate = buildRoutinePrompt('sleep', templateText, { reset: true });
    } catch (routineError) {
      console.warn('[sleep_routine] fallback to raw template:', routineError);
      resolvedTemplate = templateText;
    }
  } else if (tpl === 'wake_up.txt') {
    try {
      resolvedTemplate = buildRoutinePrompt('wake', templateText, { reset: true });
    } catch (routineError) {
      console.warn('[wake_routine] fallback to raw template:', routineError);
      resolvedTemplate = templateText;
    }
  }

  const commandBody = [commonText, resolvedTemplate]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\$\{task\.description\}/g, String(task.description ?? ''));

  try {
    await sessionManager.handleScheduledTask(commandBody, task.taskType, task.id);
    console.log('✅ Scheduled task dispatched via session manager');
  } catch (error) {
    console.error('❌ Scheduled task dispatch failed:', error);
  }
}

function reloadScheduledTasks() {
  // 既存のジョブを停止
  cronJobs.forEach((job) => {
    job.stop();
  });
  cronJobs.clear();

  // 新しいタスクを読み込み
  if (fs.existsSync(scheduledTasksPath)) {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const content = fs.readFileSync(scheduledTasksPath, 'utf8');
        
        if (!content.trim()) {
          console.log('⚠️ scheduled_tasks.json is empty');
          return;
        }
        
        const { data, repaired, repairedContent } = parseScheduledJson(content);
        if (repaired) {
          fs.writeFileSync(scheduledTasksPath, repairedContent, 'utf8');
          console.log('🛠️ scheduled_tasks.json を自動修復しました');
        }
        const originalTasks = Array.isArray(data.tasks) ? data.tasks : [];
        const unique = new Map<string, any>();
        for (const task of originalTasks) {
          if (!task?.id || !task?.schedule) continue;
          const key = `${task.id}__${task.schedule}`;
          if (!unique.has(key)) unique.set(key, task);
        }
        const tasks = Array.from(unique.values());
        if (tasks.length !== originalTasks.length) {
          console.log('🛠️ 重複していたスケジュールを自動調整しました');
          data.tasks = tasks;
          fs.writeFileSync(scheduledTasksPath, JSON.stringify(data, null, 2), 'utf8');
        }

        tasks.forEach((task: any) => {
          registerCronJob(task);
        });

        console.log(`📅 定期タスクを再読み込みしました: ${tasks.length}個のタスク`);
        break; // 成功したらループを抜ける
        
      } catch (error) {
        retryCount++;
        console.error(`❌ Failed to reload tasks (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          // 100ms待機して再試行
          const waitTime = retryCount * 100;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitTime);
        }
      }
    }
  }
}
