import { app, Tray, Menu, nativeImage, BrowserWindow, powerSaveBlocker, dialog, powerMonitor } from 'electron';
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
const todaySchedulePath = path.join(os.homedir(), '.anicca', 'today_schedule.json');

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
        ? `${API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION}?userId=${userId}`
        : API_ENDPOINTS.OPENAI_PROXY.DESKTOP_SESSION;
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
    
  // スリープ防止の設定
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log('✅ Power save blocker started');

  // 復帰時の即時リフレッシュと接続保証
  powerMonitor.on('resume', async () => {
    console.log('⏰ System resume detected - refreshing auth & proxy JWT');
    try {
      if (authService) {
        await authService.refreshSession();  // Supabaseセッション更新
        await authService.getProxyJwt();     // Proxy JWT再取得（必要時）
      }
    } catch (e) {
      console.warn('Auth refresh on resume failed:', (e as any)?.message || e);
    }
    // Realtime接続の即保証（best-effort）
    try {
      await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/sdk/ensure`, { method: 'POST' });
    } catch { /* noop */ }
  });
    // ログイン済み（認証後）の場合は、定期タスクを自動開始
    if (authService.isAuthenticated()) {
      console.log('👤 User is authenticated, starting scheduled tasks...');
      initializeScheduledTasks();
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
        let sendQueue = [];          // /audio/input 直列送信用キュー
        let sending = false;         // 送信中フラグ
        const queueHighWater = 8;    // 最大キュー長（約1.3秒分）
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

        function enqueueFrame(base64) {
          try {
            if (!base64 || base64.length === 0) return;
            if (sendQueue.length >= queueHighWater) {
              sendQueue.shift();
            }
            sendQueue.push(base64);
            drainQueue();
          } catch (e) {
            console.error('enqueue error:', e);
          }
        }

        async function drainQueue() {
          if (sending) return;
          sending = true;
          try {
            while (sendQueue.length) {
              const b64 = sendQueue.shift();
              try {
                const resp = await fetch('/audio/input', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ audio: b64, format: 'pcm16', sampleRate: 24000 })
                });
                if (!resp.ok) {
                  console.warn('audio/input not ok:', resp.status);
                }
              } catch (e) {
                console.error('audio/input send error:', e);
              }
            }
          } finally {
            sending = false;
            if (sendQueue.length) drainQueue();
          }
        }

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
                isAgentSpeaking = true; // 視覚用のみ（ゲートには不使用）
              }
              if (message.type === 'audio_stopped') {
                isAgentSpeaking = false; // 視覚用のみ（ゲートには不使用）
                // 出力直後の誤割り込み抑止
                micPostStopMuteUntil = Date.now() + 300;
              }

              // 応答完了（フォールバックで半二重を確実に戻す）
              if (message.type === 'turn_done') {
                isAgentSpeaking = false;
                micPaused = false;
                console.log('🔁 turn_done: gates cleared');
                // 出力直後の誤割り込み抑止
                micPostStopMuteUntil = Date.now() + 300;
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

            // 監視ステータスに依らず録音を開始し、復旧は /audio/input 側で ensureConnected に任せる
            console.log('✅ Starting voice capture (bridge will ensure connection as needed)');
            // 独自RMSゲートは無効化（送信前ブロックOFF）
            const RMS_THRESHOLD = 0;      // 0 = 無効化
            const MIN_SPEECH_MS = 0;      // 0 = 無効化
            const SAMPLE_RATE = 24000;
            let speechAccumMs = 0;
            // プリロール（先行バッファ）で開始直後から十分量を送る
            const FRAME_SAMPLES = 4096;
            const FRAME_MS = (FRAME_SAMPLES / SAMPLE_RATE) * 1000; // ≈171ms
            const PREROLL_MS = 0; // 0 = 無効化（先行送出しない）
            const MAX_PREROLL_FRAMES = 0;
            let preRoll = [];
            let speaking = false;

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

            // PCM16形式で音声データを送信（ゲート無効化：常時ストリーミング）
            processor.onaudioprocess = async (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // 出力停止直後の短時間は送信を抑制（残り香による誤検知防止）
              if (Date.now() < micPostStopMuteUntil) {
                return;
              }

              // Float32をInt16に変換（プリロール保持のため先に作る）
              const int16Array = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              // 送信停止条件：
              // 1) システム音声（ElevenLabs等）再生中 → 送信停止
              if (isSystemPlaying) {
                return;
              }


              // 常時ストリーミング送信（空データは送らない）
              if (!int16Array || int16Array.length === 0) return;
              const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
              if (!base64 || base64.length === 0) return;
              enqueueFrame(base64);

              // 発話終了トグルは独自ゲート無効化中は不使用
              // if (speechAccumMs === 0) { speaking = false; }
            };

            console.log('🎤 Voice capture started (PCM16, no RMS pre-gate)');

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
          setInterval(() => { checkSDKStatus(); }, 1500);
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
    const data = JSON.parse(content);
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
    const data = JSON.parse(content);
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
    else if (id.startsWith('mtg_pre_')) tpl = 'mtg_pre.txt';
    else if (id.startsWith('mtg_start_')) tpl = 'mtg_start.txt';

    const commonPath = path.join(process.cwd(), 'prompts', 'common.txt');
    const tplPath = path.join(process.cwd(), 'prompts', tpl);
    let commonText = '';
    let templateText = '';
    try { commonText = fs.readFileSync(commonPath, 'utf8'); } catch {}
    try { templateText = fs.readFileSync(tplPath, 'utf8'); } catch { templateText = '今、{{taskDescription}}の時間になった。'; }
    const commandBody = [commonText, templateText]
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
