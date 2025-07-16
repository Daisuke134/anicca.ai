/**
 * IPCProtocol - 親子エージェント間の通信プロトコル定義
 * 
 * Inter-Process Communication (IPC) を使用して、
 * ParentAgent（President）と子エージェント間でメッセージをやり取りする
 */

// メッセージタイプの定義
export const MessageTypes = {
  // 親→子
  TASK_ASSIGN: 'TASK_ASSIGN',           // タスクの割り当て
  TASK_CANCEL: 'TASK_CANCEL',           // タスクのキャンセル
  STATUS_REQUEST: 'STATUS_REQUEST',     // ステータス要求
  SHUTDOWN: 'SHUTDOWN',                 // シャットダウン指示
  RITUAL_START: 'RITUAL_START',         // 儀式（朝会、メッタ等）開始
  RITUAL_END: 'RITUAL_END',             // 儀式終了
  
  // 子→親
  READY: 'READY',                       // エージェント準備完了
  STATUS_UPDATE: 'STATUS_UPDATE',       // ステータス更新
  TASK_COMPLETE: 'TASK_COMPLETE',       // タスク完了
  TASK_FAILED: 'TASK_FAILED',           // タスク失敗
  ERROR: 'ERROR',                       // エラー報告
  LOG: 'LOG',                          // ログメッセージ
  VOICE_REQUEST: 'VOICE_REQUEST',       // 音声生成リクエスト
  SLACK_POST_REQUEST: 'SLACK_POST_REQUEST', // Slack投稿リクエスト
  
  // TodoManager専用
  TASK_LIST: 'TASK_LIST',              // 親→Todo: タスクリスト送信
  TASK_UPDATE: 'TASK_UPDATE',          // 親→Todo: タスク進捗更新
  ALL_TASKS_COMPLETE: 'ALL_TASKS_COMPLETE', // 親→Todo: 全タスク完了通知
  
  // 双方向
  HEARTBEAT: 'HEARTBEAT',              // 生存確認
  ACKNOWLEDGMENT: 'ACKNOWLEDGMENT'      // 受信確認
} as const;

// 儀式タイプの定義
export const RitualTypes = {
  MORNING_STANDUP: 'MORNING_STANDUP',   // 朝会
  METTA: 'METTA',                       // 慈悲の瞑想
  AFFIRMATION: 'AFFIRMATION'            // アファメーション
} as const;

// タスクステータスの定義
export const TaskStatus = {
  PENDING: 'pending',                   // 待機中
  ASSIGNED: 'assigned',                 // 割り当て済み
  IN_PROGRESS: 'in_progress',           // 実行中
  COMPLETED: 'completed',               // 完了
  FAILED: 'failed',                     // 失敗
  CANCELLED: 'cancelled'                // キャンセル
} as const;

// エージェントステータスの定義
export const AgentStatus = {
  INITIALIZING: 'initializing',         // 初期化中
  IDLE: 'idle',                         // アイドル
  BUSY: 'busy',                         // 作業中
  ERROR: 'error',                       // エラー状態
  SHUTTING_DOWN: 'shutting_down'        // シャットダウン中
} as const;

// 型定義
export interface IPCMessage {
  type: keyof typeof MessageTypes;
  payload?: any;
  timestamp: number;
  messageId: string;
}

export interface TaskAssignPayload {
  taskId: string;
  task: any;
  assignedAt: number;
}

export interface StatusUpdatePayload {
  taskId: string;
  status: string;
  progress: number | null;
  updatedAt: number;
}

export interface TaskCompletePayload {
  taskId: string;
  result: any;
  completedAt: number;
}

export interface ErrorPayload {
  taskId: string | null;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LogPayload {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata: Record<string, any>;
}

/**
 * メッセージフォーマットのヘルパー関数
 */
export const createMessage = (type: keyof typeof MessageTypes, payload: any = {}): IPCMessage => {
  return {
    type,
    payload,
    timestamp: Date.now(),
    messageId: generateMessageId()
  };
};

/**
 * タスク割り当てメッセージを作成
 */
export const createTaskAssignMessage = (taskId: string, task: any): IPCMessage => {
  return createMessage(MessageTypes.TASK_ASSIGN, {
    taskId,
    task,
    assignedAt: Date.now()
  });
};

/**
 * ステータス更新メッセージを作成
 */
export const createStatusUpdateMessage = (taskId: string, status: string, progress: number | null = null): IPCMessage => {
  return createMessage(MessageTypes.STATUS_UPDATE, {
    taskId,
    status,
    progress,
    updatedAt: Date.now()
  });
};

/**
 * タスク完了メッセージを作成
 */
export const createTaskCompleteMessage = (taskId: string, result: any): IPCMessage => {
  return createMessage(MessageTypes.TASK_COMPLETE, {
    taskId,
    result,
    completedAt: Date.now()
  });
};

/**
 * エラーメッセージを作成
 */
export const createErrorMessage = (error: Error, taskId: string | null = null): IPCMessage => {
  return createMessage(MessageTypes.ERROR, {
    taskId,
    error: {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    }
  });
};

/**
 * ログメッセージを作成
 */
export const createLogMessage = (level: LogPayload['level'], message: string, metadata: Record<string, any> = {}): IPCMessage => {
  return createMessage(MessageTypes.LOG, {
    level,
    message,
    metadata
  });
};

/**
 * 音声リクエストメッセージを作成
 */
export const createVoiceRequestMessage = (text: string, voiceId: string | null = null): IPCMessage => {
  return createMessage(MessageTypes.VOICE_REQUEST, {
    text,
    voiceId,
    requestedAt: Date.now()
  });
};

/**
 * Slack投稿リクエストメッセージを作成
 */
export const createSlackPostMessage = (channel: string, message: string, options: Record<string, any> = {}): IPCMessage => {
  return createMessage(MessageTypes.SLACK_POST_REQUEST, {
    channel,
    message,
    options,
    requestedAt: Date.now()
  });
};

/**
 * 儀式開始メッセージを作成
 */
export const createRitualStartMessage = (ritualType: keyof typeof RitualTypes, participants: string[] = []): IPCMessage => {
  return createMessage(MessageTypes.RITUAL_START, {
    ritualType,
    participants,
    startedAt: Date.now()
  });
};

/**
 * メッセージバリデーション
 */
export const validateMessage = (message: any): { valid: boolean; error?: string } => {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }
  
  if (!message.type || !Object.values(MessageTypes).includes(message.type)) {
    return { valid: false, error: 'Invalid message type' };
  }
  
  if (!message.timestamp || typeof message.timestamp !== 'number') {
    return { valid: false, error: 'Invalid timestamp' };
  }
  
  return { valid: true };
};

/**
 * メッセージIDを生成
 * @private
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * IPCメッセージハンドラーの基底クラス
 * 各エージェントはこれを継承して使用
 */
export class IPCHandler {
  protected agentName: string;
  private messageHandlers: Map<string, (payload: any, message: IPCMessage) => Promise<void> | void>;
  
  constructor(agentName: string) {
    this.agentName = agentName;
    this.messageHandlers = new Map();
    this.setupDefaultHandlers();
  }
  
  /**
   * デフォルトのハンドラーを設定
   * @private
   */
  private setupDefaultHandlers(): void {
    // ハートビート
    this.on(MessageTypes.HEARTBEAT, () => {
      this.send(createMessage(MessageTypes.HEARTBEAT, { 
        agentName: this.agentName,
        status: 'alive' 
      }));
    });
    
    // シャットダウン
    this.on(MessageTypes.SHUTDOWN, async () => {
      console.log(`${this.agentName} received shutdown signal`);
      await this.cleanup();
      process.exit(0);
    });
  }
  
  /**
   * メッセージハンドラーを登録
   */
  on(messageType: keyof typeof MessageTypes, handler: (payload: any, message: IPCMessage) => Promise<void> | void): void {
    this.messageHandlers.set(messageType, handler);
  }
  
  /**
   * メッセージを処理
   */
  async handleMessage(message: any): Promise<void> {
    const validation = validateMessage(message);
    if (!validation.valid) {
      console.error(`Invalid message received: ${validation.error}`, message);
      return;
    }
    
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      try {
        await handler(message.payload, message);
      } catch (error) {
        console.error(`Error handling message ${message.type}:`, error);
        this.send(createErrorMessage(error as Error));
      }
    } else {
      console.warn(`No handler for message type: ${message.type}`);
    }
  }
  
  /**
   * メッセージを送信
   */
  send(message: IPCMessage): void {
    if (process.send) {
      process.send(message);
    } else {
      console.error('Not running as child process, cannot send message');
    }
  }
  
  /**
   * ログを送信
   */
  log(level: LogPayload['level'], message: string, metadata: Record<string, any> = {}): void {
    this.send(createLogMessage(level, message, metadata));
  }
  
  /**
   * クリーンアップ処理（オーバーライド可能）
   */
  async cleanup(): Promise<void> {
    // 子クラスでオーバーライド
  }
  
  /**
   * プロセスメッセージリスナーを開始
   */
  startListening(): void {
    process.on('message', (message) => {
      this.handleMessage(message);
    });
    
    // エラーハンドリング
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.send(createErrorMessage(error));
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.send(createErrorMessage(new Error(`Unhandled rejection: ${reason}`)));
    });
    
    // 準備完了を通知
    this.send(createMessage(MessageTypes.READY, {
      agentName: this.agentName,
      pid: process.pid
    }));
  }
}