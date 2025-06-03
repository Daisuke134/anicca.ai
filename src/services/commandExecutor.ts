import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface Command {
  type: 'close_tab' | 'navigate' | 'type_text' | 'click';
  target: string;
  value?: string;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  timestamp: number;
  command: Command;
}

export class CommandExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private lastExecutionResult: ExecutionResult | null = null;

  constructor() {
    console.log('🤖 CommandExecutor initialized');
  }

  async initialize(): Promise<void> {
    try {
      // ユーザーのChromeプロファイルパスを取得
      const userHome = process.env.HOME || process.env.USERPROFILE || '';
      const chromeProfilePath = `${userHome}/Library/Application Support/Google/Chrome/Default`;
      
      console.log('🔍 Using Chrome profile:', chromeProfilePath);
      
      // ユーザープロファイルを使用してブラウザを起動
      this.context = await chromium.launchPersistentContext(chromeProfilePath, {
        headless: false, // UIを表示
        channel: 'chrome', // システムのChromeを使用
        viewport: null, // デフォルトのビューポートを使用
        ignoreDefaultArgs: ['--enable-automation'], // 自動化の警告を無効化
        args: [
          '--disable-blink-features=AutomationControlled', // 自動化検出を無効化
          '--disable-features=VizDisplayCompositor', // セキュリティ警告を軽減
          '--disable-web-security', // ウェブセキュリティを一部無効化（ローカル開発用）
          '--disable-site-isolation-trials', // サイト分離を無効化
          '--no-sandbox', // サンドボックスを無効化（ログイン問題解決）
          '--disable-dev-shm-usage', // メモリ問題を解決
          '--disable-background-timer-throttling', // バックグラウンド処理改善
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      });
      
      // contextから最初のページを取得（または新規作成）
      const pages = this.context.pages();
      if (pages.length === 0) {
        await this.context.newPage();
      }
      
      console.log('✅ Browser with user profile established');
    } catch (error) {
      console.error('❌ Failed to initialize browser:', error);
      throw error;
    }
  }

  async execute(command: Command): Promise<ExecutionResult> {
    console.log('🎯 Executing command:', command);
    
    const startTime = Date.now();
    
    try {
      switch (command.type) {
        case 'close_tab':
          await this.closeTab(command.target);
          break;
        
        case 'navigate':
          await this.navigate(command.target);
          break;
        
        case 'type_text':
          await this.typeText(command.target, command.value || '');
          break;
        
        case 'click':
          await this.click(command.target);
          break;
        
        default:
          throw new Error(`Unsupported command type: ${command.type}`);
      }
      
      const result: ExecutionResult = {
        success: true,
        timestamp: Date.now(),
        command
      };
      
      this.lastExecutionResult = result;
      console.log('✅ Command executed successfully');
      return result;
      
    } catch (error) {
      const result: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        command
      };
      
      this.lastExecutionResult = result;
      console.error('❌ Command execution failed:', error);
      return result;
    }
  }

  private async closeTab(targetUrl: string): Promise<void> {
    if (!this.context) throw new Error('Browser not initialized');
    
    const pages = this.context.pages();
    
    // 入力を小文字に変換して比較
    const targetLower = targetUrl.toLowerCase();
    
    // 主要なドメインはドメイン名のみでマッチング
    const majorDomains = ['youtube.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'reddit.com'];
    const targetDomain = majorDomains.find(domain => targetLower.includes(domain.toLowerCase()));
    
    // "YouTube" → "youtube.com" の変換
    const domainMapping: Record<string, string> = {
      'youtube': 'youtube.com',
      'twitter': 'twitter.com',
      'x': 'x.com',
      'facebook': 'facebook.com',
      'instagram': 'instagram.com',
      'reddit': 'reddit.com'
    };
    
    const mappedDomain = domainMapping[targetLower] || targetDomain;
    
    console.log(`🔍 Looking for tab with: ${targetUrl} (mapped to: ${mappedDomain || targetUrl})`);
    
    for (const page of pages) {
      const url = page.url().toLowerCase();
      
      if (mappedDomain) {
        // マッピングされたドメインでマッチ
        if (url.includes(mappedDomain)) {
          await page.close();
          console.log(`🔒 Closed tab: ${page.url()} (matched by domain: ${mappedDomain})`);
          return;
        }
      } else {
        // その他の場合は指定されたURLでマッチ（大文字小文字無視）
        if (url.includes(targetLower)) {
          await page.close();
          console.log(`🔒 Closed tab: ${page.url()}`);
          return;
        }
      }
    }
    
    throw new Error(`No tab found with URL containing: ${targetUrl}`);
  }

  private async navigate(url: string): Promise<void> {
    if (!this.context) throw new Error('Browser not initialized');
    
    const page = await this.context.newPage();
    await page.goto(url);
    console.log(`🌐 Navigated to: ${url}`);
  }

  private async typeText(selector: string, text: string): Promise<void> {
    if (!this.context) throw new Error('Browser not initialized');
    
    const pages = this.context.pages();
    if (pages.length === 0) throw new Error('No active pages');
    
    const page = pages[pages.length - 1]; // 最新のページ
    
    // デバッグ情報を出力
    console.log('📍 Current page URL:', page.url());
    console.log('📍 Page title:', await page.title());
    
    // Gmail特有のセレクタを追加
    const selectors = [
      selector, // 指定されたセレクタ
      '[contenteditable="true"]', // 一般的な編集可能エリア
      'div[contenteditable="true"]', // div要素の編集可能エリア
      '[role="textbox"]', // メール作成ボックス
      'div[g_editable="true"]', // Gmail古いエディタ
      'div[aria-label*="メッセージ"]', // 日本語UI
      'div[aria-label*="Message"]', // 英語UI
      '.editable', // クラス名
      'div.Am[contenteditable="true"]', // Gmail内部クラス
      'div[aria-label="メッセージ本文"]', // 日本語の本文エリア
      'div[aria-label="Message Body"]' // 英語の本文エリア
    ];
    
    // 現在のページにある編集可能な要素を探す
    try {
      const editableElements = await page.$$eval('[contenteditable], [role="textbox"], textarea, input[type="text"]', elements => 
        elements.map(el => ({
          tag: el.tagName,
          contentEditable: el.getAttribute('contenteditable'),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.className,
          id: el.id
        }))
      );
      console.log('📝 Found editable elements:', editableElements);
    } catch (e) {
      console.log('⚠️ Could not scan for editable elements');
    }
    
    let success = false;
    let lastError: Error | null = null;
    
    // セレクタを順番に試す
    for (const sel of selectors) {
      try {
        // 要素の存在を確認（3秒のタイムアウト）
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.fill(sel, text);
        console.log(`⌨️ Successfully typed text using selector: ${sel}`);
        success = true;
        break;
      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Failed with selector ${sel}: ${error}`);
        continue;
      }
    }
    
    if (!success) {
      throw new Error(`Failed to find any text input element. Last error: ${lastError?.message}`);
    }
  }

  private async click(selector: string): Promise<void> {
    if (!this.context) throw new Error('Browser not initialized');
    
    const pages = this.context.pages();
    if (pages.length === 0) throw new Error('No active pages');
    
    const page = pages[pages.length - 1]; // 最新のページ
    await page.click(selector);
    console.log(`🖱️ Clicked: ${selector}`);
  }

  getLastExecutionResult(): ExecutionResult | null {
    return this.lastExecutionResult;
  }

  async cleanup(): Promise<void> {
    // ユーザープロファイルを使用している場合は、ウィンドウを閉じない
    // （次回の実況で再利用するため）
    console.log('🔌 Browser window kept open for future use');
    // 必要に応じて、アプリ終了時のみ閉じる処理を追加
  }
}