import { app, Tray, Menu, nativeImage, BrowserWindow, powerSaveBlocker, dialog, powerMonitor, globalShortcut, shell, MenuItemConstructorOptions } from 'electron';
import { jsonrepair } from 'jsonrepair';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { setTracingDisabled } from '@openai/agents';
import { getAuthService, DesktopAuthService } from './services/desktopAuthService';
import { API_ENDPOINTS, PORTS, UPDATE_CONFIG, AUDIO_SAMPLE_RATE, WS_RECONNECT_DELAY_MS, CHECK_STATUS_INTERVAL_MS } from './config';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as os from 'os';
import { WebSocket } from 'ws';
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
  await ensureBaselineFiles();
  syncTodayTasksFromMarkdown();
  const shouldLaunchOnboarding = shouldRunOnboarding();

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
      showNotification('ログインが必要です', 'システムトレイから「Login with Google」をクリックしてください');
    } else {
      const userName = authService.getCurrentUserName();
      console.log(`✅ Authenticated as: ${userName}`);
      showNotification('ようこそ', `${userName}さん、Aniccaへようこそ！`);
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
      showNotification('ログイン成功', `${user.email}でログインしました`);
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
    
    // 認証完了後にRealtime接続を再保証
    (async () => {
      try {
        await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/sdk/ensure`, { method: 'POST' });
      } catch (err) {
        console.warn('Failed to ensure SDK connection after login:', err);
      }
    })();
    
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
      sessionManager = new AniccaSessionManager(mainAgent);
      await sessionManager.initialize();
      
      // 認証済みユーザーIDを設定（SessionManager初期化後）
      if (userId) {
        sessionManager.setCurrentUserId(userId);
        console.log(`✅ User ID set in session manager: ${userId}`);
      }
      
      const sessionUrl = userId 
        ? `${API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION}?userId=${userId}`
        : API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION;
      let proxyJwt: string | null = null;
      try {
        proxyJwt = await authService.getProxyJwt();
        updateTrayMenu();
      } catch (err: any) {
        if (err?.code === 'PAYMENT_REQUIRED') {
          notifyQuotaExceeded(err?.message, err?.entitlement);
        } else {
          throw err;
        }
      }
      if (!proxyJwt) {
        console.warn('⚠️ Proxy JWT not available, skipping realtime session bootstrap');
      } else {
        const response = await fetch(sessionUrl, {
          headers: { Authorization: `Bearer ${proxyJwt}` }
        });

        if (response.ok) {
          const data = await response.json();
          const apiKey = data.client_secret?.value;
          if (apiKey) {
            await sessionManager.connect(apiKey);
            console.log('✅ AniccaSessionManager connected with SDK');
          }
        } else if (response.status === 402) {
          const payload = await response.json().catch(() => ({}));
          notifyQuotaExceeded(payload?.message, payload?.entitlement);
        } else {
          console.warn('⚠️ Failed to get API key from proxy, continuing without SDK');
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize SDK:', error);
      // SDKエラーでも続行（voiceServerは動作可能）
    }
    
    // Bridgeサーバー起動（新規追加）
    if (sessionManager) {
      await sessionManager.startBridge(PORTS.OAUTH_CALLBACK);
      console.log('✅ Bridge server started');
    } else {
      throw new Error('SessionManager not initialized');
    }

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
    
    // PTT: 単キー(F8=MediaPlayPause)で「開始のみ」（終了は自動終了に一本化）
    try {
      const okMedia = globalShortcut.register('MediaPlayPause', () => {
        try {
          fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/mode/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'conversation', reason: 'hotkey' })
          }).catch(() => {});
        } catch { /* noop */ }
      });
      console.log(okMedia ? '🎚️ PTT shortcut (MediaPlayPause/F8) registered' : '⚠️ Failed to register MediaPlayPause');
    } catch (e) {
      console.warn('PTT shortcut registration error:', (e as any)?.message || e);
    }
    
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
      // Realtime接続の即保証（少し遅延）
      setTimeout(() => {
        fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/sdk/ensure`, { method: 'POST' }).catch(() => {});
      }, 300);

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
    console.log('🎤 Say "アニカ" to begin conversation');
  } catch (error) {
    console.error('💥 Failed to initialize application:', error);
    throw error;
  }
}


// 非表示のBrowserWindowを作成
function createHiddenWindow() {
  hiddenWindow = new BrowserWindow({
    show: false,  // 非表示
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });
  
  // voice-demoのクライアントページを開く
  hiddenWindow.loadURL(`http://localhost:${PORTS.OAUTH_CALLBACK}`);
  
  // デバッグ用 - 開発環境でのみ開く
  if (!app.isPackaged) {
    hiddenWindow.webContents.openDevTools({ mode: 'detach' });
  }
  
  // ページロード完了後、自動的に音声認識を開始
  hiddenWindow.webContents.on('did-finish-load', () => {
    // ページが完全に読み込まれるまで少し待つ
    const isDev = process.env.NODE_ENV === 'development';
    setTimeout(() => {
      hiddenWindow?.webContents.executeJavaScript(`
        console.log('🎤 Starting SDK-based voice assistant...');

        let ws = null;
        let mediaRecorder = null;
        let audioContext = null;
        let audioQueue = [];
        let isPlaying = false;
        let currentSource = null;
        let isSystemPlaying = false; // システム音声再生中フラグ（エコー防止）
        let isAgentSpeaking = false; // 視覚用フラグ（送信ゲートには使用しない）
        let micPaused = false;       // 入力一時停止（ElevenLabs等の“システム再生時のみ”使用）
        let sdkReady = false; // 監視用（送信ゲートには使用しない）
        // SDKステータスの前回値（差分時のみログ出力するためのキー）
        let lastSdkStatusKey = '';
        // 音声入力はWSバイナリ直送に一本化（送信キュー/HTTPは廃止）
        let micPostStopMuteUntil = 0; // 出力停止直後の送信クールダウン(ms)

        // --- 追加: 初回プレフライト接続 & 録音起動の待機ヘルパー ---
        async function ensureSDKConnection() {
          try {
            await fetch('/sdk/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const ok = await checkSDKStatus();
            if (!ok) console.warn('SDK ensure completed but not ready yet');
            return ok;
          } catch (e) {
            console.warn('SDK ensure failed:', e);
            return false;
          }
        }

        function startCaptureWhenReady(retryMs = 1000, maxAttempts = 15) {
          (async () => {
            try {
              const ok = await checkSDKStatus();
              if (ok) {
                startVoiceCapture();
                return;
              }
            } catch {}
            if (maxAttempts > 0) {
              setTimeout(() => startCaptureWhenReady(retryMs, maxAttempts - 1), retryMs);
            } else {
              console.warn('SDK not ready after retries; skipping auto start');
            }
          })();
        }

        // 送信キュー/HTTPは使用しない

        // SDK状態確認
        async function checkSDKStatus() {
          try {
            const response = await fetch('/sdk/status');
            const status = await response.json();
            // 状態変化時のみログを出す（DevToolsノイズ・負荷を低減）
            const key = [
              status?.useSDK ? 1 : 0,
              status?.connected ? 1 : 0,
              status?.ready ? 1 : 0,
              status?.transport || '',
              // TTL/ageは秒単位で揺れるため丸めて比較（過剰出力を防止）
              typeof status?.tokenTTL === 'number' ? Math.floor(status.tokenTTL / 30) : '',
              typeof status?.sessionAge === 'number' ? Math.floor(status.sessionAge / 60) : ''
            ].join('|');
            if (key !== lastSdkStatusKey) {
              console.log('SDK Status:', status);
              lastSdkStatusKey = key;
            }
            const ok = status.useSDK && status.connected && status.transport === 'websocket';
            sdkReady = !!ok;
            return ok;
          } catch (error) {
            console.error('Failed to check SDK status:', error);
            sdkReady = false;
            return false;
          }
        }

        // WebSocket接続（音声出力受信用）
        function connectWebSocket() {
          ws = new WebSocket('ws://localhost:${PORTS.OAUTH_CALLBACK}');
          ws.binaryType = 'arraybuffer';

          ws.onmessage = async (event) => {
            try {
              const message = JSON.parse(event.data);

              // PCM16音声出力データを受信
              if (message.type === 'audio_output' && message.format === 'pcm16') {
                // エージェント発話開始の合図（視覚用のみ）
                isAgentSpeaking = true;
                console.log('🔊 Received PCM16 audio from SDK');

                // Base64デコードしてPCM16データを取得
                const audioData = atob(message.data);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < audioData.length; i++) {
                  view[i] = audioData.charCodeAt(i);
                }

                // PCM16をWebAudio用に変換して再生
                audioQueue.push(arrayBuffer);
                if (!isPlaying) {
                  playNextPCM16Audio();
                }
              }

              // エージェント音声開始/終了（半二重制御用）
              if (message.type === 'audio_start') {
                isAgentSpeaking = true;  // 視覚用
              }
              if (message.type === 'audio_stopped') {
                isAgentSpeaking = false; // 視覚用
                micPaused = false;       // 半二重解除
                // 出力直後の誤割り込み抑止（短縮）
                micPostStopMuteUntil = Date.now() + 120;
              }

              // 応答完了（公式イベントに一本化）
              if (message.type === 'agent_end') {
                isAgentSpeaking = false;
                micPaused = false; // 半二重解除
                console.log('🔁 agent_end: gates cleared');
                // 出力直後の誤割り込み抑止（短縮）
                micPostStopMuteUntil = Date.now() + 120;
              }

              // 音声中断処理
              if (message.type === 'audio_interrupted') {
                console.log('🛑 Audio interrupted - clearing queue');
                audioQueue = [];
                isPlaying = false;
                // 即時にマイクを解放し、ユーザー音声を継続送出（barge-in 確実化）
                micPaused = false;
                isAgentSpeaking = false;
                console.log('[BARGE_IN_DETECTED]');
                // 再生中の音声を停止（存在すれば）
                if (currentSource) {
                  currentSource.stop();
                  currentSource = null;
                }
              }

              // モード確定通知（会話モードに上がった事実に同期してビープ）
              if (message.type === 'mode_set' && message.mode === 'conversation' && message.reason === 'hotkey') {
                // F8（hotkey）かつ SDK接続OKのときのみ効果音
                const ok = await checkSDKStatus().catch(() => false);
                if (!ok) {
                  console.warn('mode_set (hotkey) but SDK not ready; skip beep');
                } else {
                  try {
                    const Ctor = (window['AudioContext'] || window['webkitAudioContext']);
                    if (!Ctor) throw new Error('No AudioContext available');
                    const ctx = audioContext || new Ctor();
                    if (!audioContext) { audioContext = ctx; }
                    try { if (typeof ctx.resume === 'function') { ctx.resume(); } } catch (_) {}
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.value = 880; // A5
                    g.gain.setValueAtTime(0.0, ctx.currentTime);
                    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
                    o.connect(g).connect(ctx.destination);
                    o.start();
                    o.stop(ctx.currentTime + 0.14);
                  } catch (e) {
                    console.warn('mode_set beep failed:', e);
                  }
                }
              } else if (message.type === 'mode_set' && message.mode === 'silent') {
                const ok = await checkSDKStatus().catch(() => false);
                if (!ok) {
                  console.warn('mode_set (silent) but SDK not ready; skip beep');
                } else {
                  try {
                    const Ctor = (window['AudioContext'] || window['webkitAudioContext']);
                    if (!Ctor) throw new Error('No AudioContext available');
                    const ctx = audioContext || new Ctor();
                    if (!audioContext) { audioContext = ctx; }
                    try { if (typeof ctx.resume === 'function') { ctx.resume(); } } catch (_) {}
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.value = 440; // A4
                    g.gain.setValueAtTime(0.0, ctx.currentTime);
                    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
                    o.connect(g).connect(ctx.destination);
                    o.start();
                    o.stop(ctx.currentTime + 0.22);
                  } catch (e) {
                    console.warn('mode_set silent beep failed:', e);
                  }
                }
              }

              // ツール実行通知
              if (message.type === 'tool_execution_start') {
                console.log('🔧 Tool executing:', message.toolName);
              }

              if (message.type === 'tool_execution_complete') {
                console.log('✅ Tool completed:', message.toolName);
              }

              // ElevenLabs音声データの処理
              if (message.type === 'elevenlabs_audio' && message.audioBase64) {
                console.log('🎵 ElevenLabs audio received, length:', message.audioBase64.length);
                
                try {
                  // Base64をBlobに変換
                  const binaryString = atob(message.audioBase64);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  
                  // MP3形式として正しく設定
                  const blob = new Blob([bytes], { type: 'audio/mpeg' });
                  const audioUrl = URL.createObjectURL(blob);
                  
                  // Audio要素を作成して設定
                  const audio = new Audio(audioUrl);
                  audio.volume = 1.0;
                  
                  // 再生開始をsessionManagerに通知
                  fetch('/elevenlabs/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'playing' })
                  }).catch(error => {
                    console.error('Failed to notify playback start:', error);
                  });
                  
                  // システム音声再生フラグを設定（エコー防止）
                  isSystemPlaying = true;
                  
                  // 再生完了時の処理
                  audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    console.log('✅ ElevenLabs playback completed');
                    
                    // システム音声再生フラグをクリア
                    isSystemPlaying = false;
                    
                    // 再生完了をsessionManagerに通知
                    fetch('/elevenlabs/status', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'completed' })
                    }).catch(error => {
                      console.error('Failed to notify playback completion:', error);
                    });
                  };
                  
                  // エラー時も通知
                  audio.onerror = (e) => {
                    console.error('❌ Audio error:', e);
                    
                    // システム音声再生フラグをクリア
                    isSystemPlaying = false;
                    
                    // エラー時も再生完了として扱う
                    fetch('/elevenlabs/status', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'completed' })
                    }).catch(error => {
                      console.error('Failed to notify error completion:', error);
                    });
                  };
                  
                  // 再生実行
                  const playPromise = audio.play();
                  if (playPromise !== undefined) {
                    playPromise
                      .then(() => {
                        console.log('✅ ElevenLabs playback started successfully');
                      })
                      .catch((error) => {
                        console.error('❌ Playback failed:', error);
                        
                        // システム音声再生フラグをクリア
                        isSystemPlaying = false;
                        
                        // 再生失敗時も完了として扱う
                        fetch('/elevenlabs/status', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'completed' })
                        });
                      });
                  }
                  
                } catch (error) {
                  console.error('❌ ElevenLabs processing failed:', error);
                  
                  // システム音声再生フラグをクリア
                  isSystemPlaying = false;
                  
                  // エラー時も完了として扱う
                  fetch('/elevenlabs/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'completed' })
                  });
                }
              }

            } catch (error) {
              console.error('WebSocket message error:', error);
            }
          };

          ws.onopen = () => console.log('✅ WebSocket connected');
          ws.onclose = () => {
            console.log('❌ WebSocket disconnected, reconnecting...');
            setTimeout(connectWebSocket, ${WS_RECONNECT_DELAY_MS});
          };
        }

        // PCM16音声再生（キュー処理）
        async function playNextPCM16Audio() {
          if (audioQueue.length === 0) {
            isPlaying = false;
            currentSource = null;
            return;
          }

          isPlaying = true;
          const pcm16Data = audioQueue.shift();

          if (!audioContext) {
            audioContext = new AudioContext({ sampleRate: ${AUDIO_SAMPLE_RATE} });
          }

          try {
            // PCM16データをFloat32に変換
            const int16Array = new Int16Array(pcm16Data);
            const float32Array = new Float32Array(int16Array.length);
            
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768.0;
            }

            // AudioBufferを作成
            const audioBuffer = audioContext.createBuffer(1, float32Array.length, ${AUDIO_SAMPLE_RATE});
            audioBuffer.copyToChannel(float32Array, 0);

            // 再生
            const source = audioContext.createBufferSource();
            currentSource = source;  // 現在再生中のソースを保存
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => {
              currentSource = null;  // 再生終了時にクリア
              playNextPCM16Audio();
            };
            source.start();
          } catch (error) {
            console.error('PCM16 playback error:', error);
            currentSource = null;
            playNextPCM16Audio();
          }
        }

        // マイク音声取得とSDK送信（PCM16形式）
        async function startVoiceCapture() {
          try {
            const useSDK = await checkSDKStatus();

            if (!useSDK) {
              console.error('SDK not ready, cannot start voice capture');
              return;
            }

            // 監視ステータスに依らず録音を開始し、復旧は Bridge 側の WS で ensureConnected に任せる
            console.log('✅ Starting voice capture (bridge will ensure connection as needed)');

            // マイクアクセス（16kHz PCM16用設定）
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                sampleRate: ${AUDIO_SAMPLE_RATE},
                sampleSize: 16,
                echoCancellation: true,
                noiseSuppression: true
              }
            });

            // AudioContextでPCM16形式に変換
            const audioCtx = new AudioContext({ sampleRate: ${AUDIO_SAMPLE_RATE} });
            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(audioCtx.destination);

            // PCM16形式で音声データを送信（システム再生ガード）
            processor.onaudioprocess = async (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // 出力停止直後の短時間は送信を抑制（残り香による誤検知防止）
              if (Date.now() < micPostStopMuteUntil) {
                return;
              }
              // システム再生中は送信しない（エコー防止）
              if (isSystemPlaying) {
                return;
              }

              // Float32をInt16に変換（プリロール保持のため先に作る）
              const int16Array = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              // 常時ストリーミング送信（WSバイナリ直送）
              if (!int16Array || int16Array.length === 0) return;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(int16Array.buffer);
              }

            };

            console.log('🎤 Voice capture started (PCM16)');

          } catch (error) {
            console.error('Failed to start voice capture:', error);
          }
        }

        // 初期化
        async function initialize() {
          console.log('🚀 Initializing SDK WebSocket voice mode...');
          // ユーザーのタイムゾーンをBridgeへ通知
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await fetch('/user/timezone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timezone: tz })
            });
            console.log('🌐 Reported user timezone:', tz);
          } catch (e) {
            console.warn('Failed to report timezone:', e);
          }

          // 追加: 起動直後に一度だけ接続を確立（デッドロック防止）
          await ensureSDKConnection();

          // WebSocket接続
          connectWebSocket();

          // 接続監視ループ（1.5秒間隔）
          setInterval(() => { checkSDKStatus(); }, ${CHECK_STATUS_INTERVAL_MS});
          // SDKがReadyになったら録音開始（Readyでない場合はリトライ）
          startCaptureWhenReady(1000, 15);
        }

        // 開始
        initialize();
      `);
    }, 2000);
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
  tray.setToolTip('Anicca - Say "アニッチャ" to begin');
}

// トレイメニューを更新
function updateTrayMenu() {
  const userName = authService?.isAuthenticated() ? authService.getCurrentUserName() : 'ゲスト';
  const isAuthenticated = authService?.isAuthenticated() || false;
  const planInfo = authService?.getPlanInfo();
  const planKey = planInfo?.plan || 'free';
  const planLabel = planKey === 'pro' ? 'Pro' : (planKey === 'grace' ? 'Grace' : 'Free');
  const usageLabel = planInfo?.daily_usage_limit
    ? `残り ${planInfo?.daily_usage_remaining ?? 0}/${planInfo.daily_usage_limit}`
    : '制限なし';

  const billingItems: MenuItemConstructorOptions[] = [];
  if (planKey !== 'pro') {
    billingItems.push({
      label: 'Upgrade to Anicca Pro ($5/月)',
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
      label: `⭐ 現在のプラン: ${planLabel}` + (planInfo?.daily_usage_limit ? ` (${usageLabel})` : ''),
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
            showNotification('エラー', '認証サービスが初期化されていません');
          }
        } catch (error) {
          console.error('Failed to get Google OAuth URL:', error);
          showNotification('エラー', 'ログインに失敗しました');
        }
      }
    }] : []),
    ...(isAuthenticated ? [{
      label: 'Logout',
      click: async () => {
        if (authService && authService.isAuthenticated()) {
          const userName = authService.getCurrentUserName();
          await authService.signOut();
          showNotification('ログアウト', `${userName}さん、さようなら`);

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
  const body = message || '無料枠の上限に達しました。Proプランへのアップグレードをご検討ください。';
  showNotification('利用上限に達しました', body);
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
    showNotification('エラー', '決済ページの取得に失敗しました。しばらくしてから再度お試しください。');
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
    showNotification('エラー', '管理ページの取得に失敗しました。しばらくしてから再度お試しください。');
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
          await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/sdk/ensure`, { method: 'POST' });
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
  const ws = new WebSocket(`ws://localhost:${PORTS.OAUTH_CALLBACK}/ws`);
  
  // テンプレートは task.id の接頭辞で選択（最小ロジック）

  ws.on('open', () => {
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

    // Resolve prompts directory robustly (packaged/asar and dev both対応)
    const appRoot = path.resolve(__dirname, '..'); // dist/ の1つ上（asar内）
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
    }

    const commandBody = [commonText, resolvedTemplate]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\$\{task\.description\}/g, String(task.description ?? ''));

    ws.send(JSON.stringify({
      type: 'scheduled_task',
      taskId: task.id,
      command: commandBody
    }));
  });
  
  ws.on('message', (data) => {
    // console.log('📨 Response from server:', data); // 冗長な出力を抑制
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
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
