import { app, Tray, Menu, nativeImage, systemPreferences, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SimpleContinuousVoiceService } from './services/simpleContinuousVoiceService';
import { ClaudeExecutorService } from './services/claudeExecutorService';
import { ClaudeSession } from './services/claudeSession';
import { SQLiteDatabase } from './services/sqliteDatabase';
import { SlackOAuthServer } from './services/slackOAuthServer';
import { SlackMCPManager } from './services/slackMCPManager';
import { HybridRecording } from './services/hybridRecording';
// import * as textToSpeech from '@google-cloud/text-to-speech'; // プロキシ経由に変更
import { SimpleEncryption } from './services/simpleEncryption';
import * as fs from 'fs';
import * as os from 'os';

// 環境変数を読み込み
dotenv.config();

// グローバル変数
let tray: Tray | null = null;
let voiceService: SimpleContinuousVoiceService | null = null;
let executorService: ClaudeExecutorService | null = null;
let claudeSession: ClaudeSession | null = null;
let database: SQLiteDatabase | null = null;
let slackOAuthServer: SlackOAuthServer | null = null;
let slackMCPManager: SlackMCPManager | null = null;
// let ttsClient: textToSpeech.TextToSpeechClient | null = null; // プロキシ経由に変更
let localHttpsServer: any = null;  // ローカルHTTPSサーバー
let isListening = false;
let conversationActive = false;
let recorderWindow: BrowserWindow | null = null;  // MediaRecorder用の非表示ウィンドウ

// アプリの初期化
async function initializeApp() {
  console.log('🎩 Anicca Voice Assistant Starting...');
  
  // ログファイルのパス設定
  const logPath = path.join(os.homedir(), '.anicca', 'startup.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  // ログ関数
  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
  };
  
  log('🎩 Anicca Voice Assistant Starting...');
  log(`Platform: ${process.platform}`);
  log(`App packaged: ${app.isPackaged}`);
  log(`Resource path: ${process.resourcesPath || 'N/A'}`);
  
  try {
    // データベース初期化
    log('Initializing database...');
    database = new SQLiteDatabase();
    await database.init();
    log('✅ Database initialized');
    
    // TTS初期化（プロキシ経由で使用するため、クライアント初期化不要）
    log('✅ TTS ready (using proxy)');
    
    // マイク権限をチェック（要求はしない - 実際のマイクアクセス時に自動的にダイアログが表示される）
    log('Checking microphone permission...');
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      log(`Microphone permission status: ${micStatus}`);
      
      if (micStatus === 'denied') {
        log('❌ Microphone permission previously denied');
        const { dialog } = require('electron');
        dialog.showErrorBox('Microphone Permission Denied', 
          'Anicca needs microphone access to work.\n\nPlease enable it in:\nSystem Preferences > Security & Privacy > Privacy > Microphone\n\nThen restart Anicca.');
        app.quit();
        return;
      } else if (micStatus === 'not-determined') {
        log('Microphone permission not yet determined - will request on first use');
      } else if (micStatus === 'granted') {
        log('✅ Microphone permission already granted');
      }
    }
    
    // Slack OAuth Server初期化（実際にはプロキシ経由で認証するのでダミー値）
    slackOAuthServer = new SlackOAuthServer('dummy-client-id', 'dummy-client-secret');
    // HTTPSサーバーの起動（証明書不要の簡易版）
    try {
      console.log('🌐 Slack OAuth configured (using proxy)');
    } catch (error) {
      console.log('⚠️ Slack OAuth server error:', error);
    }
    
    // Slack MCP Manager初期化
    slackMCPManager = new SlackMCPManager();
    
    // Claude Executor Service初期化
    executorService = new ClaudeExecutorService(database);
    await executorService.updateMCPServers();
    console.log('✅ Claude Executor Service initialized');
    
    // Claude Session初期化（永続的なセッション管理）
    claudeSession = new ClaudeSession(executorService);
    console.log('✅ Claude Session initialized');
    
    // Voice Service初期化（プロキシ経由）
    log('Initializing voice service (proxy mode)...');
    voiceService = new SimpleContinuousVoiceService({
      useProxy: true,  // プロキシを使用
      hotwords: ['anicca', 'アニッチャ', 'あにっちゃ']
    });
    
    // ホットワード検出時の処理
    voiceService.on('hotword-detected', async (hotword: string) => {
      console.log(`🎯 Hotword detected: ${hotword}`);
      await handleConversation();
    });
    
    // MediaRecorder用の非表示ウィンドウを作成（音声サービス開始前に準備）
    log('Creating recorder window...');
    await createRecorderWindow();
    log('✅ Recorder window created');
    
    // 最初の録音でマイク権限をトリガー（音声サービス開始前）
    // TODO: SimpleContinuousVoiceServiceにgetAudioServiceメソッドを追加するか、別の方法でマイク権限を取得
    /*
    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      if (micStatus === 'not-determined') {
        log('Triggering initial microphone access...');
        try {
          // 非常に短い録音を一度だけ実行してすぐ停止
          const audioService = voiceService?.getAudioService();
          if (audioService) {
            const recordingFile = await audioService.startRecording();
            await new Promise(resolve => setTimeout(resolve, 100)); // 100msだけ録音
            await audioService.stopRecording();
            log('✅ Initial microphone trigger completed');
            
            // 権限ダイアログが表示される時間を待つ
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          log(`Initial microphone trigger error: ${error}`);
          // エラーは無視（通常の録音ループが権限をトリガーする）
        }
      }
    }
    */
    
    // 音声サービス開始（権限取得後）
    await voiceService.startListening();
    isListening = true;
    log('✅ Voice service started - Say "Anicca" to begin!');
    
    // ローカルHTTPSサーバーを起動（Slackトークン受信用）
    await startLocalHttpsServer();
    
    // システムトレイの初期化
    log('Creating system tray...');
    try {
      createSystemTray();
      log('✅ System tray created');
    } catch (error) {
      log(`❌ Failed to create system tray: ${error}`);
      log(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
    }
    
    // ログイン項目の状態を表示
    const loginSettings = app.getLoginItemSettings();
    console.log(`🔧 Start at Login: ${loginSettings.openAtLogin ? 'Enabled' : 'Disabled'}`);
    
    // 通知
    showNotification('Anicca Started', 'Say "Anicca" to begin!');
    
  } catch (error) {
    log(`❌ Initialization error: ${error}`);
    log(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
    
    // エラーダイアログを表示（パッケージ版の場合）
    if (app.isPackaged) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Anicca Startup Error', 
        `Failed to start Anicca:\n\n${error}\n\nPlease check ~/.anicca/startup.log for details.`);
    }
    
    logStream.end(() => {
      app.quit();
    });
  }
}

// MediaRecorder用の非表示ウィンドウを作成
async function createRecorderWindow(): Promise<void> {
  return new Promise((resolve) => {
    recorderWindow = new BrowserWindow({
      show: false,  // 最初は非表示
      width: 300,
      height: 200,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
    });
    
    // HTMLファイルをロード
    const htmlPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'recorder.html')
      : path.join(__dirname, '../src/recorder.html');
    
    recorderWindow.loadFile(htmlPath);
    
    // レンダラーからの準備完了通知を待つ
    ipcMain.once('recorder-ready', () => {
      console.log('✅ Recorder window ready');
      
      // マイク権限が未決定の場合のみ、ウィンドウを一瞬表示
      if (process.platform === 'darwin') {
        const micStatus = systemPreferences.getMediaAccessStatus('microphone');
        if (micStatus === 'not-determined') {
          console.log('🎤 Showing window briefly to trigger microphone permission...');
          recorderWindow?.show();
          // 500ms後に非表示に戻す
          setTimeout(() => {
            recorderWindow?.hide();
            console.log('🎤 Window hidden again');
          }, 500);
        }
      }
      
      resolve();
    });
    
    // エラーハンドリング
    recorderWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('❌ Failed to load recorder window:', errorDescription);
    });
  });
}

// システムトレイの作成
function createSystemTray() {
  // 現在のログイン項目設定を取得
  const loginItemSettings = app.getLoginItemSettings();
  
  // アイコンパスの設定（GPTアイコンを使用 - 22x22）
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'assets', 'tray-icon-gpt.png')
    : path.join(__dirname, '../assets/tray-icon-gpt.png');
  
  // アイコンが存在しない場合はデフォルトアイコンを使用
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // 空のアイコンの場合、シンプルな円を作成
      trayIcon = nativeImage.createEmpty();
    }
  } catch (error) {
    console.warn('⚠️ Tray icon not found, using default');
    trayIcon = nativeImage.createEmpty();
  }
  
  // システムトレイ作成
  tray = new Tray(trayIcon);
  
  // コンテキストメニュー
  const updateContextMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isListening ? '🎙️ Listening...' : '🔇 Not Listening',
        enabled: false
      },
      { type: 'separator' },
    {
      label: 'Connect Slack',
      click: async () => {
        await handleSlackConnection();
      }
    },
    {
      label: 'Reload MCP',
      click: async () => {
        await reloadMCP();
      }
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked
        });
        console.log(`🔧 Start at Login: ${menuItem.checked ? 'Enabled' : 'Disabled'}`);
        showNotification(
          'Auto-start ' + (menuItem.checked ? 'Enabled' : 'Disabled'),
          menuItem.checked ? 'Anicca will start automatically when you log in.' : 'Anicca will not start automatically.'
        );
      }
    },
    {
      label: 'About Anicca',
      click: () => {
        showNotification('Anicca v0.5', 'Voice-only AI Assistant\nSay "Anicca" to start!');
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
  };
  
  // 初回メニュー作成
  updateContextMenu();
  tray.setToolTip('Anicca - Say "Anicca" to begin');
}

// 会話処理
async function handleConversation() {
  if (conversationActive) return;
  conversationActive = true;
  
  try {
    // 音声サービスを一時停止
    voiceService?.stopListening();
    
    // 開始音
    playSound('Glass');
    
    // 初回のホットワードもSDKに送信（test版と同じ動作）
    const initialResponse = await claudeSession?.sendMessage('Hey Anicca') || 'はい、どうぞ。';
    await synthesizeSpeech(initialResponse);
    
    let silenceCount = 0;
    
    while (conversationActive) {
      console.log('\n🎤 Listening...');
      
      // HybridRecordingを使用（VAD + Enterキー両対応）
      const recorder = new HybridRecording();
      const audioData = await recorder.startRecordingWithHybridStop();
      
      // 音声認識
      const transcription = await voiceService?.transcribeAudio(audioData);
      
      if (!transcription || transcription.trim().length === 0) {
        silenceCount++;
        console.log(`🔇 Silence (${silenceCount}/5)`);
        
        if (silenceCount >= 5) {
          console.log('👋 Ending conversation due to silence');
          await synthesizeSpeech('またお呼びください。');
          conversationActive = false;
          break;
        }
        continue;
      }
      
      silenceCount = 0;
      console.log(`👤 You: "${transcription}"`);
      
      // 終了チェック
      if (transcription.includes('終了')) {
        console.log('👋 End phrase detected');
        await synthesizeSpeech('終了します。またお呼びください。');
        conversationActive = false;
        break;
      }
      
      // Slack連携チェック
      if (transcription.includes('Slack') && 
          (transcription.includes('繋') || transcription.includes('つな') || transcription.includes('接続'))) {
        await handleSlackConnection();
        continue;
      }
      
      // MCP更新コマンド
      if ((transcription.includes('MCP') || transcription.includes('エムシーピー')) && 
          (transcription.includes('更新') || transcription.includes('リロード'))) {
        console.log('🔄 Manual MCP reload requested');
        const hasSlack = await restartExecutorService();
        if (hasSlack) {
          await synthesizeSpeech('MCPサーバーを更新しました。Slackが使えるようになりました。');
        } else {
          await synthesizeSpeech('MCPサーバーを更新しました。');
        }
        continue;
      }
      
      // Claude Sessionに送信（コンテキスト付き）
      console.log('🤖 Sending to Claude Session...');
      const response = await claudeSession?.sendMessage(transcription) || 'すみません、応答できませんでした。';
      
      // 応答を音声化
      await synthesizeSpeech(response);
      
      // 音声出力が完全に終わるまで待機
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
  } catch (error) {
    console.error('❌ Conversation error:', error);
    await synthesizeSpeech('エラーが発生しました。');
  } finally {
    conversationActive = false;
    // 音声サービス再開
    await voiceService?.startListening();
    isListening = true;
  }
}

// Slack連携処理
async function handleSlackConnection() {
  console.log('🔗 Starting Slack connection...');
  await synthesizeSpeech('Slackの連携ページを開きます。');
  
  // ブラウザでOAuth URLを開く
  const { shell } = require('electron');
  shell.openExternal('https://anicca-proxy-ten.vercel.app/api/slack-oauth');
  
  // 少し待ってから状態確認
  setTimeout(async () => {
    const hasSlack = await reloadMCP();
    if (hasSlack) {
      await synthesizeSpeech('Slackが使えるようになりました。');
    }
  }, 10000);
}

// MCP再読み込み
async function reloadMCP(): Promise<boolean> {
  console.log('🔄 Reloading MCP servers...');
  try {
    await executorService?.updateMCPServers();
  } catch (error) {
    console.error('❌ Error reloading MCP:', error);
    return false;
  }
  const servers = executorService?.getAvailableMCPServers() || [];
  console.log('📋 Available MCP servers:', servers);
  return servers.includes('Slack');
}

/**
 * ExecutorServiceを再起動（MCP更新用）
 */
async function restartExecutorService(): Promise<boolean> {
  console.log('🔄 Restarting ExecutorService...');
  
  // 古いインスタンスをクリーンアップ
  if (executorService) {
    executorService.resetExecutionState();
  }
  
  // 古いセッションもクリーンアップ（ただし履歴は保持）
  if (claudeSession) {
    claudeSession.end();
  }
  
  // 新しいインスタンスを作成
  executorService = new ClaudeExecutorService(database!);
  await executorService.updateMCPServers();
  
  // 新しいClaudeSessionを作成（セッションIDは継続）
  claudeSession = new ClaudeSession(executorService);
  
  console.log('✅ ExecutorService restarted with updated MCP servers');
  
  // 利用可能なMCPサーバーを確認
  const availableMCP = executorService.getAvailableMCPServers();
  if (availableMCP.length > 0) {
    console.log('📋 Available MCP servers:', availableMCP);
    return availableMCP.includes('Slack');
  }
  return false;
}

/**
 * ローカルHTTPSサーバーを起動（プロキシからのSlackトークン受信用）
 */
async function startLocalHttpsServer(): Promise<void> {
  if (localHttpsServer) {
    return; // 既に起動済み
  }
  
  console.log('🚀 Starting local HTTPS server on port 3001...');
  
  const https = require('https');
  
  // 自己署名証明書を読み込み
  let options;
  try {
    options = {
      key: fs.readFileSync('server.key'),
      cert: fs.readFileSync('server.cert')
    };
  } catch (error) {
    console.log('⚠️ 証明書ファイルが見つかりません。HTTP fallbackモードで起動します。');
    // HTTPフォールバック（開発用）
    const http = require('http');
    localHttpsServer = http.createServer(handleHttpRequest);
    localHttpsServer.listen(3001, () => {
      console.log('✅ Local HTTP server listening on http://localhost:3001 (fallback mode)');
    });
    return;
  }
  
  // HTTPSサーバーを作成
  localHttpsServer = https.createServer(options, handleHttpRequest);
  
  localHttpsServer.listen(3001, () => {
    console.log('✅ Local HTTPS server listening on https://localhost:3001');
  });
}

/**
 * HTTPリクエストハンドラー
 */
async function handleHttpRequest(req: any, res: any): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' && req.url === '/slack-token') {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('🎯 Received Slack token!');
        
        // トークンを保存（MCP形式）
        const configDir = path.join(process.env.HOME || '', '.anicca');
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        const encryption = new SimpleEncryption();
        const encryptedToken = await encryption.encrypt(data.token);
        
        // MCP形式の設定
        const mcpConfig = {
          mcpServers: {
            slack: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-slack"],
              env: {
                SLACK_BOT_TOKEN: encryptedToken,  // 暗号化されたBOTトークン
                SLACK_TEAM_ID: data.team?.id || ""
              }
            }
          },
          metadata: {
            team: data.team || {},
            timestamp: Date.now()
          }
        };
        
        fs.writeFileSync(
          path.join(configDir, 'slack-config.json'),
          JSON.stringify(mcpConfig, null, 2)
        );
        
        console.log('✅ Slack token saved');
        
        // ExecutorServiceを再起動してMCPを更新
        const hasSlack = await restartExecutorService();
        if (hasSlack) {
          await synthesizeSpeech('Slackの連携が完了しました。SlackのMCPが使えるようになりました。');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        
      } catch (error) {
        console.error('❌ Error processing token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// 音声合成
async function synthesizeSpeech(text: string): Promise<void> {
  console.log(`🔊 Speaking: "${text}"`);
  
  try {
    // プロキシ経由でTTSを使用
    const proxyUrl = 'https://anicca-proxy-ten.vercel.app/api/tts';
    const languageCode = detectLanguage(text) === 'en' ? 'en-US' : 'ja-JP';
    const voiceName = detectLanguage(text) === 'en' ? 'en-US-Wavenet-F' : 'ja-JP-Wavenet-A';
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        languageCode,
        voiceName,
        ssmlGender: 'FEMALE'
      })
    });
    
    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.audio) {
      // Base64をデコードしてMP3ファイルに保存
      const audioBuffer = Buffer.from(result.audio, 'base64');
      const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
      fs.writeFileSync(tempFile, audioBuffer);
      
      // 再生
      await playAudioFile(tempFile);
      
      // クリーンアップ
      fs.unlinkSync(tempFile);
    } else {
      throw new Error('No audio content in response');
    }
  } catch (error) {
    console.error('❌ TTS error:', error);
    // フォールバック: macOSのsayコマンド
    const { exec } = require('child_process');
    return new Promise<void>((resolve) => {
      exec(`say -v Kyoko "${text}"`, () => resolve());
    });
  }
}

// 言語検出
function detectLanguage(text: string): 'en' | 'ja' {
  const alphaNumeric = text.match(/[a-zA-Z0-9]/g) || [];
  const japanese = text.match(/[ぁ-んァ-ヶー一-龠]/g) || [];
  return alphaNumeric.length / text.length > 0.7 ? 'en' : 'ja';
}

// 音声ファイル再生
async function playAudioFile(filePath: string): Promise<void> {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec(`afplay -v 0.5 "${filePath}"`, resolve);
  });
}

// システム音再生
function playSound(soundName: string) {
  const { exec } = require('child_process');
  exec(`afplay /System/Library/Sounds/${soundName}.aiff`);
}

// 通知表示
function showNotification(title: string, body: string) {
  const { exec } = require('child_process');
  exec(`osascript -e 'display notification "${body}" with title "${title}"'`);
}

// アプリケーションイベント
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  // ウィンドウがなくても終了しない（音声アプリなのでウィンドウは存在しない）
});

app.on('before-quit', async () => {
  console.log('👋 Anicca shutting down...');
  
  // セッションを終了（次回再開のため保存）
  claudeSession?.end();
  
  // クリーンアップ
  voiceService?.stopListening();
  await voiceService?.cleanup();
  await database?.close();
  slackOAuthServer?.stop();
  
  // HTTPSサーバーを停止
  if (localHttpsServer) {
    localHttpsServer.close();
    console.log('🛑 Local HTTPS server stopped');
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