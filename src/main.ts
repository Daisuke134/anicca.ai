import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { ScreenCaptureService } from './services/screenCapture';
import { GeminiRestService } from './services/geminiRest';
import { GeminiRestProxyService } from './services/geminiRestProxy';
import { DatabaseService, DatabaseInterface } from './services/database';
import { SQLiteDatabase } from './services/sqliteDatabase';
import { HighlightsManager } from './services/highlightsManager';

// 環境変数を読み込み（パッケージ化対応）
const envPath = app.isPackaged 
  ? path.join(process.resourcesPath, 'app.asar', 'dist', '.env')
  : path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// フォールバック: 複数の場所から.envを試行
if (!process.env.GOOGLE_API_KEY) {
  const fallbackPaths = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(app.getAppPath(), 'dist', '.env')
  ];
  
  for (const envPath of fallbackPaths) {
    console.log('🔍 Trying .env path:', envPath);
    dotenv.config({ path: envPath });
    if (process.env.GOOGLE_API_KEY) {
      console.log('✅ Found .env at:', envPath);
      break;
    }
  }
}

// プロキシモードの設定（APIキーを隠蔽）
const USE_PROXY = process.env.USE_PROXY !== 'false'; // デフォルトはプロキシモードを使用

// 埋め込みAPIキー（レガシーモード用）
const EMBEDDED_GEMINI_KEY = "AIzaSyALn2yS9h6GlR6weep2-ctEkMva0uP-je8";

let mainWindow: BrowserWindow | null = null;
let screenCapture: ScreenCaptureService;
let geminiService: GeminiRestService | GeminiRestProxyService;
let database: DatabaseInterface;
let highlightsManager: HighlightsManager;
let currentLanguage = 'ja'; // デフォルト言語

// データベースタイプの選択
// 注意: Supabaseサポートは将来のバージョンで削除予定です
// SQLiteモードの使用を強く推奨します
const USE_SQLITE = process.env.USE_SQLITE === 'true' || process.env.USE_SQLITE === undefined; // デフォルトはSQLite

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

  // 開発者ツール（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  try {
    console.log('🔧 Initializing ANICCA services...');
    
    // APIキーの取得（環境変数 → 埋め込みキーの順）
    const apiKey = process.env.GOOGLE_API_KEY || EMBEDDED_GEMINI_KEY;
    
    if (!apiKey || apiKey === "YOUR_ACTUAL_GEMINI_API_KEY_HERE") {
      console.error('❌ No valid API key found');
      console.error('Please set GOOGLE_API_KEY environment variable or update embedded key');
      
      // エラーダイアログ表示
      const { dialog } = require('electron');
      await dialog.showErrorBox(
        'Configuration Error',
        'No valid Gemini API key found.\n\nPlease contact the developer or set GOOGLE_API_KEY environment variable.'
      );
      return; // 初期化を停止するが、アプリは終了しない
    }
    
    // プロキシモードの選択
    if (USE_PROXY) {
      console.log('🔐 Using proxy mode (API key hidden on server)');
    } else {
      console.log('🔑 API Key loaded:', apiKey.substring(0, 10) + '...');
      console.log('🔑 Source:', process.env.GOOGLE_API_KEY ? 'Environment Variable' : 'Embedded Key');
    }

    // データベースサービスの初期化
    if (USE_SQLITE) {
      console.log('🗄️ Using SQLite database');
      database = new SQLiteDatabase();
    } else {
      console.log('☁️ Using Supabase database');
      database = new DatabaseService();
    }
    
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
    if (USE_SQLITE && database instanceof SQLiteDatabase) {
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
    
    screenCapture = new ScreenCaptureService(8000); // 8秒間隔
    
    // Geminiサービスの初期化（プロキシモードまたは直接モード）
    if (USE_PROXY) {
      geminiService = new GeminiRestProxyService(database as any);
    } else {
      geminiService = new GeminiRestService(apiKey, database as any);
    }
    
    highlightsManager = new HighlightsManager(database as any, geminiService as any);

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

function setupScreenCaptureEvents() {
  screenCapture.on('frame', async (frame) => {
    try {
      console.log('📸 Frame captured, analyzing with anicca...');
      
      // geminiServiceが初期化されているかチェック
      if (!geminiService) {
        console.error('❌ GeminiService not initialized, skipping analysis');
        return;
      }
      
      // 使用量制限チェック（SQLiteの場合のみ）
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
        const limitCheck = await database.checkDailyLimit(50); // 1日50回制限
        
        if (!limitCheck.allowed) {
          console.log(`🚫 Daily limit reached: ${limitCheck.usage}/50 requests used today`);
          
          // 制限到達メッセージをレンダラープロセスに送信
          mainWindow?.webContents.send('daily-limit-reached', {
            usage: limitCheck.usage,
            limit: 50,
            resetTime: '明日の0時'
          });
          
          return; // APIリクエストをスキップ
        }
        
        // 使用量をインクリメント
        const newUsage = await database.incrementTodayUsage();
        console.log(`📊 API usage: ${newUsage}/50 requests today`);
        
        // 使用量をレンダラープロセスに送信
        mainWindow?.webContents.send('usage-update', {
          usage: newUsage,
          limit: 50,
          remaining: limitCheck.remaining - 1
        });
      }
      
      // Gemini APIで分析
      const commentary = await geminiService.analyzeScreen(frame, currentLanguage);
      
      // レンダラープロセスに送信
      mainWindow?.webContents.send('commentary', {
        ...commentary,
        timestamp: Date.now(),
        frameTimestamp: frame.timestamp
      });
      
      console.log('💬 Commentary sent:', commentary.commentary.substring(0, 100) + '...');
      
    } catch (error) {
      console.error('❌ Error processing frame:', error);
      mainWindow?.webContents.send('error', { 
        message: 'フレーム処理中にエラーが発生しました',
        error: error instanceof Error ? error.message : String(error)
      });
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
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
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
      
      // ハイライト更新（バックグラウンド）
      highlightsManager.updateAllHighlights(currentLanguage).catch(err => {
        console.error('❌ Error updating highlights after stop:', err);
      });
      
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
    return geminiService.getCurrentState();
  });

  // 健康状態チェック
  ipcMain.handle('get-health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      services: {
        screenCapture: screenCapture.isActive(),
        gemini: 'ready'
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
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
        const value = await database.getSetting(key);
        console.log(`⚙️ Setting retrieved from SQLite: ${key} = ${value}`);
        return value;
      }
      
      // Supabaseの場合は従来の方法（現在は言語のみメモリから）
      if (key === 'language') {
        return currentLanguage;
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
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
        await database.setSetting(key, String(value));
        console.log(`⚙️ Setting saved to SQLite: ${key} = ${value}`);
        
        // 言語設定の場合はメモリも更新
        if (key === 'language') {
          currentLanguage = value || 'ja';
          console.log('🌍 Current language updated:', currentLanguage);
        }
        
        return { success: true };
      }
      
      // Supabaseの場合は従来の方法
      if (key === 'language') {
        currentLanguage = value || 'ja';
        console.log('🌍 Language setting updated to:', currentLanguage);
        return { success: true };
      }
      
      return { success: false, error: 'Unknown setting key' };
    } catch (error) {
      console.error('❌ Error setting value:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // 現在の理解度取得
  ipcMain.handle('get-current-understanding', async () => {
    try {
      // まずGeminiサービスから取得
      const state = geminiService.getCurrentState();
      let currentUnderstanding = state.currentUnderstanding;
      
      // デフォルトメッセージの場合、データベースから最新の理解を試行
      if (!currentUnderstanding || currentUnderstanding === '画面を分析して、あなたの活動を理解中です...' || currentUnderstanding === 'ユーザーの行動パターンを学習中です。') {
        console.log('🧠 Getting understanding from database...');
        const latestUnderstanding = await database.getLatestUnderstanding();
        if (latestUnderstanding) {
          currentUnderstanding = latestUnderstanding;
          console.log('🧠 Latest understanding retrieved from database');
        }
      }
      
      return currentUnderstanding || '画面を分析して、あなたの活動を理解中です...';
    } catch (error) {
      console.error('❌ Error getting current understanding:', error);
      return '画面を分析して、あなたの活動を理解中です...';
    }
  });

  // 予測精度統計取得
  ipcMain.handle('get-prediction-stats', async () => {
    try {
      // データベースから全ての予測データを取得
      const observations = await database.getRecentObservations(1000); // 直近1000件
      
      const predictions = observations.filter(obs => 
        obs.verification_data && obs.verification_data.accuracy !== null
      );
      
      const totalPredictions = predictions.length;
      const correctPredictions = predictions.filter(pred => 
        pred.verification_data.accuracy === true
      ).length;
      
      const accuracy = totalPredictions > 0 
        ? Math.round((correctPredictions / totalPredictions) * 100)
        : 0;
      
      return {
        totalPredictions,
        correctPredictions,
        accuracy
      };
    } catch (error) {
      console.error('❌ Error getting prediction stats:', error);
      return {
        totalPredictions: 0,
        correctPredictions: 0,
        accuracy: 0
      };
    }
  });

  // 全設定取得（Daily Viewなどで使用）
  ipcMain.handle('get-all-settings', async () => {
    try {
      const settings: Record<string, any> = {};
      
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
        // SQLiteから全設定を取得（将来の拡張のため）
        settings.language = await database.getSetting('language') || 'ja';
        // 他の設定項目もここで取得可能
        // settings.theme = await database.getSetting('theme') || 'light';
        // settings.notifications = await database.getSetting('notifications') || 'true';
      } else {
        // Supabaseの場合
        settings.language = currentLanguage;
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
      
      if (USE_SQLITE && database instanceof SQLiteDatabase) {
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
      } else {
        // Supabaseの場合（現在は言語のみ）
        if (settingsObject.language) {
          currentLanguage = settingsObject.language || 'ja';
          updatedCount = 1;
        }
      }
      
      console.log(`⚙️ ${updatedCount} settings saved successfully`);
      return { success: true, updatedCount };
    } catch (error) {
      console.error('❌ Error setting multiple values:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
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
    setTimeout(() => {
      const state = geminiService.getCurrentState();
      mainWindow?.webContents.send('understanding-update', {
        understanding: state.currentUnderstanding
      });
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