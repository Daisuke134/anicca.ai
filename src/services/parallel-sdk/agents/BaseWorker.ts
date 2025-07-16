import { IPCHandler, MessageTypes, TaskStatus, createStatusUpdateMessage, createTaskCompleteMessage, createErrorMessage, createLogMessage } from '../IPCProtocol';
import { buildWorkerPrompt } from '../prompts/workerPrompts';
import { ClaudeExecutorService } from '../../claudeExecutorService';
import { ClaudeSession } from '../../claudeSession';
import { SQLiteDatabase } from '../../sqliteDatabase';
import { loadClaudeMd, saveClaudeMd, appendLearning } from '../../workerMemory';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { Task, TaskInfo, WorkerProfile, ClaudeMemory, ExecutionResult } from '../types';

/**
 * BaseWorker - すべてのWorkerエージェントの基底クラス
 * 
 * 汎用的なタスク処理能力を持ち、経験に基づいて
 * 段階的に専門性を獲得していく
 */
export class BaseWorker extends IPCHandler {
  protected agentId: string;
  protected workerNumber: string;
  protected currentTask: Task | null = null;
  protected executor: ClaudeExecutorService;
  protected session: ClaudeSession;
  protected stats: {
    completedTasks: number;
    failedTasks: number;
    taskTypes: Record<string, number>;
  };
  protected profilePath: string;
  protected instructionPath: string;
  protected profile: WorkerProfile | null = null;
  protected instruction: string = '';
  protected claudeMd: string = '';
  protected memoryContext: string = '';

  constructor() {
    // AGENT_NAMEを先に取得（super()の前に必要）
    const agentName = process.env.AGENT_NAME || 'Worker';
    super(agentName);
    
    this.agentId = process.env.AGENT_ID || '';
    this.workerNumber = process.env.WORKER_NUMBER || '1';
    
    // 現在のタスク
    this.currentTask = null;
    
    // ClaudeExecutorServiceをインスタンス化（エージェント名を渡す）
    const database = new SQLiteDatabase();
    this.executor = new ClaudeExecutorService(database);
    
    // 永続的なセッションを作成
    this.session = new ClaudeSession(this.executor);
    console.log(`📂 [${this.agentName}] Persistent session initialized`);
    
    // Slackトークンを設定（環境変数またはglobalから）
    const slackBotToken = process.env.SLACK_BOT_TOKEN || (global as any).slackBotToken;
    const slackUserToken = process.env.SLACK_USER_TOKEN || (global as any).slackUserToken;
    const userId = process.env.SLACK_USER_ID || (global as any).currentUserId;
    
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
    
    // プロファイルとインストラクションのパス（後で設定）
    this.profilePath = '';
    this.instructionPath = '';
    
    console.log(`🤖 ${this.agentName} (${this.agentId}) is initializing...`);
    this.setupHandlers();
    
    // プロファイルを読み込む
    this.loadProfile();
    
    // CLAUDE.mdを読み込む
    this.loadMemory();
    
    // 初期化完了を通知
    this.sendReady();
  }
  
  /**
   * 初期化メソッド（サブクラスでオーバーライド可能）
   */
  async initialize(): Promise<void> {
    // BaseWorkerでは特に何もしない
    // サブクラスで必要に応じてオーバーライド
  }
  
  /**
   * MCPサーバーを初期化
   */
  initMCPServers(): void {
    try {
      this.executor.initializeMCPServers();
      this.log('info', '✅ MCP servers initialized successfully');
    } catch (error) {
      this.log('error', `❌ Failed to initialize MCP servers: ${(error as Error).message}`);
      // MCPが使えなくても続行（エラーはログに記録済み）
    }
  }
  
  /**
   * CLAUDE.mdを読み込む
   */
  async loadMemory(): Promise<void> {
    try {
      const userId = process.env.SLACK_USER_ID || process.env.CURRENT_USER_ID || (global as any).currentUserId || 'system';
      console.log(`📚 [${this.agentName}] Loading CLAUDE.md for userId: ${userId}`);
      const loadedMd = await loadClaudeMd(userId, this.agentName);
      this.claudeMd = loadedMd || '';
      
      if (this.claudeMd) {
        this.log('info', `📚 Loaded CLAUDE.md (${this.claudeMd.length} chars)`);
        
        // CLAUDE.mdの内容をシステムプロンプトに追加
        this.memoryContext = `\n## あなたの記憶（CLAUDE.md）\n${this.claudeMd}\n`;
      }
    } catch (error) {
      this.log('error', `Failed to load CLAUDE.md: ${(error as Error).message}`);
      this.memoryContext = '';
    }
  }
  
  /**
   * 学習内容をCLAUDE.mdに保存
   */
  async saveMemory(learning: string): Promise<void> {
    try {
      const userId = process.env.SLACK_USER_ID || process.env.CURRENT_USER_ID || (global as any).currentUserId || 'system';
      console.log(`💾 [${this.agentName}] Saving to CLAUDE.md for userId: ${userId}`);
      
      // 学習内容を追記
      await appendLearning(userId, this.agentName, learning);
      
      // 更新後のCLAUDE.mdを再読み込み
      await this.loadMemory();
      
      this.log('info', `💾 Saved learning to CLAUDE.md: ${learning}`);
    } catch (error) {
      this.log('error', `Failed to save to CLAUDE.md: ${(error as Error).message}`);
    }
  }
  
  /**
   * 準備完了を親に通知
   */
  sendReady(): void {
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
  setupHandlers(): void {
    // タスク割り当て
    this.on(MessageTypes.TASK_ASSIGN, async (payload) => {
      await this.handleTaskAssignment(payload);
    });
    
    // ステータス要求
    this.on(MessageTypes.STATUS_REQUEST, () => {
      this.sendStatusUpdate();
    });
    
    // 儀式開始
    this.on(MessageTypes.RITUAL_START, (payload) => {
      this.handleRitualStart(payload);
    });
  }
  
  /**
   * タスク割り当てを処理
   */
  async handleTaskAssignment(payload: any): Promise<void> {
    const { taskId, task } = payload;
    
    console.log(`📋 [${this.agentName}] Received task: ${task.originalRequest}`);
    this.currentTask = task;
    
    // ステータスを更新
    this.send(createStatusUpdateMessage(taskId, TaskStatus.IN_PROGRESS));
    
    try {
      // タスクを実行
      const result = await this.executeTask(task);
      
      // 完了を通知
      this.send(createTaskCompleteMessage(taskId, result));
      
      // 統計を更新
      this.stats.completedTasks++;
      this.updateTaskTypeStats(task);
      
      console.log(`✅ [${this.agentName}] Task completed: ${task.originalRequest}`);
      
    } catch (error) {
      console.error(`❌ [${this.agentName}] Task failed:`, error);
      
      // エラーを通知
      this.send(createErrorMessage(error as Error, taskId));
      
      // 統計を更新
      this.stats.failedTasks++;
    } finally {
      this.currentTask = null;
    }
  }
  
  /**
   * タスクを実行（子クラスでオーバーライド可能）
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    console.log(`🚀 [${this.agentName}] Executing task: ${task.originalRequest}`);
    
    try {
      // Worker固有のプロンプトを構築
      const workerPrompt = buildWorkerPrompt(
        this.agentName,
        this.profile,
        this.instruction,
        this.memoryContext
      );
      
      // ClaudeExecutorServiceで実行
      const result = await this.executor.executeGeneralRequest({
        type: 'general',
        reasoning: task.originalRequest,
        parameters: { 
          query: task.originalRequest
        },
        context: task.context || ''
      });
      
      // 成功時の学習
      await this.saveMemory(`タスク完了: ${task.originalRequest.substring(0, 50)}...`);
      
      return {
        success: true,
        output: result.result || 'Task completed',
        metadata: {
          executedBy: this.agentName,
          toolsUsed: result.toolsUsed || [],
          generatedFiles: result.generatedFiles || []
        }
      };
      
    } catch (error) {
      console.error(`❌ [${this.agentName}] Task execution error:`, error);
      
      return {
        success: false,
        output: `Error: ${(error as Error).message}`,
        metadata: {
          executedBy: this.agentName
        }
      };
    }
  }
  
  /**
   * ステータス更新を送信
   */
  sendStatusUpdate(): void {
    const status = this.currentTask ? 'busy' : 'idle';
    const progress = this.currentTask ? 50 : 0; // 仮の進捗
    
    this.send(createStatusUpdateMessage(
      this.currentTask?.id || 'none',
      status,
      progress
    ));
  }
  
  /**
   * 儀式開始を処理
   */
  handleRitualStart(payload: any): void {
    const { ritualType } = payload;
    console.log(`🙏 [${this.agentName}] Starting ritual: ${ritualType}`);
    // 具体的な儀式の実装は後で追加
  }
  
  /**
   * プロファイルを読み込む
   */
  async loadProfile(): Promise<void> {
    try {
      if (fsSync.existsSync(this.profilePath)) {
        const profileData = await fs.readFile(this.profilePath, 'utf-8');
        this.profile = JSON.parse(profileData);
        console.log(`📋 [${this.agentName}] Profile loaded:`, this.profile?.personality || 'Unknown');
      } else {
        console.log(`📋 [${this.agentName}] No profile found, using default`);
      }
    } catch (error) {
      console.error(`Failed to load profile:`, error);
    }
    
    try {
      if (fsSync.existsSync(this.instructionPath)) {
        this.instruction = await fs.readFile(this.instructionPath, 'utf-8');
        console.log(`📄 [${this.agentName}] Instructions loaded (${this.instruction.length} chars)`);
      }
    } catch (error) {
      console.error(`Failed to load instructions:`, error);
    }
  }
  
  /**
   * タスクタイプの統計を更新
   */
  updateTaskTypeStats(task: Task): void {
    const taskType = this.analyzeTaskType(task.originalRequest);
    this.stats.taskTypes[taskType] = (this.stats.taskTypes[taskType] || 0) + 1;
  }
  
  /**
   * タスクタイプを分析
   * @private
   */
  analyzeTaskType(request: string): string {
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes('アプリ') || lowerRequest.includes('app')) {
      return 'アプリ開発';
    } else if (lowerRequest.includes('修正') || lowerRequest.includes('fix')) {
      return 'バグ修正';
    } else if (lowerRequest.includes('デザイン') || lowerRequest.includes('ui')) {
      return 'デザイン';
    } else if (lowerRequest.includes('slack') || lowerRequest.includes('メッセージ')) {
      return 'コミュニケーション';
    }
    
    return '一般';
  }
  
  /**
   * クリーンアップ処理
   */
  async cleanup(): Promise<void> {
    console.log(`🧹 [${this.agentName}] Cleaning up...`);
    // 必要に応じてリソースのクリーンアップ
  }
}