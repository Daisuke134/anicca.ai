import { IPCHandler } from '../IPCProtocol.js';
import { 
  MessageTypes, 
  TaskStatus,
  createStatusUpdateMessage,
  createTaskCompleteMessage,
  createErrorMessage,
  createLogMessage
} from '../IPCProtocol.js';
import { buildWorkerPrompt } from '../prompts/workerPrompts.js';
import { ClaudeExecutorService } from '../../claude/executorService.js';
import { ClaudeSession } from '../../claude/sessionManager.js';
// import { MockDatabase } from '../../mockDatabase.js'; // Removed in Phase 1
import { loadWorkspace, saveWorkspace } from '../../storage/workerMemory.js';
import { getSlackTokensForUser } from '../../tokens/slackTokens.supabase.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * BaseWorker - すべてのWorkerエージェントの基底クラス
 * 
 * 汎用的なタスク処理能力を持ち、経験に基づいて
 * 段階的に専門性を獲得していく
 */
export class BaseWorker extends IPCHandler {
  constructor() {
    // AGENT_NAMEを先に取得（super()の前に必要）
    const agentName = process.env.AGENT_NAME || 'Worker';
    super(agentName);
    
    this.agentId = process.env.AGENT_ID;
    this.workerNumber = process.env.WORKER_NUMBER || '1';
    
    // 現在のタスク
    this.currentTask = null;
    
    // 現在のタスクのuserIdを保持
    this.currentUserId = null;
    
    // Slack返信タスクのユーザー応答待機フラグ
    this.isWaitingForUserResponse = false;
    
    // ClaudeExecutorServiceをインスタンス化（エージェント名を渡す）
    // const database = new MockDatabase(); // Removed in Phase 1
    this.executor = new ClaudeExecutorService(null, this.agentName); // databaseパラメータはnullに
    
    // 永続的なセッションを作成
    this.session = new ClaudeSession(this.executor, this.agentName);
    console.log(`📂 [${this.agentName}] Persistent session initialized`);
    
    // Slackトークンを設定（環境変数またはglobalから）
    const slackBotToken = process.env.SLACK_BOT_TOKEN || global.slackBotToken;
    const slackUserToken = process.env.SLACK_USER_TOKEN || global.slackUserToken;
    const userId = process.env.SLACK_USER_ID || global.currentUserId;
    
    if (slackBotToken) {
      this.executor.setSlackTokens({
        bot_token: slackBotToken,
        user_token: slackUserToken,
        userId: userId || 'system'
      });
      this.log('info', '🔗 Slack tokens configured from environment');
    }
    
    // MCPサーバーを初期化（重要！）
    this.log('info', '🔧 Initializing MCP servers...');
    // 初期化を同期的に待つ
    this.initMCPServers();
    
    // 統計情報（将来の専門化のため）
    this.stats = {
      completedTasks: 0,
      failedTasks: 0,
      taskTypes: {}
    };
    
    // プロファイルとインストラクションのパス
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.profilePath = path.join(__dirname, '..', 'config', 'profiles', `${this.agentName.toLowerCase()}.json`);
    this.instructionPath = path.join(__dirname, '..', 'config', 'instructions', `${this.agentName.toLowerCase()}.md`);
    
    console.log(`🤖 ${this.agentName} (${this.agentId}) is initializing...`);
    this.setupHandlers();
    
    // CLAUDE.md/ワークスペースの読み込みは各Workerのinitialize()で行う
    // this.loadMemory();
    
    // 初期化完了を通知
    this.sendReady();
  }
  
  /**
   * MCPサーバーを初期化
   */
  initMCPServers() {
    try {
      this.executor.initializeMCPServers();
      this.log('info', '✅ MCP servers initialized successfully');
    } catch (error) {
      this.log('error', `❌ Failed to initialize MCP servers: ${error.message}`);
      // MCPが使えなくても続行（エラーはログに記録済み）
    }
  }
  
  /**
   * ワークスペース全体を読み込む（CLAUDE.mdを含む）
   */
  async loadMemory() {
    try {
      const userId = this.currentUserId || process.env.SLACK_USER_ID || process.env.CURRENT_USER_ID || global.currentUserId || 'system';
      console.log(`📚 [${this.agentName}] Loading workspace for userId: ${userId}`);
      
      // Web版の場合のみワークスペース全体を復元
      const isDesktop = process.env.DESKTOP_MODE === 'true';
      if (!isDesktop && this.workspaceRoot) {
        // ワークスペース全体を復元
        await loadWorkspace(userId, this.agentName, this.workspaceRoot);
        console.log(`📂 [${this.agentName}] Workspace restored from Supabase Storage`);
        
        // CLAUDE.mdがローカルに復元されているはずなので読み込む
        const claudeMdPath = path.join(this.workspaceRoot, 'CLAUDE.md');
        if (fsSync.existsSync(claudeMdPath)) {
          this.claudeMd = fsSync.readFileSync(claudeMdPath, 'utf8');
          this.log('info', `📚 Loaded CLAUDE.md from workspace (${this.claudeMd.length} chars)`);
        } else {
          // CLAUDE.mdがない場合は空文字列で初期化
          this.claudeMd = '';
        }
      } else {
        // Desktop版の場合もローカルファイルから読み込む
        const claudeMdPath = path.join(this.workspaceRoot, 'CLAUDE.md');
        if (fsSync.existsSync(claudeMdPath)) {
          this.claudeMd = fsSync.readFileSync(claudeMdPath, 'utf8');
        } else {
          this.claudeMd = '';
        }
      }
      
      if (this.claudeMd) {
        // CLAUDE.mdの内容をシステムプロンプトに追加
        this.memoryContext = `\n## あなたの記憶（CLAUDE.md）\n${this.claudeMd}\n`;
      }
    } catch (error) {
      this.log('error', `Failed to load workspace: ${error.message}`);
      this.memoryContext = '';
    }
  }
  
  /**
   * 準備完了を親に通知
   */
  sendReady() {
    if (process.send) {
      process.send({
        type: 'READY',
        payload: {
          agentName: this.agentName,
          agentId: this.agentId
        },
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * メッセージハンドラーの設定
   * @private
   */
  setupHandlers() {
    // タスク割り当て
    this.on(MessageTypes.TASK_ASSIGN, async (payload) => {
      await this.handleTaskAssignment(payload);
    });
    
    // ステータス要求
    this.on(MessageTypes.STATUS_REQUEST, () => {
      this.reportStatus();
    });
    
    // タスクキャンセル
    this.on(MessageTypes.TASK_CANCEL, (payload) => {
      this.handleTaskCancel(payload.taskId);
    });
    
    // ユーザー応答処理
    this.on(MessageTypes.USER_RESPONSE, (payload) => {
      this.handleUserResponse(payload);
    });
    
    // SET_SLACK_TOKENSハンドラーを追加（Worker音声対話モード用）
    this.on('SET_SLACK_TOKENS', (payload) => {
      if (payload.tokens && this.executor) {
        this.executor.setSlackTokens(payload.tokens);
        this.log('info', '✅ [Worker1] Slack tokens received and set via IPC');
        
        // MCPサーバーを再初期化
        try {
          this.executor.initializeMCPServers();
          this.log('info', '✅ MCP servers re-initialized with Slack tokens');
        } catch (error) {
          this.log('error', `❌ Failed to re-initialize MCP servers: ${error.message}`);
        }
      }
    });
  }
  
  
  /**
   * タスク割り当てを処理
   * @private
   */
  async handleTaskAssignment(payload) {
    const { taskId, task, slackTokens } = payload;
    
    this.log('info', `Received task ${taskId}: ${task.originalRequest || task.task || task.description || 'No description'}`);
    this.currentTask = { taskId, task, startTime: Date.now() };
    
    // Desktop版でSlackトークンが渡された場合
    if (slackTokens) {
      this.log('info', '🔑 Received Slack tokens from ParentAgent (Desktop mode)');
      this.executor.setSlackTokens(slackTokens);
      // MCPサーバーを再初期化
      this.executor.initializeMCPServers();
      this.log('info', '✅ MCP servers re-initialized with received tokens');
    }
    
    // ステータスを更新 - 初期進捗は不要
    
    let skipTaskComplete = false;  // finallyブロックでアクセスできるように
    
    try {
      // タスクを実行
      const result = await this.executeTask(task);
      skipTaskComplete = result.skipTaskComplete || false;
      
      // 統計を更新
      this.stats.completedTasks++;
      const taskType = task.type || 'general';
      this.stats.taskTypes[taskType] = (this.stats.taskTypes[taskType] || 0) + 1;
      
      // 完了を報告
      if (!result.skipTaskComplete) {
        this.send(createTaskCompleteMessage(taskId, result));
        this.log('info', `Task ${taskId} completed successfully`);
      } else {
        this.log('info', `Task ${taskId} waiting for user response (STATUS_UPDATE mode)`);
      }
      
      // タスク完了後もプロセスを維持（アイドル状態へ）
      await this.enterIdleMode();
      
    } catch (error) {
      // エラーを報告
      this.stats.failedTasks++;
      this.send(createErrorMessage(error, taskId));
      this.log('error', `Task ${taskId} failed: ${error.message}`);
      
      // エラー後もプロセスを維持
      await this.enterIdleMode();
    } finally {
      // STATUS_UPDATE待機中（skipTaskComplete）の場合はcurrentTaskを保持
      if (!skipTaskComplete && !this.isWaitingForUserResponse) {
        this.currentTask = null;
      }
    }
  }
  
  /**
   * タスクを実行
   * @private
   */
  async executeTask(task) {
    this.log('info', `Executing ${task.type || 'general'} task...`);
    
    // 進捗を報告 - 削除（不要）
    
    try {
      // タスクのuserIdを保存（重要！）
      this.currentUserId = task.userId || process.env.CURRENT_USER_ID || process.env.SLACK_USER_ID || 'system';
      this.log('info', `📌 Setting currentUserId: ${this.currentUserId}`);
      
      // Desktop版以外の場合のみSupabaseからトークン取得
      if (process.env.DESKTOP_MODE !== 'true') {
        // タスク実行前にユーザーのSlackトークンを取得して設定
        const userId = this.currentUserId;
        if (userId && userId !== 'system' && typeof getSlackTokensForUser === 'function') {
          this.log('info', `🔑 Getting Slack tokens for user: ${userId}`);
          try {
            const slackTokens = await getSlackTokensForUser(userId);
            if (slackTokens && slackTokens.bot_token) {
              this.log('info', '✅ Slack tokens found, configuring MCP...');
              
              // ExecutorServiceにトークンを設定
              this.executor.setSlackTokens({
                bot_token: slackTokens.bot_token,
                user_token: slackTokens.user_token,
                userId: userId
              });
              
              // MCPサーバーを再初期化
              this.executor.initializeMCPServers();
              this.log('info', '✅ MCP servers re-initialized with Slack tokens');
            } else {
              this.log('warn', '⚠️ No Slack tokens found for user');
            }
          } catch (error) {
            this.log('error', `❌ Failed to get Slack tokens: ${error.message}`);
          }
        }
      }
      
      // Worker専用の作業ディレクトリを使用（Worker.jsで設定済み）
      const workingDir = this.workspaceRoot || `/tmp/worker-${this.workerNumber}-workspace`;
      
      // Desktop版チェック
      const isDesktop = process.env.DESKTOP_MODE === 'true';
      
      // Worker用プロンプトを構築
      const prompt = `
${buildWorkerPrompt({
  taskType: task.type,
  workerStats: this.stats,
  userName: task.context?.userName,
  workerName: this.agentName
})}

${this.memoryContext || ''}

【受け取ったタスク】
${task.originalRequest}

作業ディレクトリ: ${workingDir}
`;
      
      // セッションを使用して実行（rawオプションで完全な応答を取得）
      const result = await this.session.sendMessage(prompt, { raw: true });
      
      // 進捗を報告 - 削除（不要）
      
      // 結果を整形
      const taskStartTime = this.currentTask?.startTime || Date.now();
      const formattedResult = {
        success: true,
        output: result,
        metadata: {
          executedBy: this.agentName,
          taskType: task.type,
          duration: Date.now() - taskStartTime
        }
      };
      
      // Web版の場合はワークスペース全体を保存（CLAUDE.md含む）
      const isDesktopSave = process.env.DESKTOP_MODE === 'true';
      if (!isDesktopSave && this.workspaceRoot) {
        const userId = this.currentUserId || process.env.SLACK_USER_ID || process.env.CURRENT_USER_ID || global.currentUserId || 'system';
        await saveWorkspace(userId, this.agentName, this.workspaceRoot);
      }
      
      return formattedResult;
      
    } catch (error) {
      this.log('error', `Task execution error: ${error.message}`);
      throw new Error(`Task execution failed: ${error.message}`);
    }
  }
  
  /**
   * SDKメッセージをログ出力
   * @private
   */
  logSDKMessage(message) {
    if (message.type === 'tool_use') {
      this.log('info', `🔧 Using tool: ${message.name}`);
    } else if (message.type === 'assistant') {
      this.log('info', `💬 Assistant message received`);
    } else if (message.type === 'error') {
      this.log('error', `❌ Error: ${message.error}`);
    }
  }
  
  /**
   * タスクキャンセルを処理
   * @private
   */
  handleTaskCancel(taskId) {
    if (this.currentTask && this.currentTask.taskId === taskId) {
      this.log('warn', `Task ${taskId} cancelled`);
      this.currentTask = null;
      // Claudeの実行をキャンセル（実装は後で）
    }
  }
  
  /**
   * 現在のステータスを報告
   * @private
   */
  reportStatus() {
    let currentTaskInfo = null;
    if (this.currentTask) {
      const startTime = this.currentTask.startTime || Date.now();
      currentTaskInfo = {
        taskId: this.currentTask.taskId,
        description: this.currentTask.task.description,
        duration: Date.now() - startTime
      };
    }
    
    const status = {
      agentId: this.agentId,
      agentName: this.agentName,
      currentTask: currentTaskInfo,
      stats: this.stats,
      uptime: process.uptime() * 1000
    };
    
    // ステータス報告は必要な場合のみ送信
  }
  
  /**
   * 進捗報告とユーザー確認要求を送信
   * @param {string} message - 報告メッセージ
   * @param {boolean} requiresUserInput - ユーザー入力が必要か
   */
  sendStatusUpdate(message, requiresUserInput = false) {
    this.send({
      type: MessageTypes.STATUS_UPDATE,
      payload: {
        taskId: this.currentTask?.taskId,
        message: message,
        requiresUserInput: requiresUserInput,
        workerName: this.agentName,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * ユーザー応答を処理
   * @param {object} payload - ユーザー応答ペイロード
   */
  handleUserResponse(payload) {
    const { message } = payload;
    this.log('info', `Received user response: ${message}`);
    
    // ユーザー応答を受けて自律的に判断
    // 定期タスクの場合は、返信案の修正や送信判断を行う
    // 具体的な処理はWorker.jsで実装（タスクに応じて）
  }
  
  /**
   * アイドルモードに入る
   * タスク完了後もプロセスを維持し、定期的にheartbeatを送信
   */
  async enterIdleMode() {
    this.log('info', `💤 ${this.agentName} entering idle mode...`);
    // アイドル状態に入るだけで、heartbeatは送信しない
    // Workerプロセスは生き続け、定期タスクのnode-cronタイマーを保持する
  }

  
  /**
   * クリーンアップ処理
   * @override
   */
  async cleanup() {
    this.log('info', 'Shutting down...');
    
    // heartbeatインターバルをクリア
    // heartbeatIntervalの削除（もう使用しない）
    
    // 現在のタスクがあれば中断を報告
    if (this.currentTask) {
      this.send(createErrorMessage(
        new Error('Agent shutting down'),
        this.currentTask.taskId
      ));
    }
    
    // Claudeサービスのクリーンアップ（必要に応じて）
    // MCPコネクションのクローズ（必要に応じて）
  }
}

// エントリーポイント（直接実行された場合）
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  const worker = new BaseWorker();
  worker.startListening();
}
