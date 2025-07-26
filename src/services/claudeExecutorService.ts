import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { DatabaseInterface } from './interfaces';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SimpleEncryption } from './simpleEncryption';
import { PROXY_URL } from '../config';

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
  private executionTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_EXECUTION_TIME = 300000; // 5分

  constructor(database: DatabaseInterface) {
    super();
    this.database = database;
    
    
    // プロキシモードかどうかを判定（デフォルトはtrue - ユーザーがAPIキー不要）
    const useProxy = process.env.USE_PROXY !== 'false';
    
    if (useProxy) {
      // プロキシモードの場合
      console.log('🌐 Using proxy mode for Claude API');
      
      // ANTHROPIC_BASE_URLを設定してプロキシ経由にする
      process.env.ANTHROPIC_BASE_URL = `${PROXY_URL}/api/claude`;
      
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
    
    // 独立した作業環境を設定（デスクトップに移動）
    this.workspaceRoot = path.join(os.homedir(), 'Desktop', 'anicca-agent-workspace');
    
    try {
      this.ensureWorkspaceExists();
    } catch (error) {
      console.error('❌ Error creating workspace:', error);
    }
    
    console.log('🤖 Claude Executor Service initialized');
    console.log('📁 Workspace root:', this.workspaceRoot);
    
    // MCPサーバーの初期化
    this.initializeMCPServers();
    
    // 初期化完了時に実行状態を確実にfalseに
    this.isExecuting = false;
    this.abortController = null;
    this.executionTimeout = null;
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
    let logType: 'system' | 'assistant' | 'user' | 'result' | 'tool' | 'error' = message.type as any;
    
    switch (message.type) {
      case 'system':
        if (msg.subtype === 'init') {
          logContent = `Claude SDK initialized\nWorking directory: ${msg.cwd}`;
          console.log('🚀 Claude SDK initialized');
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
                console.log(`🔧 Using tool: ${item.name}`);
              }
            });
            logContent = logParts.join('\n');
          }
        }
        break;
        
      case 'user':
        // ツールの実行結果 - ログウィンドウには表示しない
        break;
        
      case 'result':
        if (msg.subtype === 'success') {
          console.log('✅ Task completed successfully');
        } else if (msg.subtype === 'error') {
          logContent = `Error: ${msg.error || 'Unknown error'}`;
          logType = 'error';
          console.log('❌ Execution error:', msg.error);
        }
        break;
        
      default:
        // その他のメッセージタイプは無視
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

    // 実行タイムアウトを設定
    this.executionTimeout = setTimeout(() => {
      console.log('⏰ Execution timeout reached, forcing reset');
      this.resetExecutionState();
    }, this.MAX_EXECUTION_TIME);

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
      
      // タイムアウトをクリア
      if (this.executionTimeout) {
        clearTimeout(this.executionTimeout);
        this.executionTimeout = null;
      }
      
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
  async executeGeneralRequest(action: ActionRequest): Promise<ExecutionResult> {
    if (!action.parameters?.query) {
      return {
        success: false,
        error: 'Request is required',
        timestamp: Date.now()
      };
    }

    // 元の環境変数を保存（tryブロックの外で定義）
    const originalElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    const originalPath = process.env.PATH || '';

    try {
      const messages: SDKMessage[] = [];
      // 作業ディレクトリは常にworkspaceRootを使用
      const workingDir = this.workspaceRoot;
      
      // より自然な文章での指示（作業ディレクトリを明示）
      const prompt = `
作業ディレクトリ: ${workingDir}
プロジェクトごとにサブディレクトリを作成してください。

${action.parameters.query}`;
      
      // AbortControllerを作成
      this.abortController = new AbortController();
      
      console.log('🎯 Executing general request with Claude Code SDK...');
      console.log('📁 Working directory:', workingDir);
      console.log('📝 Request:', action.parameters.query);
      
      
      // ELECTRON_RUN_AS_NODE環境変数を設定
      const envWithNode = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
        // DEBUG環境変数は削除（JSON出力を汚染するため）
      };
      
      // process.envを直接更新（SDKがenvオプションをサポートしない場合のため）
      process.env.ELECTRON_RUN_AS_NODE = '1';
      // DEBUG環境変数を削除（JSON出力を汚染するため）
      // process.env.DEBUG = 'true';
      // process.env.ANTHROPIC_LOG = 'debug';
      
      // Electronの実行ファイルのディレクトリをPATHに追加
      const electronDir = path.dirname(process.execPath);
      process.env.PATH = `${electronDir}:${originalPath}`;
      
      // 一時的なnode実行ファイルを作成（実際にはElectronを呼び出すシェルスクリプト）
      const tempNodePath = path.join(os.tmpdir(), 'anicca-node-wrapper');
      const nodePath = path.join(os.tmpdir(), 'node');
      
      try {
        const nodeWrapper = `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "$@"
`;
        fs.writeFileSync(tempNodePath, nodeWrapper, { mode: 0o755 });
        
        // このディレクトリもPATHに追加
        process.env.PATH = `${os.tmpdir()}:${process.env.PATH}`;
        
        // node wrapperをnodeという名前にリネーム
        if (fs.existsSync(nodePath)) {
          fs.unlinkSync(nodePath);
        }
        fs.renameSync(tempNodePath, nodePath);
      } catch (error) {
        console.error('❌ Failed to create node wrapper:', error);
        // エラー時に一時ファイルをクリーンアップ
        if (fs.existsSync(tempNodePath)) {
          try {
            fs.unlinkSync(tempNodePath);
          } catch (cleanupError) {
            console.error('❌ Failed to cleanup temp file:', cleanupError);
          }
        }
      }
      
      try {
        // SDKの内部動作を確認するため、オプションをログ出力
        const queryOptions = {
          abortController: this.abortController,
          maxTurns: 30, // アプリ作成なども考慮して余裕を持せる
          mcpServers: this.mcpServers,
          cwd: workingDir,  // 作業ディレクトリを指定（常にworkspaceRoot）
          permissionMode: 'bypassPermissions' as const,  // workspace内では完全な権限を付与
          // 環境変数をSDKに渡す（SDKのspawnに反映されるか確認）
          env: envWithNode,
          appendSystemPrompt: `
あなたはバックグラウンドで動作する万能アシスタントです。
ユーザーの画面を見ながら、必要な支援を魔法のように実現します。

【重要：作業範囲の制限】
- 作業ディレクトリ: ${workingDir}
- このディレクトリ外のファイルは絶対に読み書きしないでください
- ユーザーのプライバシーを守るため、ワークスペース外へのアクセスは禁止です

【成果物の届け方】
原則：通知のみで完結させる
osascript -e 'display notification "内容" with title "ANICCA"'

【通知に全てを込める】
- 60文字以内で結果のエッセンスを伝える
- ファイル保存は最小限に
- 通知だけで価値が伝わるように工夫

【例】
エラー修正：
"型エラー修正: user?: User に変更でOK"

情報検索：
"Next.js 14.2が最新。App Router推奨"

TODO整理：
"緊急3件: PR修正、会議準備、バグ対応"

コード生成：
"関数作成完了。pbpaste で貼り付け可能"
→ 同時に pbcopy でクリップボードにコピー

ゲーム作成（唯一の例外）：
"テトリス完成！" → この時だけHTMLを開く

【重要】
通知という制約の中で最大の価値を。
詳細ファイルは作らない。通知で完結。

【作業領域】
あなたは専用ワークスペース内で作業します。
画面のファイルは編集できませんが、新しいものを作成して価値を提供できます。

【学習と記憶】
ユーザーについて学んだ重要な情報（名前、好み、パターンなど）は、
~/Desktop/anicca-agent-workspace/CLAUDE.md に自動的に保存してください。
このファイルは次回のセッションで自動的に読み込まれます。

例：
- ユーザーの名前: ダイスケ
- 好みの言語: 日本語
- よく使うツール: VS Code, Terminal
- 作業パターン: 音声での指示を好む

【重要】
成果物は必ず何らかの形でユーザーに届けてください。
黙って作業を完了させるのではなく、魔法的な演出でユーザーを喜ばせてください。
あなたの創造性を最大限に発揮してください！

【作業の目安】
できるだけ10ターン以内で完了させてください。
長くなりそうな場合は、段階的に結果を届けてください。
`
        } as any;
        
        
        for await (const message of query({
          prompt,
          options: queryOptions
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
      const generatedFiles = this.findGeneratedFiles(workingDir);
      if (generatedFiles.length > 0) {
        console.log('📁 Generated files:');
        generatedFiles.forEach(file => console.log(`   - ${file}`));
      }
      
      return {
        success: true,
        result: textResult || 'Task completed',
        toolsUsed: messages.filter(m => (m as any).type === 'tool_use').map(m => (m as any).name),
        generatedFiles,
        sessionDir: workingDir,
        timestamp: Date.now()
      };
    } catch (innerError) {
      // 内側のtry-catchでエラーをキャッチ
      console.error('❌ Claude SDK query error:', innerError);
      throw innerError;  // 外側のcatchに伝播
    }
    } catch (error) {
      console.error('❌ General request execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    } finally {
      this.abortController = null;
      
      // 環境変数を元に戻す
      if (originalElectronRunAsNode === undefined) {
        delete process.env.ELECTRON_RUN_AS_NODE;
      } else {
        process.env.ELECTRON_RUN_AS_NODE = originalElectronRunAsNode;
      }
      process.env.PATH = originalPath;
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
          cwd: sessionDir,  // 作業ディレクトリを指定
          permissionMode: 'bypassPermissions' as const
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
      // EXA APIキーを取得（既に無効化済み）
      // const encryptionService = (await import('./encryptionService')).EncryptionService;
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

  /**
   * 
   * サーバーの初期化
   */
  async initializeMCPServers(): Promise<void> {
    this.mcpServers = {};
    
    // ElevenLabs MCPの設定（環境変数が設定されている場合のみ有効）
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (elevenLabsApiKey) {
      this.mcpServers.elevenlabs = {
        command: "uvx",
        args: ["elevenlabs-mcp"],
        env: {
          ELEVENLABS_API_KEY: elevenLabsApiKey
        }
      };
      console.log('✅ ElevenLabs MCP server configured');
    } else {
      console.warn('⚠️ ElevenLabs API key not found. Set ELEVENLABS_API_KEY environment variable to enable ElevenLabs MCP.');
    }
    
    // Slackトークンの確認
    try {
      const slackConfigPath = path.join(process.env.HOME || '', '.anicca', 'slack-config.json');
      if (fs.existsSync(slackConfigPath)) {
        const config = JSON.parse(fs.readFileSync(slackConfigPath, 'utf-8'));
        
        // 新形式のMCP設定を読み込む
        if (config.mcpServers?.slack?.env?.SLACK_BOT_TOKEN) {
          const encryption = new SimpleEncryption();
          const token = encryption.decrypt(config.mcpServers.slack.env.SLACK_BOT_TOKEN);
          
          this.mcpServers.slack = {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-slack"],
            env: {
              SLACK_BOT_TOKEN: token,
              SLACK_TEAM_ID: config.mcpServers.slack.env.SLACK_TEAM_ID || ''
            }
          };
          
          console.log('✅ Slack MCP server configured');
        }
        // 旧形式も一応サポート（後方互換性）
        else if (config.token) {
          const encryption = new SimpleEncryption();
          const token = encryption.decrypt(config.token);
          
          this.mcpServers.slack = {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-slack"],
            env: {
              SLACK_BOT_TOKEN: token,
              SLACK_TEAM_ID: config.team?.id || ''
            }
          };
          
          console.log('✅ Slack MCP server configured (legacy format)');
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize Slack MCP:', error);
    }
  }

  /**
   * Slackトークンを設定
   */
  setSlackTokens(tokens: any): void {
    // Slack MCPサーバーの設定を更新
    if (tokens.bot_token) {
      this.mcpServers.slack = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        env: {
          SLACK_BOT_TOKEN: tokens.bot_token,
          SLACK_USER_TOKEN: tokens.user_token || '',
          SLACK_TEAM_ID: tokens.team_id || ''
        }
      };
      console.log('✅ Slack tokens set for MCP');
    }
  }

  /**
   * MCPサーバーを動的に更新
   */
  async updateMCPServers(): Promise<void> {
    await this.initializeMCPServers();
    console.log('🔄 MCP servers updated');
  }

  /**
   * 利用可能なMCPサーバーのリストを取得
   */
  getAvailableMCPServers(): string[] {
    const available: string[] = [];
    if (this.mcpServers.slack) {
      available.push('Slack');
    }
    if (this.mcpServers.elevenlabs) {
      available.push('ElevenLabs');
    }
    return available;
  }

  /**
   * 実行状態をリセット（緊急用）
   */
  resetExecutionState(): void {
    console.log('🔄 Resetting execution state');
    this.isExecuting = false;
    
    // 実行中のプロセスを中断
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    // タイムアウトをクリア
    if (this.executionTimeout) {
      clearTimeout(this.executionTimeout);
      this.executionTimeout = null;
    }
    
    this.actionQueue = [];
  }
}