import { PythonShell } from 'python-shell';
import path from 'path';
import { app } from 'electron';

export interface BrowserTaskResult {
  success: boolean;
  data?: any;
  error?: string;
  feedback?: string;
  timestamp: number;
}

export class BrowserUseService {
  private pythonPath: string;
  private scriptPath: string;
  private lastResult: BrowserTaskResult | null = null;

  constructor() {
    // Python実行パスとスクリプトパスの設定
    const isDevelopment = process.env.NODE_ENV === 'development';
    const appPath = isDevelopment ? process.cwd() : app.getAppPath();
    this.pythonPath = path.join(appPath, 'venv', 'bin', 'python3');
    this.scriptPath = path.join(__dirname, 'browser_use_agent.py');
    console.log('🤖 BrowserUseService initialized');
    console.log('📍 Python path:', this.pythonPath);
    console.log('📍 Script path:', this.scriptPath);
  }

  async initialize(): Promise<void> {
    try {
      // Python環境の確認
      const testOptions = {
        mode: 'text' as const,
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'],
        scriptPath: path.dirname(this.scriptPath),
        args: ['--test']
      };

      await PythonShell.run(path.basename(this.scriptPath), testOptions);
      console.log('✅ Browser-use Python environment verified');
    } catch (error) {
      console.error('❌ Failed to initialize BrowserUseService:', error);
      throw error;
    }
  }

  async executeTask(task: string, context?: any): Promise<BrowserTaskResult> {
    try {
      console.log('🎯 Executing browser task:', task);

      const options = {
        mode: 'json' as const,
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'],
        scriptPath: path.dirname(this.scriptPath),
        args: [JSON.stringify({ task, context })]
      };

      const results = await PythonShell.run(path.basename(this.scriptPath), options);
      
      if (results && results.length > 0) {
        const result = results[0] as any;
        this.lastResult = {
          success: result.success,
          data: result.data,
          error: result.error,
          feedback: result.feedback,
          timestamp: Date.now()
        };
        
        console.log('✅ Browser task completed:', this.lastResult);
        return this.lastResult;
      }

      throw new Error('No result returned from browser-use');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Browser task failed:', errorMessage);
      
      this.lastResult = {
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      };
      
      return this.lastResult;
    }
  }

  getLastResult(): BrowserTaskResult | null {
    return this.lastResult;
  }

  // 学習用：エラーパターンを記録
  async recordErrorPattern(task: string, error: string): Promise<void> {
    // 将来的にSQLiteに保存して学習に使用
    console.log('📝 Recording error pattern:', { task, error });
  }
}