import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { DatabaseInterface } from './interfaces';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ActionRequest {
  type: 'general' | 'search' | 'code' | 'file' | 'command' | 'slack' | 'github' | 'browser' | 'wait';
  reasoning: string;
  urgency?: 'high' | 'low';
  parameters?: {
    query?: string;
    filePath?: string;
    content?: string;
    command?: string;
    message?: string;
    url?: string;
  };
  context?: string;
}

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  toolsUsed?: string[];
  generatedFiles?: string[];
  sessionDir?: string;
  timestamp: number;
}

export class ClaudeExecutorService extends EventEmitter {
  private database: DatabaseInterface;
  private apiKey: string;
  private isExecuting: boolean = false;
  private actionQueue: ActionRequest[] = [];
  private mcpServers: Record<string, any> = {};
  private abortController: AbortController | null = null;
  private workspaceRoot: string;

  constructor(database: DatabaseInterface) {
    super();
    this.database = database;
    
    // プロキシモードかどうかを判定（デフォルトはtrue - ユーザーがAPIキー不要）
    const useProxy = process.env.USE_PROXY !== 'false';
    
    if (useProxy) {
      // プロキシモードの場合
      console.log('🌐 Using proxy mode for Claude API');
      
      // ANTHROPIC_BASE_URLを設定してプロキシ経由にする
      process.env.ANTHROPIC_BASE_URL = 'https://anicca-proxy-ten.vercel.app/api/claude';
      
      // ダミーのAPIキーを設定（プロキシが本物のキーを持っている）
      this.apiKey = 'proxy-placeholder';
      process.env.ANTHROPIC_API_KEY = this.apiKey;
      
      console.log('✅ Claude Code SDK configured to use proxy server');
    } else {
      // ローカル開発用（直接APIキーを使用）
      this.apiKey = process.env.ANTHROPIC_API_KEY || '';
      
      if (!this.apiKey) {
        console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
      }
    }
    
    // 独立した作業環境を設定
    this.workspaceRoot = path.join(os.tmpdir(), 'anicca-agent-workspace');
    this.ensureWorkspaceExists();
    
    console.log('🤖 Claude Executor Service initialized');
    console.log('📁 Workspace root:', this.workspaceRoot);
  }

  /**
   * 作業ディレクトリの存在を確認し、なければ作成
   */
  private ensureWorkspaceExists(): void {
    try {
      if (!fs.existsSync(this.workspaceRoot)) {
        fs.mkdirSync(this.workspaceRoot, { recursive: true });
        console.log('📁 Created workspace directory:', this.workspaceRoot);
      }
    } catch (error) {
      console.error('❌ Failed to create workspace directory:', error);
    }
  }

  /**
   * 新しいセッション用の作業ディレクトリを作成
   */
  private createSessionWorkspace(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionDir = path.join(this.workspaceRoot, timestamp);
    
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log('📁 Created session workspace:', sessionDir);
      return sessionDir;
    } catch (error) {
      console.error('❌ Failed to create session workspace:', error);
      // フォールバックとして一時ディレクトリを返す
      return os.tmpdir();
    }
  }

  /**
   * 生成されたファイルを検出
   */
  private findGeneratedFiles(directory: string): string[] {
    const files: string[] = [];
    
    try {
      const walkDir = (dir: string, baseDir: string = directory) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);
          
          if (entry.isDirectory()) {
            // node_modulesなどは除外
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              walkDir(fullPath, baseDir);
            }
          } else {
            files.push(relativePath);
          }
        }
      };
      
      walkDir(directory);
    } catch (error) {
      console.error('❌ Error scanning directory:', error);
    }
    
    return files;
  }

  /**
   * SDKメッセージをログ出力（進捗の可視化）
   */
  private logSDKMessage(message: SDKMessage): void {
    const msg = message as any;
    let logContent = '';
    let logType = message.type;
    
    switch (message.type) {
      case 'system':
        if (msg.subtype === 'init') {
          logContent = `Claude SDK initialized\nWorking directory: ${msg.cwd}\nAvailable tools: ${msg.tools?.join(', ')}`;
          console.log('🚀 Claude SDK initialized');
          console.log('  📁 Working directory:', msg.cwd);
          console.log('  🔧 Available tools:', msg.tools?.join(', '));
        }
        break;
        
      case 'assistant':
        if (msg.message?.content) {
          const content = msg.message.content;
          if (Array.isArray(content)) {
            const logParts: string[] = [];
            content.forEach((item: any) => {
              if (item.type === 'text') {
                const text = item.text.substring(0, 500) + (item.text.length > 500 ? '...' : '');
                logParts.push(`Claude: ${text}`);
                console.log('🤔 Claude thinking:', item.text.substring(0, 150) + '...');
              } else if (item.type === 'tool_use') {
                logParts.push(`Using tool: ${item.name}`);
                if (item.input) {
                  logParts.push(`Parameters: ${JSON.stringify(item.input).substring(0, 200)}...`);
                }
                console.log(`🔧 Using tool: ${item.name}`);
                if (item.input) {
                  console.log('   Parameters:', JSON.stringify(item.input).substring(0, 100) + '...');
                }
              }
            });
            logContent = logParts.join('\n');
          }
        }
        break;
        
      case 'user':
        // ツールの実行結果
        if (msg.message?.content) {
          const content = msg.message.content;
          if (Array.isArray(content)) {
            const logParts: string[] = [];
            content.forEach((item: any) => {
              if (item.type === 'tool_result') {
                logParts.push(`Tool result received`);
                logType = 'tool';
                console.log(`✅ Tool result for: ${item.tool_use_id}`);
              }
            });
            logContent = logParts.join('\n');
          }
        }
        break;
        
      case 'result':
        logContent = `Execution ${msg.subtype}`;
        if (msg.subtype === 'success') {
          logContent += `\nDuration: ${msg.duration_ms}ms\nTurns: ${msg.num_turns}`;
          console.log('   Duration:', msg.duration_ms + 'ms');
          console.log('   Turns:', msg.num_turns);
        } else if (msg.subtype === 'error') {
          logContent += `\nError: ${msg.error || 'Unknown error'}`;
          logType = 'error';
        }
        console.log('📊 Execution result:', msg.subtype);
        break;
        
      default:
        logContent = `Message type: ${message.type}`;
        console.log('📨 Message type:', message.type);
    }
    
    // イベントを発火してログウィンドウに送信
    if (logContent) {
      this.emit('sdk-log', {
        type: logType,
        content: logContent,
        timestamp: Date.now()
      });
    }
  }

  /**
   * アクションを実行
   */
  async executeAction(action: ActionRequest): Promise<ExecutionResult> {
    console.log(`🎯 Executing action: ${action.type}`, action);
    
    // 実行中の場合はキューに追加
    if (this.isExecuting) {
      this.actionQueue.push(action);
      console.log('📋 Action queued, current queue size:', this.actionQueue.length);
      return {
        success: false,
        error: 'Another action is being executed',
        timestamp: Date.now()
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      let result: ExecutionResult;

      switch (action.type) {
        case 'general':
          result = await this.executeGeneralRequest(action);
          break;
          
        case 'search':
          result = await this.executeSearch(action);
          break;
        
        case 'code':
          result = await this.executeCodeGeneration(action);
          break;
        
        case 'file':
          result = await this.executeFileOperation(action);
          break;
        
        case 'command':
          result = await this.executeCommand(action);
          break;
        
        case 'slack':
          result = await this.executeSlackAction(action);
          break;
        
        case 'github':
          result = await this.executeGitHubAction(action);
          break;
        
        case 'browser':
          result = await this.executeBrowserAction(action);
          break;
        
        case 'wait':
          result = await this.executeWait(action);
          break;
        
        default:
          result = {
            success: false,
            error: `Unknown action type: ${action.type}`,
            timestamp: Date.now()
          };
      }

      // 実行結果をデータベースに保存
      await this.saveExecutionResult(action, result);
      
      // イベントを発火
      this.emit('actionCompleted', { action, result });
      
      return result;

    } catch (error) {
      console.error('❌ Action execution error:', error);
      const errorResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
      
      await this.saveExecutionResult(action, errorResult);
      this.emit('actionError', { action, error: errorResult });
      
      return errorResult;

    } finally {
      this.isExecuting = false;
      
      // キューに次のアクションがあれば実行
      if (this.actionQueue.length > 0) {
        const nextAction = this.actionQueue.shift()!;
        console.log('📋 Processing next action from queue');
        this.executeAction(nextAction);
      }
    }
  }

  /**
   * 一般的なリクエストの実行（自由な指示）
   */
  private async executeGeneralRequest(action: ActionRequest): Promise<ExecutionResult> {
    if (!action.parameters?.query) {
      return {
        success: false,
        error: 'Request is required',
        timestamp: Date.now()
      };
    }

    try {
      const messages: SDKMessage[] = [];
      // セッション用の作業ディレクトリを作成
      const sessionDir = this.createSessionWorkspace();
      
      // より自然な文章での指示（作業ディレクトリを明示）
      const prompt = `
作業ディレクトリ: ${sessionDir}
すべてのファイルはこのディレクトリ内に作成してください。

${action.parameters.query}`;
      
      // AbortControllerを作成
      this.abortController = new AbortController();
      
      console.log('🎯 Executing general request with Claude Code SDK...');
      console.log('📁 Working directory:', sessionDir);
      console.log('📝 Request:', action.parameters.query);
      
      // SDK APIを使用して実行
      for await (const message of query({
        prompt,
        options: {
          abortController: this.abortController,
          maxTurns: 30, // アプリ作成なども考慮して余裕を持たせる
          mcpServers: this.mcpServers,
          cwd: sessionDir,  // 作業ディレクトリを指定
          permissionMode: 'bypassPermissions',  // workspace内では完全な権限を付与
          appendSystemPrompt: `
あなたはバックグラウンドで動作する万能アシスタントです。
コンソールに出力するだけではユーザーには何も見えません。

【唯一の絶対ルール】
あなたが作成した成果物・情報・結果を、必ず何らかの方法でユーザーに届けてください。

【お願い】
その時の状況と成果物に応じて、最も魔法的で素晴らしい方法でユーザーに届けてください。
方法は完全にあなたに任せます。ユーザーを驚かせてください。

例：ゲームを作ったらHTMLで自動的に開く、情報は通知で伝える、など
あなたの創造性で最適な方法を選んでください。

【制作の心得】
アプリやゲームを作る時は、デモとして動くものを素早く作ることを心がけてください。
完璧を求めず、ユーザーが体験できる最小限の機能で魔法を見せてください。

【作業の目安】
できるだけ10ターン以内で完了させてください。
長くなりそうな場合は、段階的に結果を届けてください。
`
        }
      })) {
        messages.push(message);
        
        // リアルタイムで進捗を表示
        this.logSDKMessage(message);
      }

      // 結果を整形
      let textResult = '';
      
      // resultメッセージから結果を取得
      const resultMessage = messages.find(m => m.type === 'result');
      if (resultMessage && (resultMessage as any).result) {
        textResult = (resultMessage as any).result;
      } else {
        // assistantメッセージから結果を取得
        const assistantMessages = messages.filter(m => m.type === 'assistant');
        if (assistantMessages.length > 0) {
          const lastAssistant = assistantMessages[assistantMessages.length - 1];
          if ((lastAssistant as any).message?.content) {
            const content = (lastAssistant as any).message.content;
            textResult = content.map((c: any) => c.text || '').join('\n');
          }
        }
      }

      console.log('📄 Execution Results from Claude Code SDK:');
      console.log('----------------------------------------');
      console.log(textResult || 'Task completed');
      console.log('----------------------------------------');
      
      // 生成されたファイルを検出
      const generatedFiles = this.findGeneratedFiles(sessionDir);
      if (generatedFiles.length > 0) {
        console.log('📁 Generated files:');
        generatedFiles.forEach(file => console.log(`   - ${file}`));
      }
      
      return {
        success: true,
        result: textResult || 'Task completed',
        toolsUsed: messages.filter(m => (m as any).type === 'tool_use').map(m => (m as any).name),
        generatedFiles,
        sessionDir,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ General request execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 検索アクションの実行
   */
  private async executeSearch(action: ActionRequest): Promise<ExecutionResult> {
    if (!action.parameters?.query) {
      return {
        success: false,
        error: 'Search query is required',
        timestamp: Date.now()
      };
    }

    try {
      const messages: SDKMessage[] = [];
      // セッション用の作業ディレクトリを作成
      const sessionDir = this.createSessionWorkspace();
      
      // より自然な文章での指示（作業ディレクトリを明示）
      const prompt = `
作業ディレクトリ: ${sessionDir}
すべてのファイルはこのディレクトリ内に作成してください。

${action.parameters.query || ''}`;
      
      // AbortControllerを作成
      this.abortController = new AbortController();
      
      console.log('🔍 Executing search with Claude Code SDK...');
      console.log('📁 Working directory:', sessionDir);
      
      // SDK APIを使用して検索を実行
      for await (const message of query({
        prompt,
        options: {
          abortController: this.abortController,
          maxTurns: 1,
          mcpServers: this.mcpServers,
          cwd: sessionDir  // 作業ディレクトリを指定
        }
      })) {
        messages.push(message);
        
        // リアルタイムで進捗を表示
        this.logSDKMessage(message);
      }

      // 結果を整形
      let textResult = '';
      
      // resultメッセージから結果を取得
      const resultMessage = messages.find(m => m.type === 'result');
      if (resultMessage && (resultMessage as any).result) {
        textResult = (resultMessage as any).result;
      } else {
        // assistantメッセージから結果を取得
        const assistantMessage = messages.find(m => m.type === 'assistant');
        if (assistantMessage && (assistantMessage as any).message?.content) {
          const content = (assistantMessage as any).message.content;
          textResult = content.map((c: any) => c.text || '').join('\n');
        }
      }

      console.log('📄 Search Results from Claude Code SDK:');
      console.log('----------------------------------------');
      console.log(textResult || 'No results found');
      console.log('----------------------------------------');
      
      // 生成されたファイルを検出
      const generatedFiles = this.findGeneratedFiles(sessionDir);
      if (generatedFiles.length > 0) {
        console.log('📁 Generated files:');
        generatedFiles.forEach(file => console.log(`   - ${file}`));
      }
      
      return {
        success: true,
        result: textResult || 'No results found',
        toolsUsed: ['web-search'],
        generatedFiles,
        sessionDir,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Search execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * コード生成アクションの実行
   */
  private async executeCodeGeneration(action: ActionRequest): Promise<ExecutionResult> {
    if (!action.parameters?.query) {
      return {
        success: false,
        error: 'Code generation prompt is required',
        timestamp: Date.now()
      };
    }

    try {
      const messages: SDKMessage[] = [];
      const prompt = `コードを生成してください: ${action.parameters.query}\n必要なファイルを作成し、機能を実装してください。`;
      
      this.abortController = new AbortController();
      
      for await (const message of query({
        prompt,
        options: {
          abortController: this.abortController,
          maxTurns: 3,
          mcpServers: this.mcpServers
        }
      })) {
        messages.push(message);
      }
      
      // 結果を取得
      let result = '';
      const resultMessage = messages.find(m => m.type === 'result');
      if (resultMessage && (resultMessage as any).result) {
        result = (resultMessage as any).result;
      }

      console.log('💻 Code Generation Results from Claude Code SDK:');
      console.log('----------------------------------------');
      console.log(result || 'Code generation completed');
      console.log('----------------------------------------');
      
      return {
        success: true,
        result: result || 'Code generation completed',
        toolsUsed: ['file-write', 'code-generation'],
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * ファイル操作アクションの実行
   */
  private async executeFileOperation(action: ActionRequest): Promise<ExecutionResult> {
    try {
      const prompt = action.parameters?.content
        ? `Edit file ${action.parameters.filePath}: ${action.parameters.content}`
        : `Read and analyze file: ${action.parameters?.filePath}`;

      const messages: SDKMessage[] = [];
      this.abortController = new AbortController();
      
      for await (const message of query({
        prompt,
        options: {
          abortController: this.abortController,
          maxTurns: 1,
          mcpServers: this.mcpServers
        }
      })) {
        messages.push(message);
      }
      
      // 結果を取得
      let result = '';
      const resultMessage = messages.find(m => m.type === 'result');
      if (resultMessage && (resultMessage as any).result) {
        result = (resultMessage as any).result;
      }

      console.log('📁 File Operation Results from Claude Code SDK:');
      console.log('----------------------------------------');
      console.log(result || 'File operation completed');
      console.log('----------------------------------------');
      
      return {
        success: true,
        result: result || 'File operation completed',
        toolsUsed: ['file-read', 'file-write'],
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * コマンド実行アクション
   */
  private async executeCommand(action: ActionRequest): Promise<ExecutionResult> {
    if (!action.parameters?.command) {
      return {
        success: false,
        error: 'Command is required',
        timestamp: Date.now()
      };
    }

    try {
      const messages: SDKMessage[] = [];
      const prompt = `次のコマンドを実行して結果を報告してください: ${action.parameters.command}`;
      
      this.abortController = new AbortController();
      
      for await (const message of query({
        prompt,
        options: {
          abortController: this.abortController,
          maxTurns: 1,
          mcpServers: this.mcpServers
        }
      })) {
        messages.push(message);
      }
      
      // 結果を取得
      let result = '';
      const resultMessage = messages.find(m => m.type === 'result');
      if (resultMessage && (resultMessage as any).result) {
        result = (resultMessage as any).result;
      }

      console.log('🖥️ Command Execution Results from Claude Code SDK:');
      console.log('----------------------------------------');
      console.log(result || 'Command executed');
      console.log('----------------------------------------');
      
      return {
        success: true,
        result: result || 'Command executed',
        toolsUsed: ['command-execution'],
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Slackアクションの実行
   */
  private async executeSlackAction(action: ActionRequest): Promise<ExecutionResult> {
    // TODO: Slack MCP統合
    return {
      success: false,
      error: 'Slack integration not yet implemented',
      timestamp: Date.now()
    };
  }

  /**
   * GitHubアクションの実行
   */
  private async executeGitHubAction(action: ActionRequest): Promise<ExecutionResult> {
    // TODO: GitHub MCP統合
    return {
      success: false,
      error: 'GitHub integration not yet implemented',
      timestamp: Date.now()
    };
  }

  /**
   * ブラウザアクションの実行
   */
  private async executeBrowserAction(action: ActionRequest): Promise<ExecutionResult> {
    // TODO: Browser automation統合
    return {
      success: false,
      error: 'Browser automation not yet implemented',
      timestamp: Date.now()
    };
  }

  /**
   * 待機アクションの実行
   */
  private async executeWait(action: ActionRequest): Promise<ExecutionResult> {
    const duration = action.parameters?.query ? parseInt(action.parameters.query) : 5000;
    await new Promise(resolve => setTimeout(resolve, duration));
    
    return {
      success: true,
      result: `Waited for ${duration}ms`,
      timestamp: Date.now()
    };
  }


  /**
   * 実行結果をデータベースに保存
   */
  private async saveExecutionResult(action: ActionRequest, result: ExecutionResult): Promise<void> {
    try {
      // TODO: データベーススキーマに応じて実装
      console.log('💾 Saving execution result to database');
    } catch (error) {
      console.error('❌ Error saving execution result:', error);
    }
  }

  /**
   * MCPサーバーを動的に追加
   */
  async addMCPServer(name: string, config: any): Promise<boolean> {
    try {
      this.mcpServers[name] = config;
      console.log(`🔌 MCP server '${name}' added:`, config);
      return true;
    } catch (error) {
      console.error(`❌ Error adding MCP server '${name}':`, error);
      return false;
    }
  }
  
  /**
   * 基本的なMCPサーバーをセットアップ
   */
  async setupDefaultMCPServers(): Promise<void> {
    try {
      // EXA MCPサーバーを設定
      // EXA APIキーを取得
      const encryptionService = (await import('./encryptionService')).EncryptionService;
      // EXA MCPサーバーは削除（遅いため）
      console.log('ℹ️ EXA MCP server disabled for performance')
      
      console.log('✅ MCP servers configuration completed');
      console.log('📋 Available MCP servers:', Object.keys(this.mcpServers));
    } catch (error) {
      console.error('❌ Error setting up MCP servers:', error);
    }
  }

  /**
   * 現在の状態を取得
   */
  getCurrentState() {
    return {
      isExecuting: this.isExecuting,
      queueSize: this.actionQueue.length,
      mcpServers: Object.keys(this.mcpServers)
    };
  }
}