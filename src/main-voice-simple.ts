import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { VoiceServerService } from './services/voiceServer';
import { getAuthService, DesktopAuthService } from './services/desktopAuthService';
import { API_ENDPOINTS, PORTS, UPDATE_CONFIG } from './config';

// 環境変数を読み込み
dotenv.config();

// グローバル変数
let tray: Tray | null = null;
let hiddenWindow: BrowserWindow | null = null;
let voiceServer: VoiceServerService | null = null;
let isListening = false;
let authService: DesktopAuthService | null = null;

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
    
    // プロキシモードではAPIキーチェックをスキップ
    if (process.env.OPENAI_API_KEY) {
      console.log('✅ OpenAI API key found (local mode)');
    } else {
      console.log('🌐 Using proxy mode for OpenAI API');
    }
    
    // VoiceServerServiceを起動
    voiceServer = new VoiceServerService();
    
    // 認証済みユーザーIDを設定
    const userId = authService.getCurrentUserId();
    if (userId) {
      voiceServer.setCurrentUserId(userId);
      console.log(`✅ User ID set in voice server: ${userId}`);
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
        let userId = ${voiceServer?.getCurrentUserId() ? `'${voiceServer.getCurrentUserId()}'` : 'null'};
        const apiBaseUrl = '${API_ENDPOINTS.OPENAI_PROXY.SESSION}'.replace('/api/openai-proxy/session', '');
        const toolsBaseUrl = '${API_ENDPOINTS.TOOLS.BASE}';
        
        // WebSocketに接続してリアルタイム通知を受信
        function connectWebSocket() {
          ws = new WebSocket(\`ws://localhost:${PORTS.OAUTH_CALLBACK}\`);
          
          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              console.log('🔔 WebSocket message:', message);
              
              if (message.type === 'worker_task_complete' && dataChannel?.readyState === 'open') {
                // Worker完了通知を音声で報告
                const text = message.payload.message;
                console.log('🗣️ Announcing:', text);
                
                // OpenAI RealtimeAPIで音声合成
                dataChannel.send(JSON.stringify({
                  type: 'response.create',
                  response: {
                    modalities: ['audio'],
                    instructions: \`次のメッセージを日本語で読み上げてください: "\${text}"\`
                  }
                }));
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
            pc.ontrack = e => audioElement.srcObject = e.streams[0];
            
            // Data channel for communication
            dataChannel = pc.createDataChannel('oai-events');
            console.log('📡 Data channel created, state:', dataChannel.readyState);
            
            dataChannel.onopen = () => {
              console.log('✅ Data channel opened! State:', dataChannel.readyState);
              
              // Send session config
              dataChannel.send(JSON.stringify({
                type: 'session.update',
                session: {
                  instructions: session.instructions,
                  voice: session.voice,
                  input_audio_format: session.input_audio_format,
                  output_audio_format: session.output_audio_format,
                  input_audio_transcription: { model: 'whisper-1' },
                  turn_detection: session.turn_detection,
                  tools: session.tools,
                  tool_choice: 'auto',
                  temperature: session.temperature,
                  max_response_output_tokens: session.max_response_output_tokens
                }
              }));
            };
            
            dataChannel.onerror = (error) => {
              console.error('❌ Data channel error:', error);
            };
            
            dataChannel.onclose = () => {
              console.log('📴 Data channel closed');
            };
            
            dataChannel.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                console.log('📨 Message:', data.type);
                
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
            const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
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
            
            // Call our server which proxies to appropriate API
            const toolsUrl = ${isDev}
              ? userId ? \`/tools/\${name}?userId=\${userId}\` : \`/tools/\${name}\`
              : userId 
                ? \`\${toolsBaseUrl}/\${name}?userId=\${userId}\`
                : \`\${toolsBaseUrl}/\${name}\`;
            const response = await fetch(toolsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                arguments: JSON.parse(args)
              })
            });
            
            const result = await response.json();
            
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
            console.error('Function call error:', error);
          }
        }
        
        // WebSocketに接続
        connectWebSocket();
        
        // 自動的にWebRTC接続を開始
        setTimeout(() => {
          console.log('🚀 Auto-starting voice session...');
          startVoiceSession();
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
    {
      label: isListening ? '🎙️ Listening...' : '🔇 Ready',
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
    {
      label: 'Connect Slack',
      click: async () => {
        const { shell } = require('electron');
        // Fetch the actual OAuth URL from the API
        try {
          // 認証されたユーザーIDを取得
          const userId = authService?.getCurrentUserId() || 'desktop-user';
          const apiUrl = `${API_ENDPOINTS.SLACK.OAUTH_URL}?platform=desktop&userId=${userId}`;
          const response = await fetch(apiUrl);
          const data = await response.json();
          
          if (data.url) {
            shell.openExternal(data.url);
          } else {
            console.error('Failed to get Slack OAuth URL');
            showNotification('Error', 'Failed to get Slack authentication URL');
          }
        } catch (error) {
          console.error('Error fetching Slack OAuth URL:', error);
          showNotification('Error', 'Failed to connect to Slack');
        }
      }
    },
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