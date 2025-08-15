import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { VoiceServerService } from './services/voiceServer';
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

// グローバル変数
let tray: Tray | null = null;
let hiddenWindow: BrowserWindow | null = null;
let voiceServer: VoiceServerService | null = null;
let sessionManager: AniccaSessionManager | null = null;
let mainAgent: any = null;
let currentUserId: string | null = null;
let isListening = false;
let authService: DesktopAuthService | null = null;

// 起動モードの判定
const isWorkerMode = process.env.WORKER_MODE === 'true';

// 定期タスク管理
const cronJobs = new Map<string, any>();
const scheduledTasksPath = path.join(os.homedir(), '.anicca', 'scheduled_tasks.json');

// アプリの初期化
async function initializeApp() {
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
      
      // voiceServerにユーザーIDを設定
      if (voiceServer && user.id) {
        voiceServer.setCurrentUserId(user.id);
        console.log(`✅ Updated voice server with user ID: ${user.id}`);
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
    
    // VoiceServerServiceを起動
    voiceServer = new VoiceServerService();
    
    // 認証済みユーザーIDを設定
    const userId = authService.getCurrentUserId();
    if (userId) {
      voiceServer.setCurrentUserId(userId);
      console.log(`✅ User ID set in voice server: ${userId}`);
    }
    
    // SDK版の初期化
    try {
      mainAgent = createAniccaAgent();
      sessionManager = new AniccaSessionManager();
      await sessionManager.initialize();
      
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
          await sessionManager.restoreSession();
        }
      } else {
        console.warn('⚠️ Failed to get API key from proxy, continuing without SDK');
      }
    } catch (error) {
      console.error('❌ Failed to initialize SDK:', error);
      // SDKエラーでも続行（voiceServerは動作可能）
    }
    
    await voiceServer.start(PORTS.OAUTH_CALLBACK);
    console.log('✅ Voice server started');
    
    // 少し待ってからBrowserWindowを作成
    setTimeout(() => {
      createHiddenWindow();
      console.log('✅ Hidden browser window created');
    }, 3000);
    
    // システムトレイの初期化
    createSystemTray();
    console.log('✅ System tray created');
    
    // 自動更新の初期化（サイレント）
    const log = require('electron-log');
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    
    // チャンネル設定（環境による切り替え）
    autoUpdater.channel = UPDATE_CONFIG.CHANNEL;
    console.log(`✅ Auto-updater initialized with channel: ${UPDATE_CONFIG.CHANNEL}`);
    
    // エラー時のみ通知
    autoUpdater.on('error', (error) => {
      console.error('Auto-updater error:', error);
      showNotification('更新エラー', '自動更新中にエラーが発生しました。後でもう一度お試しください。');
    });
    
    // サイレント更新（通知なし）
    autoUpdater.on('update-downloaded', () => {
      console.log('Update downloaded silently');
      // 通知しない、次回起動時に自動適用
    });
    
    // 更新チェック開始
    autoUpdater.checkForUpdatesAndNotify();
    
    // 通知
    // showNotification('Anicca Started', 'Say "アニッチャ" to begin!');
    
    // 定期タスクシステムを初期化
    initializeScheduledTasks();
    
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
        console.log('🎤 Starting voice assistant...');
        
        let pc = null;
        let dataChannel = null;
        let audioElement = null;
        let ws = null;
        let isProcessingResponse = false;  // レスポンス競合防止用フラグ
        let isProcessingWorker1 = false;   // Worker1処理中フラグ
        // currentUserIdはグローバル変数として管理
        let userId = ${currentUserId ? `'${currentUserId}'` : 'null'};
        const apiBaseUrl = '${API_ENDPOINTS.OPENAI_PROXY.SESSION}'.replace('/api/openai-proxy/session', '');
        const toolsBaseUrl = '${API_ENDPOINTS.TOOLS.BASE}';
        
        
        
        // WebSocketに接続してリアルタイム通知を受信
        function connectWebSocket() {
          ws = new WebSocket(\`ws://localhost:${PORTS.OAUTH_CALLBACK}\`);
          
          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              console.log('🔔 WebSocket message:', message);
              
              if (message.type === 'worker_task_complete' && dataChannel?.readyState === 'open' && !isProcessingResponse) {
                // Worker完了通知を音声で報告
                const text = message.payload.message;
                console.log('🗣️ Announcing:', text);
                
                isProcessingResponse = true;  // フラグを設定
                
                // ユーザーメッセージとして読み上げ指示を送る
                dataChannel.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'user',  // ⭐ ユーザーからの指示として
                    content: [{
                      type: 'input_text',
                      text: \`次のメッセージを読み上げてください: "\${text}"\`
                    }]
                  }
                }));
                
                // レスポンスをトリガー
                setTimeout(() => {
                  dataChannel.send(JSON.stringify({
                    type: 'response.create',
                    response: { modalities: ['text', 'audio'] }
                  }));
                  
                  // 500ms後にフラグをリセット
                  setTimeout(() => {
                    isProcessingResponse = false;
                  }, 500);
                }, 100);
              }
              
              // Worker STATUS_UPDATE処理
              if (message.type === 'worker_status_update' && dataChannel?.readyState === 'open' && !isProcessingResponse) {
                const text = message.payload.message;
                console.log('📢 Worker status update:', text);
                
                isProcessingResponse = true;  // フラグを設定
                
                // ユーザーメッセージとして読み上げ指示を送る
                dataChannel.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'user',  // ⭐ ユーザーからの指示として
                    content: [{
                      type: 'input_text',
                      text: \`次のメッセージを読み上げて、ユーザーのフィードバックを待ちなさい。そのフィードバックを、Claudeへの指示という形にして渡すように。そしてその指示は、think_with_claudeツールのtaskパラメータとして送信してください: "\${text}"\`
                    }]
                  }
                }));
                
                // レスポンスをトリガー
                setTimeout(() => {
                  dataChannel.send(JSON.stringify({
                    type: 'response.create',
                    response: { 
                      modalities: ['text', 'audio']
                    }
                  }));
                  
                  // 500ms後にフラグをリセット
                  setTimeout(() => {
                    isProcessingResponse = false;
                  }, 500);
                }, 100);
                
                console.log('✅ Status update sent to OpenAI for speech synthesis');
              }
              
              // 定期タスク実行メッセージの処理
              if (message.type === 'scheduled_task_execute' && dataChannel?.readyState === 'open' && !isProcessingResponse) {
                console.log('📅 Executing scheduled task:', message.command);
                
                isProcessingResponse = true;  // フラグを設定
                
                // OpenAI Realtime APIに直接コマンドを送信
                dataChannel.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'user',
                    content: [{
                      type: 'input_text',
                      text: message.command
                    }]
                  }
                }));
                
                // レスポンスをトリガー
                setTimeout(() => {
                  dataChannel.send(JSON.stringify({
                    type: 'response.create',
                    response: { modalities: ['text', 'audio'] }
                  }));
                  
                  // 500ms後にフラグをリセット
                  setTimeout(() => {
                    isProcessingResponse = false;
                  }, 500);
                }, 100);
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
        
        
        
        // WebRTCセッションを自動的に開始する関数
        async function startVoiceSession() {
          try {
            console.log('🚀 Starting voice session...');
            
            // Get session from server
            const sessionUrl = ${isDev} 
              ? userId ? \`/session?userId=\${userId}\` : '/session'
              : userId 
                ? \`\${apiBaseUrl}/api/openai-proxy/session?userId=\${userId}\`
                : \`\${apiBaseUrl}/api/openai-proxy/session\`;
            const sessionResponse = await fetch(sessionUrl);
            const session = await sessionResponse.json();
            console.log('📡 Session received:', session);
            
            // Set up WebRTC
            pc = new RTCPeerConnection();
            
            // Audio element for playback
            audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            pc.ontrack = e => {
              console.log('🎵 Audio track received:', {
                streamId: e.streams[0]?.id,
                tracks: e.streams[0]?.getTracks().length,
                audioTracks: e.streams[0]?.getAudioTracks().length
              });
              audioElement.srcObject = e.streams[0];
              
              // デバッグ: 音声再生状態の監視
              audioElement.onplay = () => console.log('▶️ Audio playback started');
              audioElement.onpause = () => console.log('⏸️ Audio playback paused');
              audioElement.onerror = (err) => console.error('❌ Audio playback error:', err);
            };
            
            // Data channel for communication
            dataChannel = pc.createDataChannel('oai-events');
            console.log('📡 Data channel created, state:', dataChannel.readyState);
            
            dataChannel.onopen = () => {
              console.log('✅ Data channel opened! State:', dataChannel.readyState);
              
              // Send session config
              const sessionConfig = {
                type: 'session.update',
                session: {
                  instructions: session.instructions,  // サーバーからの指示をそのまま使用
                  voice: session.voice,
                  input_audio_format: session.input_audio_format,
                  output_audio_format: session.output_audio_format,
                  input_audio_transcription: null,  // 不要
                  turn_detection: session.turn_detection,  // server_vadをそのまま
                  tools: session.tools,  // サーバーからのツールをそのまま
                  tool_choice: 'auto',
                  temperature: session.temperature,
                  max_response_output_tokens: session.max_response_output_tokens
                }
              };
              
              dataChannel.send(JSON.stringify(sessionConfig));
            };
            
            dataChannel.onerror = (error) => {
              console.error('❌ Data channel error:', error);
            };
            
            dataChannel.onclose = () => {
              console.log('📴 Data channel closed');
            };
            
            dataChannel.onmessage = async (event) => {
              try {
                const data = JSON.parse(event.data);
                console.log('📨 Message:', data.type);
                
                
                // エラーの詳細を確認
                if (data.type === 'error') {
                  console.error('❌ OpenAI API Error:', data);
                  console.error('Error details:', JSON.stringify(data, null, 2));
                  return;
                }
                
                if (data.type === 'response.function_call_arguments.done') {
                  handleFunctionCall(data);
                }
              } catch (error) {
                console.error('Message handling error:', error);
              }
            };
            
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            pc.addTrack(stream.getTracks()[0]);
            
            // Create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            // Connect to OpenAI
            const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03', {
              method: 'POST',
              body: offer.sdp,
              headers: {
                Authorization: \`Bearer \${session.client_secret.value}\`,
                'Content-Type': 'application/sdp'
              }
            });
            
            const answerSdp = await response.text();
            await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
            
            console.log('✅ Voice session started successfully!');
            return true;
            
          } catch (error) {
            console.error('❌ Failed to start voice session:', error);
            return false;
          }
        }
        
        // Function to handle tool calls
        async function handleFunctionCall(data) {
          const { call_id, name, arguments: args } = data;
          
          try {
            console.log(\`🔧 Tool call: \${name}\`);
            console.log('🔧 Arguments received:', args);  // 追加
            
            // Worker1処理の特別処理
            if (name === 'send_to_worker1') {
              if (isProcessingWorker1) {
                console.log('⏳ Worker1は既に処理中です');
                // 即座に完了を返す
                dataChannel.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: call_id,
                    output: JSON.stringify({ result: 'Worker1が処理中です' })
                  }
                }));
                return;
              }
              isProcessingWorker1 = true;  // 処理開始
              console.log('🔒 Worker1処理開始（ブラウザ側）');
            }
            
            // Call our server which proxies to appropriate API
            const toolsUrl = ${isDev}
              ? userId ? \`/tools/\${name}?userId=\${userId}\` : \`/tools/\${name}\`
              : userId 
                ? \`\${toolsBaseUrl}/\${name}?userId=\${userId}\`
                : \`\${toolsBaseUrl}/\${name}\`;
            
            console.log('🔧 Calling URL:', toolsUrl);  // 追加
            // send_to_worker1の特別処理を追加
            let parsedArgs;
            if (name === 'send_to_worker1' && typeof args === 'string') {
              try {
                // まずJSONパースを試みる
                parsedArgs = JSON.parse(args);
              } catch (e) {
                // JSONでない場合は、messageプロパティに包む
                console.log('🔧 Wrapping plain text as message:', args);
                parsedArgs = { message: args };
              }
            } else {
              // 他のツールは通常通り
              parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
            }
            const bodyData = {
              arguments: parsedArgs
            };
            console.log('🔧 Request body:', JSON.stringify(bodyData));  // 追加
            
            const response = await fetch(toolsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyData)
            });
            
            console.log('🔧 Response status:', response.status);  // 追加
            if (!response.ok) {
              const errorText = await response.text();
              console.error('🔧 Error response:', errorText);  // 追加
              
              // Worker1エラー時にもフラグリセット
              if (name === 'send_to_worker1') {
                isProcessingWorker1 = false;
                console.log('🔓 Worker1処理エラー（ブラウザ側）');
              }
              
              // エラー時は早期リターン
              dataChannel.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: call_id,
                  output: JSON.stringify({ error: errorText || 'エラーが発生しました' })
                }
              }));
              return;  // 重要：ここでリターン
            }
            
            const result = await response.json();
            
            // Worker1処理完了時にフラグリセット
            if (name === 'send_to_worker1') {
              isProcessingWorker1 = false;
              console.log('🔓 Worker1処理完了（ブラウザ側）');
              console.log('📝 Worker1返答:', result.result);
            }
            
            // Send result back to OpenAI
            dataChannel.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: call_id,
                output: JSON.stringify(result.result || result.stories || result.results || result.response || result)
              }
            }));
            
            // Trigger response
            setTimeout(() => {
              dataChannel.send(JSON.stringify({
                type: 'response.create',
                response: { modalities: ['text', 'audio'] }
              }));
            }, 100);
            
          } catch (error) {
            if (name === 'send_to_worker1') {
              isProcessingWorker1 = false;  // エラー時にリセット
              console.log('🔓 Worker1処理エラー（ブラウザ側）');
            }
            console.error('Function call error:', error);
          }
        }
        
        // WebSocketに接続
        connectWebSocket();
        
        // 起動モードに応じて開始
        setTimeout(() => {
          console.log(${isWorkerMode} ? '🤖 Starting Worker voice mode...' : '🚀 Starting Anicca voice mode...');
          startVoiceSession();  // 両モードで同じ関数を使用
        }, 2000);
      `);
    }, 2000);
  });
}

// システムトレイの作成
function createSystemTray() {
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'assets', 'tray-icon-gpt.png')
    : path.join(__dirname, '../assets/tray-icon-gpt.png');
  
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch (error) {
    console.warn('⚠️ Tray icon not found, using default');
    trayIcon = nativeImage.createEmpty();
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
          
          // VoiceServerのユーザーIDをリセット
          if (voiceServer) {
            voiceServer.setCurrentUserId('desktop-user');
          }
        }
      }
    }] : []),
    { type: 'separator' },
    {
      label: 'Show Demo Page',
      click: () => {
        if (hiddenWindow) {
          hiddenWindow.show();
        }
      }
    },
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
      label: 'About Anicca',
      click: () => {
        showNotification('Anicca v0.6.2', 'Voice AI Assistant\nSay "アニッチャ" to start!');
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
    
    if (voiceServer) {
      await voiceServer.stop();
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

  ws.on('open', () => {
    const enhancedCommand = `
      今、${task.description}の時間になりました。
      
      【重要】あなたはユーザーの行動変容を促すエージェントです。
      
      起床タスクの場合：
      必ず最初に「○時○分です、おはようございます」と言ってください。
      その後、休みなく声をかけ続けてください。止まらないでください。
      声掛けを繰り返し、ユーザーが反応するまで絶対に止まらないでください。
      
      声かけの工夫：
      - 最初は優しく「起きてください」
      - 反応がなければエスカレート（声を大きく、口調を強く）
      - 絶対に！！！read_fileでscheduled_tasks.jsonを確認して、具体的な予定を取得し「○○の予定がありますよ」など言って、起床・就寝を促す！！それが一番効果的！
      - 「このまま寝ていると○○に遅れます」など危機感を
      - 必要なら「Slackにまだ起きてないって送りますよ」など脅しも
      - どんな手段を使ってでも確実に起こすこと
      
      反応がない場合の自動追加タスク：
      - 3分経っても反応がない場合、write_fileでscheduled_tasks.jsonに新規タスクを追加
      - 新規ID形式: wake_up_HHMM_today（例：wake_up_0603_today）
      - 元のタスクはそのまま残す
      - 新規タスクのdescriptionに「（今日のみ）」を追加
      - 最大3回まで3分ごとに追加
      
      就寝タスクの場合：
      必ず最初に「○時○分です、寝る時間です」と言ってください。
      その後、休みなく声をかけ続けてください。止まらないでください。
      声掛けを繰り返し、ユーザーが反応するまで絶対に止まらないでください。
      
      声かけの工夫：
      - 「睡眠不足は健康に悪影響です」など説得
      - 「明日の○○に集中できません」など具体的に
      - エスカレートして強い口調も使う
      - どんな手段を使ってでも確実に寝かせること
      
      Slack返信タスクの場合：
      「○時○分になりました。Slack返信を始めます」と宣言して返信フローを開始してください。
      
      【超重要】
      - 声かけを一瞬も止めないでください
      - 休憩は禁止です
      - 待機は禁止です
      - ユーザーの反応があるまで永遠に声をかけ続けてください
      - 5秒も黙ることは禁止です。常に声を出し続けてください
      - 自律的に考えて工夫してください
      - 文言は自分で考えてください。創造的になってください
    `;
    
    ws.send(JSON.stringify({
      type: 'scheduled_task',
      command: enhancedCommand
    }));
    
    // WebSocket接続を維持（5秒切断を削除）
  });
  
  ws.on('message', (data) => {
    console.log('📨 Response from server:', data);
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
    const content = fs.readFileSync(scheduledTasksPath, 'utf8');
    const data = JSON.parse(content);
    const tasks = data.tasks || [];

    tasks.forEach((task: any) => {
      registerCronJob(task);
    });

    console.log(`📅 定期タスクを再読み込みしました: ${tasks.length}個のタスク`);
  }
}