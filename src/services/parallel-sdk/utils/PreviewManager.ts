/**
 * PreviewManager - アプリプレビュー管理
 * 実際の実装は後で追加
 */

interface PreviewInfo {
  previewUrl: string;
  appId: string;
}

interface PublishOptions {
  projectName: string;
  taskId: string;
  description?: string;
  workerName: string;
  workerNumber: string;
  userId?: string;
}

class PreviewManager {
  async publishApp(projectPath: string, options: PublishOptions): Promise<PreviewInfo> {
    console.log(`Publishing app from ${projectPath}`, options);
    
    // TODO: 実際のプレビュー公開処理
    return {
      previewUrl: `http://localhost:3000/preview/app-${Date.now()}`,
      appId: `app-${Date.now()}`
    };
  }
}

export const previewManager = new PreviewManager();