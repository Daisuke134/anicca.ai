import { app, BrowserWindow, ipcMain, screen, Notification } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
// import { ScreenCaptureService } from './services/screenCapture'; // 音声版では不要
import { ClaudeExecutorService } from './services/claudeExecutorService';
import { SQLiteDatabase } from './services/sqliteDatabase';
import { EncryptionService } from './services/encryptionService';
import { AudioService } from './services/audioService';

// 環境変数を読み込み（パッケージ化対応）
const envPath = app.isPackaged 
  ? path.join(process.resourcesPath, 'app.asar', 'dist', '.env')
  : path.join(__dirname, '.env');
dotenv.config({ path: envPath });


let mainWindow: BrowserWindow | null = null;
let sdkLogWindow: BrowserWindow | null = null;
// let screenCapture: ScreenCaptureService; // 音声版では不要
let claudeExecutor: ClaudeExecutorService;
let database: SQLiteDatabase;
let encryptionService: EncryptionService;
let audioService: AudioService; // 音声処理サービス
let currentLanguage = 'ja'; // デフォルト言語

// ログバッファ（SDK Logsウィンドウが開く前のログを保存）
const logBuffer: Array<{
  type: 'system' | 'error' | 'assistant' | 'user' | 'result' | 'tool';
  content: string;
  timestamp: number;
}> = [];

// macOSの通知を有効にするためにアプリケーションIDを設定
if (process.platform === 'darwin') {
  app.setAppUserModelId('com.anicca.agi');
}

// メインプロセスのconsole.logをインターセプトしてSDK Logsウィンドウに転送
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  originalConsoleLog.apply(console, args);
  
  const logMessage = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const logEntry = {
    type: 'system' as const,
    content: `[Main Process] ${logMessage}`,
    timestamp: Date.now()
  };
  
  // SDK Logsウィンドウが開いている場合は転送
  if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
    sdkLogWindow.webContents.send('sdk-log', logEntry);
  } else {
    // ウィンドウがまだない場合はバッファに保存
    logBuffer.push(logEntry);
  }
};

console.error = (...args: any[]) => {
  originalConsoleError.apply(console, args);
  
  const logMessage = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const logEntry = {
    type: 'error' as const,
    content: `[Main Process Error] ${logMessage}`,
    timestamp: Date.now()
  };
  
  if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
    sdkLogWindow.webContents.send('sdk-log', logEntry);
  } else {
    // ウィンドウがまだない場合はバッファに保存
    logBuffer.push(logEntry);
  }
};

console.warn = (...args: any[]) => {
  originalConsoleWarn.apply(console, args);
  
  const logMessage = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  
  const logEntry = {
    type: 'system' as const,
    content: `[Main Process Warning] ${logMessage}`,
    timestamp: Date.now()
  };
  
  if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
    sdkLogWindow.webContents.send('sdk-log', logEntry);
  } else {
    // ウィンドウがまだない場合はバッファに保存
    logBuffer.push(logEntry);
  }
};

async function createWindow() {
  // 画面のサイズを取得
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // メインウィンドウを作成
  mainWindow = new BrowserWindow({
    width: Math.min(1200, width - 100),
    height: Math.min(800, height - 100),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // preloadスクリプト
      webSecurity: false // 開発時のみ
    },
    titleBarStyle: 'default',
    show: false
  });

  // HTMLファイルを読み込み
  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));
  
  // ウィンドウ準備完了後に表示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 開発者ツール（開発時のみ）- 自動表示を無効化
  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools();
  // }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // メインウィンドウが閉じられたらSDKログウィンドウも閉じる
    if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
      sdkLogWindow.close();
    }
  });
}

// Claude SDK専用ログウィンドウを作成
function createSDKLogWindow() {
  if (!mainWindow) return;
  
  const mainBounds = mainWindow.getBounds();
  
  sdkLogWindow = new BrowserWindow({
    width: 600,
    height: 800,
    x: mainBounds.x + mainBounds.width + 10,
    y: mainBounds.y,
    title: 'Claude SDK Logs',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    parent: mainWindow,
    minimizable: true,
    maximizable: true,
    closable: true
  });

  // SDKログ用のHTMLを読み込み
  sdkLogWindow.loadFile(path.join(__dirname, 'ui/sdk-logs.html'));
  
  // ウィンドウのコンテンツが読み込まれたら、バッファリングされたログを送信
  sdkLogWindow.webContents.once('did-finish-load', () => {
    console.log(`📋 Sending ${logBuffer.length} buffered logs to SDK Logs window`);
    
    // バッファに保存されたログを順番に送信
    logBuffer.forEach(logEntry => {
      if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
        sdkLogWindow.webContents.send('sdk-log', logEntry);
      }
    });
    
    // バッファをクリア
    logBuffer.length = 0;
  });
  
  sdkLogWindow.on('closed', () => {
    sdkLogWindow = null;
  });
}

async function initializeServices() {
  try {
    console.log('🔧 Initializing ANICCA services...');
    
    // プロキシサーバーを使用するためAPIキーは不要
    console.log('🌐 Using external proxy server for API requests');

    // データベースサービスの初期化
    console.log('🗄️ Using SQLite database');
    database = new SQLiteDatabase();
    
    try {
      await database.init();
    } catch (dbError) {
      console.error('❌ Database initialization failed:', dbError);
      const { dialog } = require('electron');
      await dialog.showErrorBox(
        'Database Error', 
        `Failed to initialize database: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      );
      return;
    }
    
    // 言語設定の復元（SQLiteの場合のみ）
    if (database instanceof SQLiteDatabase) {
      const savedLanguage = await database.getSetting('language');
      if (savedLanguage) {
        currentLanguage = savedLanguage;
        console.log('🌍 Language restored from SQLite:', currentLanguage);
      } else {
        // 初回起動時にデフォルト言語を保存
        await database.setSetting('language', currentLanguage);
        console.log('🌍 Default language saved to SQLite:', currentLanguage);
      }
    }
    
    // スクリーンキャプチャの間隔を設定から取得（デフォルト8秒）
    let captureInterval = 8000;
    if (database instanceof SQLiteDatabase) {
      const savedInterval = await database.getSetting('captureInterval');
      if (savedInterval) {
        captureInterval = parseInt(savedInterval, 10);
        console.log('⏱️ Capture interval restored from SQLite:', captureInterval + 'ms');
      } else {
        // 初回起動時にデフォルト値を保存
        await database.setSetting('captureInterval', String(captureInterval));
        console.log('⏱️ Default capture interval saved to SQLite:', captureInterval + 'ms');
      }
    }
    
    // screenCapture = new ScreenCaptureService(captureInterval); // 音声版では不要
    
    // EncryptionServiceの初期化（最初に必要）
    encryptionService = new EncryptionService();
    
    
    
    // ExecutorServiceの初期化
    console.log('🔧 Initializing ClaudeExecutorService...');
    claudeExecutor = new ClaudeExecutorService(database);
    
    // SDKログイベントをリッスン
    claudeExecutor.on('sdk-log', (logData) => {
      if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
        sdkLogWindow.webContents.send('sdk-log', logData);
      } else {
        logBuffer.push(logData);
      }
    });
    
    // デフォルトMCPサーバーをセットアップ
    await claudeExecutor.setupDefaultMCPServers();
    
    console.log('✨ ClaudeExecutorService initialized');
    
    
    // Exa MCPは無効化済み（パフォーマンス向上のため）
    
    console.log('✅ All services initialized successfully');
    
    // スクリーンキャプチャのイベントリスナー設定
    setupScreenCaptureEvents();
    
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    const { dialog } = require('electron');
    await dialog.showErrorBox(
      'Initialization Error',
      `Failed to initialize ANICCA: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Electron標準通知を表示（作業を邪魔しない）
function showCustomNotification(message: string) {
  // 通知がサポートされているか確認
  if (!Notification.isSupported()) {
    console.error('❌ Notifications are not supported on this system');
    return;
  }
  
  // アイコンパスを設定
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'assets', 'icon.png')
    : path.join(__dirname, '../assets/icon.png');
  
  // Electron標準通知を作成
  const notification = new Notification({
    title: '🤖 ANICCA',
    body: message,
    icon: iconPath,
    silent: false, // 通知音を鳴らす
    timeoutType: 'default' // OSのデフォルト表示時間（5-10秒）
  });
  
  // クリックイベントハンドラー
  notification.on('click', () => {
    console.log('🔔 Notification clicked');
    
    // メインウィンドウをフォーカス（オプション）
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // 通知を表示
  notification.show();
  
  console.log('📱 Electron notification shown:', message);
}

function setupScreenCaptureEvents() {
  screenCapture.on('frame', async (frame) => {
    try {
      console.log('📸 Frame captured');
      
      // ExecutorServiceのチェック
      if (!claudeExecutor) {
        console.error('❌ ClaudeExecutor not initialized, skipping frame');
        return;
      }
      
      // 使用量制限チェック（SQLiteの場合のみ）
      if (database instanceof SQLiteDatabase) {
        const limitCheck = await database.checkDailyLimit(1000); // 1日1000回制限
        
        if (!limitCheck.allowed) {
          console.log(`🚫 Daily limit reached: ${limitCheck.usage}/1000 requests used today`);
          
          // 制限到達メッセージをレンダラープロセスに送信
          mainWindow?.webContents.send('daily-limit-reached', {
            usage: limitCheck.usage,
            limit: 1000,
            resetTime: '明日の0時'
          });
          
          return; // APIリクエストをスキップ
        }
        
        // 使用量をインクリメント
        const newUsage = await database.incrementTodayUsage();
        console.log(`📊 API usage: ${newUsage}/1000 requests today`);
        
        // 使用量をレンダラープロセスに送信
        mainWindow?.webContents.send('usage-update', {
          usage: newUsage,
          limit: 1000,
          remaining: limitCheck.remaining - 1
        });
      }
      
      // 画面分析機能は削除されました
      // ExecutorServiceは音声コマンドまたは直接的なアクション要求のみを処理します
      console.log('📸 Screen capture received, but automatic analysis is disabled');
      
      // フレームデータをレンダラープロセスに送信（表示用）
      mainWindow?.webContents.send('frame-captured', {
        timestamp: frame.timestamp,
        message: 'Screen captured successfully'
      });
      
    } catch (error) {
      console.error('❌ Error processing frame:', error);
      // 413エラーの場合はUIに通知しない（コンソールログのみ）
      if (error instanceof Error && error.message.includes('413')) {
        console.log('⏭️ Skipping UI notification for 413 error');
      } else {
        mainWindow?.webContents.send('error', { 
          message: 'フレーム処理中にエラーが発生しました',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });

  screenCapture.on('error', (error: Error) => {
    console.error('❌ Screen capture error:', error);
    if (mainWindow) {
      mainWindow.webContents.send('error', { 
        message: 'スクリーンキャプチャエラー',
        error: error.message 
      });
    }
  });
}

// IPC通信ハンドラー
function setupIpcHandlers() {
  // 言語設定
  ipcMain.handle('set-language', async (_, language: string) => {
    try {
      currentLanguage = language || 'ja';
      console.log('🌍 Language set to:', currentLanguage);
      
      // SQLiteに言語設定を永続化
      if (database instanceof SQLiteDatabase) {
        await database.setSetting('language', currentLanguage);
        console.log('🌍 Language setting persisted to SQLite');
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error setting language:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // 実況開始
  ipcMain.handle('start-narration', async () => {
    try {
      console.log('🚀 Starting anicca narration...');
      await screenCapture.startCapture();
      
      return { 
        success: true,
        message: 'anicca AGI実況システムが開始されました',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Error starting narration:', error);
      return {
        success: false,
        message: '実況開始に失敗しました',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 実況停止
  ipcMain.handle('stop-narration', async () => {
    try {
      console.log('⏹️ Stopping narration...');
      screenCapture.stopCapture();
      
      // ハイライト更新は削除済み
      
      return {
        success: true,
        message: 'anicca実況システムが停止されました',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Error stopping narration:', error);
      return {
        success: false,
        message: '実況停止に失敗しました',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 状態取得
  ipcMain.handle('get-state', async () => {
    return {
      executor: claudeExecutor.getCurrentState()
    };
  });

  // 健康状態チェック
  ipcMain.handle('get-health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      services: {
        screenCapture: screenCapture.isActive(),
        claude: 'ready'
      }
    };
  });

  // 観察データ取得
  ipcMain.handle('get-observations', async (_, date: string) => {
    try {
      // 日付形式の検証
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }
      
      const observations = await database.getObservationsByDate(date);
      
      return {
        success: true,
        date,
        count: observations.length,
        observations: observations.map(obs => ({
          id: obs.id,
          timestamp: obs.timestamp,
          hour: obs.hour,
          commentary: obs.commentary,
          websiteName: obs.website_name,
          actionCategory: obs.action_category,
          prediction: obs.prediction_data,
          verification: obs.verification_data,
          understanding: obs.current_understanding
        }))
      };
    } catch (error) {
      console.error('❌ Error fetching observations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 最近の観察データ取得
  ipcMain.handle('get-recent-observations', async (_, limit: number = 10) => {
    try {
      const observations = await database.getRecentObservations(limit);
      
      return {
        success: true,
        count: observations.length,
        observations
      };
    } catch (error) {
      console.error('❌ Error fetching recent observations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Daily View用データ取得
  ipcMain.handle('get-daily-data', async (_, date: string) => {
    try {
      // 日付形式の検証
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }
      
      console.log(`📅 Fetching daily data for ${date}...`);
      
      // その日の観察データを取得
      const observations = await database.getObservationsByDate(date);
      
      // Daily View用のフォーマットに変換
      const commentary = observations.map(obs => ({
        id: obs.id,
        timestamp: obs.timestamp,
        commentary_text: obs.commentary,
        understanding_text: obs.current_understanding,
        website: obs.website_name,
        action_category: obs.action_category,
        prediction_verification: obs.verification_data ? {
          previous_prediction: obs.verification_data.previous_prediction,
          actual_action: obs.verification_data.actual_action,
          accuracy: obs.verification_data.accuracy,
          reasoning: obs.verification_data.reasoning
        } : null
      }));
      
      return {
        success: true,
        date,
        commentary,
        totalObservations: observations.length,
        firstObservation: observations.length > 0 ? observations[0].timestamp : null,
        lastObservation: observations.length > 0 ? observations[observations.length - 1].timestamp : null
      };
    } catch (error) {
      console.error('❌ Error fetching daily data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 設定値取得
  ipcMain.handle('get-setting', async (_, key: string) => {
    try {
      // SQLiteを使用している場合はデータベースから取得
      if (database instanceof SQLiteDatabase) {
        const value = await database.getSetting(key);
        console.log(`⚙️ Setting retrieved from SQLite: ${key} = ${value}`);
        return value;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error getting setting:', error);
      return null;
    }
  });

  // 設定値保存
  ipcMain.handle('set-setting', async (_, key: string, value: any) => {
    try {
      // SQLiteを使用している場合はデータベースに保存
      if (database instanceof SQLiteDatabase) {
        await database.setSetting(key, String(value));
        console.log(`⚙️ Setting saved to SQLite: ${key} = ${value}`);
        
        // 言語設定の場合はメモリも更新
        if (key === 'language') {
          currentLanguage = value || 'ja';
          console.log('🌍 Current language updated:', currentLanguage);
        }
        
        return { success: true };
      }
      
      return { success: false, error: 'SQLite database required' };
    } catch (error) {
      console.error('❌ Error setting value:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 現在の理解度取得
  ipcMain.handle('get-current-understanding', async () => {
    try {
      let currentUnderstanding;
      
      // データベースから最新の理解を取得
      console.log('🧠 Getting understanding from database...');
      const latestUnderstanding = await database.getLatestUnderstanding();
      if (latestUnderstanding) {
        currentUnderstanding = latestUnderstanding;
        console.log('🧠 Latest understanding retrieved from database');
      }
      
      return currentUnderstanding || '画面を分析して、あなたの活動を理解中です...';
    } catch (error) {
      console.error('❌ Error getting current understanding:', error);
      return '画面を分析して、あなたの活動を理解中です...';
    }
  });


  // 全設定取得（Daily Viewなどで使用）
  ipcMain.handle('get-all-settings', async () => {
    try {
      const settings: Record<string, any> = {};
      
      if (database instanceof SQLiteDatabase) {
        // SQLiteから全設定を取得（将来の拡張のため）
        settings.language = await database.getSetting('language') || 'ja';
        // 他の設定項目もここで取得可能
        // settings.theme = await database.getSetting('theme') || 'light';
        // settings.notifications = await database.getSetting('notifications') || 'true';
      }
      
      console.log('⚙️ All settings retrieved:', settings);
      return { success: true, settings };
    } catch (error) {
      console.error('❌ Error getting all settings:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 複数設定一括保存
  ipcMain.handle('set-multiple-settings', async (_, settingsObject: Record<string, any>) => {
    try {
      let updatedCount = 0;
      
      if (database instanceof SQLiteDatabase) {
        // SQLiteに一括保存
        for (const [key, value] of Object.entries(settingsObject)) {
          await database.setSetting(key, String(value));
          updatedCount++;
          
          // 特別な処理が必要な設定
          if (key === 'language') {
            currentLanguage = value || 'ja';
            console.log('🌍 Current language updated:', currentLanguage);
          }
        }
      }
      
      console.log(`⚙️ ${updatedCount} settings saved successfully`);
      return { success: true, updatedCount };
    } catch (error) {
      console.error('❌ Error setting multiple values:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ハイライト取得ハンドラー
  ipcMain.handle('get-highlights', async (_, period: string, targetDate: string) => {
    try {
      // Highlights機能は削除済み
      console.log('⚠️ Highlights feature has been removed');
      const highlights: any[] = [];
      console.log(`🌟 Retrieved ${highlights.length} highlights for ${period}/${targetDate}`);
      return {
        success: true,
        highlights
      };
    } catch (error) {
      console.error('❌ Error getting highlights:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        highlights: []
      };
    }
  });

  // Model handler (統合モードのみ)
  ipcMain.handle('set-model', async (_, modelName: string) => {
    try {
      // 統合モードではモデル変更は現在サポートされていない
      console.log('⚠️ Model switching not supported in unified mode');
      return {
        success: true
      };
    } catch (error) {
      console.error('❌ Error setting model:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // SDK Log handlers
  ipcMain.handle('open-sdk-logs', async () => {
    try {
      if (!sdkLogWindow || sdkLogWindow.isDestroyed()) {
        createSDKLogWindow();
        
        // SDK Logsウィンドウが準備できたら、起動メッセージを送信
        setTimeout(() => {
          if (sdkLogWindow && !sdkLogWindow.isDestroyed()) {
            sdkLogWindow.webContents.send('sdk-log', {
              type: 'system',
              content: '[Main Process] SDK Logs window opened - メインプロセスのログが表示されます',
              timestamp: Date.now()
            });
            
            // 重要な初期化ログを再送信
            sdkLogWindow.webContents.send('sdk-log', {
              type: 'system',
              content: '[Main Process] 📊 ANICCA services status check...',
              timestamp: Date.now()
            });
          }
        }, 500);
      } else {
        sdkLogWindow.focus();
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Error opening SDK log window:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // MCP handlers
  ipcMain.handle('mcp-set-exa-key', async (_, apiKey: string) => {
    try {
      await encryptionService.saveExaApiKey(apiKey);
      return { success: true };
    } catch (error) {
      console.error('❌ Error setting Exa API key:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // MCP handlers are removed since the service has been deleted
  ipcMain.handle('mcp-connect-exa', async () => {
    return { 
      success: false, 
      error: 'MCP service has been removed' 
    };
  });

  ipcMain.handle('mcp-search-web', async () => {
    return { 
      success: false, 
      error: 'MCP service has been removed' 
    };
  });

  ipcMain.handle('mcp-list-tools', async () => {
    return { 
      success: false, 
      error: 'MCP service has been removed' 
    };
  });

  ipcMain.handle('mcp-disconnect', async () => {
    return { success: true };
  });

  // User Profile handlers
  ipcMain.handle('get-user-profile', async () => {
    try {
      if (database instanceof SQLiteDatabase) {
        const profile = await database.getUserProfile();
        return {
          success: true,
          profile
        };
      }
      return {
        success: false,
        error: 'Database not available'
      };
    } catch (error) {
      console.error('❌ Error getting user profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('save-user-profile', async (_, profile: {
    emailBehavior: string;
    docsBehavior: string;
    youtubeLimit: string;
    workStyle: string;
    goals: string;
    gmailAddress: string;
    gmailPassword: string;
  }) => {
    try {
      if (database instanceof SQLiteDatabase) {
        await database.saveUserProfile(profile);
        console.log('👤 User profile saved successfully');
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Database not available'
      };
    } catch (error) {
      console.error('❌ Error saving user profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });


  console.log('🔗 IPC handlers registered');
}

// アプリケーション初期化
app.whenReady().then(async () => {
  try {
    await initializeServices();
    setupIpcHandlers();
    await createWindow();
    
    // 初期状態をレンダラーに送信
    setTimeout(async () => {
      try {
        const currentUnderstanding = await database.getLatestUnderstanding();
        if (currentUnderstanding) {
          mainWindow?.webContents.send('understanding-update', {
            understanding: currentUnderstanding
          });
        }
      } catch (error) {
        console.error('❌ Error getting initial understanding:', error);
      }
    }, 1000);
    
    console.log('🎉 ANICCA application ready!');
  } catch (error) {
    console.error('❌ Application initialization failed:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// アプリケーション終了時のクリーンアップ
app.on('before-quit', () => {
  if (screenCapture) {
    screenCapture.stopCapture();
  }
  console.log('🛑 ANICCA application shutting down...');
}); 