import { app, Tray, Menu, nativeImage, BrowserWindow, powerSaveBlocker, dialog } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { setTracingDisabled } from '@openai/agents';
import { getAuthService, DesktopAuthService } from './services/desktopAuthService';
import { API_ENDPOINTS, PORTS, UPDATE_CONFIG } from './config';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as os from 'os';
import { WebSocket } from 'ws';
// SDK imports
import { AniccaSessionManager } from './agents/sessionManager';
import { createAniccaAgent } from './agents/mainAgent';

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

// 起動モードの判定
const isWorkerMode = process.env.WORKER_MODE === 'true';

// 定期タスク管理
const cronJobs = new Map<string, any>();
const scheduledTasksPath = path.join(os.homedir(), '.anicca', 'scheduled_tasks.json');

// アプリの初期化
async function initializeApp() {
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
      }
      
      // sessionManagerにユーザーIDを設定
      if (sessionManager && user.id) {
        sessionManager?.setCurrentUserId(user.id);
        console.log(`✅ Updated session manager with user ID: ${user.id}`);
      }
      
      // 通知とトレイメニュー更新
      showNotification('ログイン成功', `${user.email}でログインしました`);
      updateTrayMenu();
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
      sessionManager = new AniccaSessionManager(mainAgent);
      await sessionManager.initialize();
      
      // 認証済みユーザーIDを設定（SessionManager初期化後）
      if (userId) {
        sessionManager.setCurrentUserId(userId);
        console.log(`✅ User ID set in session manager: ${userId}`);
      }
      
      const sessionUrl = userId 
        ? `${API_ENDPOINTS.OPENAI_PROXY.SESSION}?userId=${userId}`
        : API_ENDPOINTS.OPENAI_PROXY.SESSION;
      const response = await fetch(sessionUrl);

      if (response.ok) {
        const data = await response.json();
        const apiKey = data.client_secret?.value;
        if (apiKey) {
          await sessionManager.connect(apiKey);
          console.log('✅ AniccaSessionManager connected with SDK');
        }
      } else {
        console.warn('⚠️ Failed to get API key from proxy, continuing without SDK');
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
    
    // 少し待ってからBrowserWindowを作成
    setTimeout(() => {
      createHiddenWindow();
      console.log('✅ Hidden browser window created');
    }, 3000);
    
    // システムトレイの初期化
    createSystemTray();
    console.log('✅ System tray created');
    
    // ログ設定（本番はinfo、devは上でdebugに設定済み）
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // 自動更新の初期化（本番環境のみ）
    if (process.env.NODE_ENV === 'production') {
      // チャンネル指定（環境変数があれば優先、なければ設定値）
      const updateChannel = process.env.UPDATE_CHANNEL || UPDATE_CONFIG.CHANNEL;
      autoUpdater.channel = updateChannel;

      // プレリリース許可: バージョンがプレリリース（例: 0.6.3-beta.x）またはbetaチャンネル時
      const isPrereleaseVersion = /-/.test(app.getVersion());
      autoUpdater.allowPrerelease = isPrereleaseVersion || updateChannel === 'beta';

      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      log.info(`✅ Auto-updater initialized (channel=${updateChannel}, allowPrerelease=${autoUpdater.allowPrerelease})`);

      // エラー時のログ記録（サイレント）
      autoUpdater.on('error', (error) => {
        log.error('Auto-updater error:', error);
      });

      // 更新ダウンロード完了時: 再起動プロンプトを表示
      autoUpdater.on('update-downloaded', async (info) => {
        try {
          log.info(`Update downloaded: ${info?.version || ''}`);
          const result = await dialog.showMessageBox({
            type: 'info',
            buttons: ['今すぐ再起動', '後で'],
            defaultId: 0,
            cancelId: 1,
            title: 'アップデートの準備ができました',
            message: '新しいバージョンをインストールできます。今すぐ再起動して適用しますか？'
          });
          if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
          }
        } catch (e) {
          log.warn('Failed to show restart prompt after update download', e);
        }
      });

      // 起動時に一度チェック
      autoUpdater.checkForUpdatesAndNotify();

      // 定期チェック（設定値に基づく）
      updateCheckIntervalId = setInterval(() => {
        try {
          autoUpdater.checkForUpdatesAndNotify();
        } catch (e) {
          log.warn('Auto-update periodic check failed', e);
        }
      }, UPDATE_CONFIG.CHECK_INTERVAL);
    }
    // 開発環境では何も出力しない
    
    // 通知
    // showNotification('Anicca Started', 'Say "アニッチャ" to begin!');
    
    // 定期タスクシステムを初期化
    initializeScheduledTasks();
    
    // スリープ防止を有効化（システムスリープのみ防ぐ）
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('🛡️ Power Save Blocker activated:', powerSaveBlocker.isStarted(powerSaveBlockerId));
    
    // アプリ終了時にブロッカーを解除
    app.on('before-quit', () => {
      if (updateCheckIntervalId) {
        clearInterval(updateCheckIntervalId);
        updateCheckIntervalId = null;
      }
      if (powerSaveBlockerId !== null) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        console.log('🛡️ Power Save Blocker stopped');
      }
    });
    
  } catch (error) {
    console.error('❌ Initialization error:', error);
    
    if (app.isPackaged) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Anicca Startup Error', 
        `Failed to start Anicca:\n\n${error}`);
    }
    
    app.quit();
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

        // SDK状態確認
        async function checkSDKStatus() {
          try {
            const response = await fetch('/sdk/status');
            const status = await response.json();
            console.log('SDK Status:', status);
            return status.useSDK && status.connected && status.transport === 'websocket';
          } catch (error) {
            console.error('Failed to check SDK status:', error);
            return false;
          }
        }

        // WebSocket接続（音声出力受信用）
        function connectWebSocket() {
          ws = new WebSocket('ws://localhost:${PORTS.OAUTH_CALLBACK}');

          ws.onmessage = async (event) => {
            try {
              const message = JSON.parse(event.data);

              // PCM16音声出力データを受信
              if (message.type === 'audio_output' && message.format === 'pcm16') {
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

              // 音声中断処理
              if (message.type === 'audio_interrupted') {
                console.log('🛑 Audio interrupted - clearing queue');
                audioQueue = [];
                isPlaying = false;
                
                // 再生中の音声を停止
                if (currentSource) {
                  currentSource.stop();
                  currentSource = null;
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
            setTimeout(connectWebSocket, 3000);
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
            audioContext = new AudioContext({ sampleRate: 24000 });
          }

          try {
            // PCM16データをFloat32に変換
            const int16Array = new Int16Array(pcm16Data);
            const float32Array = new Float32Array(int16Array.length);
            
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768.0;
            }

            // AudioBufferを作成
            const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
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

            console.log('✅ Using SDK WebSocket mode for voice processing');

            // マイクアクセス（16kHz PCM16用設定）
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                sampleRate: 24000,
                sampleSize: 16,
                echoCancellation: true,
                noiseSuppression: true
              }
            });

            // AudioContextでPCM16形式に変換
            const audioCtx = new AudioContext({ sampleRate: 24000 });
            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(audioCtx.destination);

            // PCM16形式で音声データを送信
            processor.onaudioprocess = async (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Float32をInt16に変換
              const int16Array = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              // システム音声再生中は送信しない（エコー防止）
              if (isSystemPlaying) {
                return;
              }

              // 修正: 空データチェック追加（PCM16エラー防止）
              if (!int16Array || int16Array.length === 0) {
                return;  // 空データは送信しない
              }

              // Base64エンコードして送信
              const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
              
              // 修正: base64も確認
              if (!base64 || base64.length === 0) {
                return;  // base64が空でも送信しない
              }

              try {
                const response = await fetch('/audio/input', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    audio: base64,
                    format: 'pcm16',
                    sampleRate: 24000
                  })
                });

                if (!response.ok) {
                  console.error('Failed to send PCM16 audio to SDK');
                }
              } catch (error) {
                console.error('Audio send error:', error);
              }
            };

            console.log('🎤 Voice capture started (SDK WebSocket mode, PCM16)');

          } catch (error) {
            console.error('Failed to start voice capture:', error);
          }
        }

        // 初期化
        async function initialize() {
          console.log('🚀 Initializing SDK WebSocket voice mode...');

          // WebSocket接続
          connectWebSocket();

          // 2秒待ってから音声開始
          setTimeout(() => {
            startVoiceCapture();
          }, 2000);
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
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `👤 ${userName}`,
      enabled: false
    },
    { type: 'separator' },
    ...(!isAuthenticated ? [{
      label: 'Login with Google',
      click: async () => {
        const { shell } = require('electron');
        try {
          // authServiceのメソッドを使用してOAuth URLを取得
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
          
          // トレイメニューを更新
          updateTrayMenu();
          
          // SessionManagerのユーザーIDをリセット
          if (sessionManager) {
            sessionManager.setCurrentUserId('desktop-user');
          }
        }
      }
    }] : []),
    { type: 'separator' },
    {
      label: 'Toggle Developer Tools',
      click: () => {
        if (hiddenWindow) {
          if (hiddenWindow.webContents.isDevToolsOpened()) {
            hiddenWindow.webContents.closeDevTools();
          } else {
            hiddenWindow.webContents.openDevTools({ mode: 'detach' });
          }
        }
      }
    },
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

// 定期タスク管理関数
function initializeScheduledTasks() {
  if (fs.existsSync(scheduledTasksPath)) {
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    const data = JSON.parse(content);
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
  });
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
    timezone: task.timezone || 'Asia/Tokyo',
    scheduled: true
  });

  cronJobs.set(task.id, job);
}

function removeTaskFromJson(taskId: string) {
  if (fs.existsSync(scheduledTasksPath)) {
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    const data = JSON.parse(content);
    data.tasks = data.tasks.filter((t: any) => t.id !== taskId);
    fs.writeFileSync(scheduledTasksPath, JSON.stringify(data, null, 2));
    console.log(`✅ タスク削除完了: ${taskId}`);
  }
}

async function executeScheduledTask(task: any) {
  const ws = new WebSocket(`ws://localhost:${PORTS.OAUTH_CALLBACK}/ws`);
  
  // 慈悲の瞑想タスクかどうか判定（jihi_で始まるIDまたは既存のjihino_meisou）
  const isJihiMeditation = task.id?.startsWith('jihi_') || 
                          task.id?.includes('jihino_meisou');

  ws.on('open', () => {
    const enhancedCommand = `
      【重要】ユーザーについての情報や好みに合わせて、以下の内容を柔軟に調整すること。
      
      今、${task.description}の時間になった。

      【起床・就寝の声かけ】
      - 声かけを一瞬も止めないでください。フロー実行後も、声をかけ続けること。
      - ユーザーの反応があるまで永遠に声をかけ続けてください
      - 5秒も黙ることは禁止です。常に声を出し続けてください

      【絶対禁止事項】
      - 「かもしれません」「たぶん」等の曖昧表現
      - 予定・習慣記録を想像で話すこと（必ず確認する）
      - 5秒以上の沈黙
      
      起床タスクの場合：
      【必須実行フロー - 絶対順守】
      1. 「○時○分だよ、おはよう！」と挨拶
      2. 【絶対実行】read_fileでscheduled_tasks.jsonを確認し、今日の予定を伝える。
      3. 今日の予定を断定的に：「9時から会議、14時から開発がある」
      4. 予定を理由に起床促進：「会議まであと2時間しかないぞ！」
      5. 起きるまで声をかけ続ける。
      
      就寝タスクの場合：
      【必須実行フロー - 絶対順守】
      1. 「○時○分だよ、寝る時間！」と宣言
      2. 【絶対実行】read_fileでscheduled_tasks.jsonで明日の予定を確認し伝える。
      3. 「明日は8時から重要な会議があるから、今寝れば7時間睡眠確保できる」
      4. 寝るまで声をかけ続ける。
      
      反応がない場合の自動追加タスク：
      - 3分経っても反応がない場合、write_fileでscheduled_tasks.jsonに新規タスクを追加
      - 新規ID形式: wake_up_HHMM_today（例：wake_up_0603_today）
      - 元のタスクはそのまま残す
      - 新規タスクのdescriptionに「（今日のみ）」を追加
      - 最大3回まで3分ごとに追加
      
      【共通ルール】
      - エスカレーション：優しい→厳しい→脅し
      
      Slack返信タスクの場合：
      「○時○分になりました。Slack返信を始めます」と宣言して返信フローを開始してください。
      
      瞑想タスクの場合（慈悲の瞑想以外）：
      - descriptionに「瞑想開始」が含まれる場合：
        「○時○分です、瞑想の時間です。[descriptionに含まれる時間]の瞑想を始めましょう」と言ってください。
        例：descriptionが「瞑想開始（1時間）」なら「○時○分です、瞑想の時間です。1時間の瞑想を始めましょう」
      - descriptionに「瞑想終了」が含まれる場合：
        「瞑想終了の時間です。お疲れ様でした」と言ってください。
      
      慈悲（じひ）の瞑想タスクの場合：
      【超重要：ElevenLabsで読み上げる】
      - 慈悲の瞑想は必ずtext_to_speechツールを使って読み上げる
      - 絶対に、一度に一回だけtext_to_speechを実行する。長いテキストでも必ず一回にまとめる。絶対に複数回実行しない。
      - 短時間で連続実行は厳禁（音声が重複して最悪の体験になる）
      - あなた自身は絶対に発声しない（ElevenLabsと音声が重なるため）
      - 以下の手順で実行：
      
      1. まずtext_to_speechツールで以下の全文を読み上げる。絶対に、一度だけ呼び出し：
      【重要：○時○分の部分はdescriptionの現在時刻に置き換える】
      【重要：voice_idは必ずVR6AewLTigWG4xSOukaG（Arnold - 老人男性）を使用】
      【重要：voice_settingsは { stability: 0.7, similarity_boost: 0.8, speed: 0.9 } でゆっくり読み上げる】
      「[実際の時刻を入れる]です、慈悲の瞑想の時間です。
      
      それでは一緒に慈悲の瞑想を始めましょう。

      私が幸せでありますように
      私の悩み苦しみがなくなりますように
      私のねがいごとが叶えられますように
      私にさとりの光が現れますように

      私の家族が幸せでありますように
      私の家族の悩み苦しみがなくなりますように
      私の家族の願いごとが叶えられますように
      私の家族にさとりの光が現れますように

      生きとし いけるものが幸せでありますように
      生きとし いけるものの悩み苦しみがなくなりますように
      生きとし いけるものの願いごとが叶えられますように
      生きとし いけるものにさとりの光が現れますように
      
      慈悲の瞑想を終了しました」
      
      2. text_to_speechの読み上げが完全に終わるまで待つ
      3. 読み上げ中は絶対に自分で発声しない
      4. 読み上げ完了後も何も言わない（すでに「終了しました」が含まれているため）
      
      【絶対厳守】
      - この瞑想文全体を必ずtext_to_speechツールに渡す。複数回は絶対にダメで、一度だけ呼び出しする。
      - 自分では一切発声しない。
      - ElevenLabsの音声再生中は完全に沈黙を保つ
    `;
    
    ws.send(JSON.stringify({
      type: 'scheduled_task',
      taskType: isJihiMeditation ? 'jihi_meditation' : 'normal',
      taskId: task.id,
      command: enhancedCommand
    }));
    
    // WebSocket接続を維持（5秒切断を削除）
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
        
        const data = JSON.parse(content);
        const tasks = data.tasks || [];

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
