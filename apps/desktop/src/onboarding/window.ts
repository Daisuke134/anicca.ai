import { BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { AniccaSessionManager } from '../agents/sessionManager';
import { DesktopAuthService } from '../services/desktopAuthService';
import { applyOnboardingData, OnboardingPayload, loadSettingsFromFiles } from '../services/onboardingWriter';

let onboardingWindow: BrowserWindow | null = null;

export interface LaunchOptions {
  sessionManager: AniccaSessionManager | null;
  authService: DesktopAuthService | null;
  showSettings?: boolean;
}

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow;
}

export function notifyAuthCompleted(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.webContents.send('auth-completed');
  }
}

export async function launchOnboardingUi(options: LaunchOptions): Promise<void> {
  const { sessionManager, authService, showSettings = false } = options;
  
  // 既存ウィンドウがあれば表示
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.show();
    onboardingWindow.focus();
    if (showSettings) {
      onboardingWindow.webContents.send('show-settings');
    }
    return;
  }
  
  // 新規ウィンドウ作成
  onboardingWindow = new BrowserWindow({
    width: 820,
    height: 640,
    show: false,
    title: 'Anicca Setup',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  // IPCハンドラ設定
  setupIpcHandlers(sessionManager, authService);
  
  // HTML読み込み（Quasarビルド済みファイル）
  const htmlPath = path.join(__dirname, '../ui/index.html');
  if (showSettings) {
    // URLパラメータで設定画面を指定
    const fileUrl = `file://${htmlPath}?settings=true`;
    await onboardingWindow.loadURL(fileUrl);
  } else {
    await onboardingWindow.loadFile(htmlPath);
  }
  
  // ウィンドウ表示
  onboardingWindow.show();
  onboardingWindow.focus();
  
  // 設定画面を直接表示する場合
  if (showSettings) {
    // URLパラメータで既に設定画面が表示されるので、ここではデータ読み込みのみ
    onboardingWindow.webContents.once('did-finish-load', () => {
      onboardingWindow?.webContents.executeJavaScript('loadSettingsData()').catch(() => {});
    });
  }
  
  // ウィンドウ閉じた時の処理
  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
  
  console.log('✅ Onboarding window created');
}

function setupIpcHandlers(
  sessionManager: AniccaSessionManager | null,
  authService: DesktopAuthService | null
): void {
  // 既存ハンドラを削除（重複防止）
  ipcMain.removeAllListeners('onboarding:save');
  ipcMain.removeAllListeners('onboarding:load-settings');
  ipcMain.removeAllListeners('onboarding:google-oauth');
  ipcMain.removeAllListeners('onboarding:complete');
  ipcMain.removeAllListeners('onboarding:close');
  
  // 設定データ読み込み
  ipcMain.handle('onboarding:load-settings', async () => {
    try {
      const settings = await loadSettingsFromFiles();
      return { success: true, data: settings };
    } catch (error: any) {
      console.error('Failed to load settings:', error);
      return { success: false, error: error.message };
    }
  });

  // オンボーディングデータ保存
  ipcMain.handle('onboarding:save', async (_event, payload: OnboardingPayload) => {
    try {
      await applyOnboardingData(payload);
      if (sessionManager) {
        sessionManager.setOnboardingState('idle');
      }
      return { success: true };
    } catch (error: any) {
      console.error('Failed to save onboarding data:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Google OAuth起動
  ipcMain.handle('onboarding:google-oauth', async () => {
    try {
      if (!authService) {
        throw new Error('Auth service not initialized');
      }
      const oauthUrl = await authService.getGoogleOAuthUrl();
      shell.openExternal(oauthUrl);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to launch Google OAuth:', error);
      return { success: false, error: error.message };
    }
  });
  
  // 完了（設定画面へ遷移）
  ipcMain.handle('onboarding:complete', () => {
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.webContents.send('show-settings');
    }
    return { success: true };
  });
  
  // ウィンドウを閉じる（hide）
  ipcMain.handle('onboarding:close', () => {
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.hide();
    }
    return { success: true };
  });
}

