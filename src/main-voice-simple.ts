import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { VoiceServerService } from './services/voiceServer';

// 環境変数を読み込み
dotenv.config();

// グローバル変数
let tray: Tray | null = null;
let hiddenWindow: BrowserWindow | null = null;
let voiceServer: VoiceServerService | null = null;
let isListening = false;

// アプリの初期化
async function initializeApp() {
  console.log('🎩 Anicca Voice Assistant Starting...');
  
  try {
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
    await voiceServer.start(8085);
    console.log('✅ Voice server started');
    
    // 少し待ってからBrowserWindowを作成
    setTimeout(() => {
      createHiddenWindow();
      console.log('✅ Hidden browser window created');
    }, 3000);
    
    // システムトレイの初期化
    createSystemTray();
    console.log('✅ System tray created');
    
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
  
  // voice-demoのクライアントページを開く（ポート8085）
  hiddenWindow.loadURL('http://localhost:8085');
  
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
        
        // WebRTCセッションを自動的に開始する関数
        async function startVoiceSession() {
          try {
            console.log('🚀 Starting voice session...');
            
            // Get session from server
            const sessionUrl = ${isDev} 
              ? '/session'
              : 'https://anicca-proxy-ten.vercel.app/api/openai-proxy/session';
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
            dataChannel.onopen = () => {
              console.log('✅ Data channel opened!');
              
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
              ? \`/tools/\${name}\`
              : \`https://anicca-proxy-ten.vercel.app/api/tools/\${name}\`;
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
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isListening ? '🎙️ Listening...' : '🔇 Ready',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Connect Slack',
      click: async () => {
        const { shell } = require('electron');
        shell.openExternal('https://anicca-proxy-ten.vercel.app/api/slack-oauth');
      }
    },
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
        showNotification('Anicca v0.6.0', 'Voice AI Assistant\nSay "アニッチャ" to start!');
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

app.on('before-quit', async () => {
  console.log('👋 Anicca shutting down...');
  
  if (voiceServer) {
    voiceServer.stop();
  }
  
  if (hiddenWindow) {
    hiddenWindow.close();
  }
  
  if (tray) {
    tray.destroy();
  }
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});