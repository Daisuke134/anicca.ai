const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  // 画面のサイズを取得
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // メインウィンドウを作成
  mainWindow = new BrowserWindow({
    width: Math.min(1200, width - 100),
    height: Math.min(800, height - 100),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 開発時のCORS対応
    },
    icon: path.join(__dirname, 'public/icon.png'), // アイコンがあれば
    titleBarStyle: 'default',
    show: false // 初期は非表示
  });

  // サーバーが起動するまで待つ
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.show();
  }, 3000);

  // 開発者ツール（デバッグ用）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  console.log('🚀 Starting ANICCA server...');
  
  // TypeScriptサーバーを起動
  serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  serverProcess.on('error', (error) => {
    console.error('Server error:', error);
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('🛑 Stopping ANICCA server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

// アプリケーションの準備完了
app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 全ウィンドウが閉じられた時
app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーション終了時
app.on('before-quit', () => {
  stopServer();
}); 