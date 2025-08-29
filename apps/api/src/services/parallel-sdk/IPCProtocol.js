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
  USER_RESPONSE: 'USER_RESPONSE',       // ユーザー応答の転送
  
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
};

// 儀式タイプの定義
export const RitualTypes = {
  MORNING_STANDUP: 'MORNING_STANDUP',   // 朝会
  METTA: 'METTA',                       // 慈悲の瞑想
  AFFIRMATION: 'AFFIRMATION'            // アファメーション
};

// タスクステータスの定義
export const TaskStatus = {
  PENDING: 'pending',                   // 待機中
  ASSIGNED: 'assigned',                 // 割り当て済み
  IN_PROGRESS: 'in_progress',           // 実行中
  COMPLETED: 'completed',               // 完了
  FAILED: 'failed',                     // 失敗
  CANCELLED: 'cancelled'                // キャンセル
};

// エージェントステータスの定義
export const AgentStatus = {
  INITIALIZING: 'initializing',         // 初期化中
  IDLE: 'idle',                         // アイドル
  BUSY: 'busy',                         // 作業中
  ERROR: 'error',                       // エラー状態
  SHUTTING_DOWN: 'shutting_down'        // シャットダウン中
};

/**
 * メッセージフォーマットのヘルパー関数
 */
export const createMessage = (type, payload = {}) => {
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
export const createTaskAssignMessage = (taskId, task) => {
  return createMessage(MessageTypes.TASK_ASSIGN, {
    taskId,
    task,
    assignedAt: Date.now()
  });
};

/**
 * ステータス更新メッセージを作成
 */
export const createStatusUpdateMessage = (taskId, status, progress = null) => {
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
export const createTaskCompleteMessage = (taskId, result) => {
  return createMessage(MessageTypes.TASK_COMPLETE, {
    taskId,
    result,
    completedAt: Date.now()
  });
};

/**
 * エラーメッセージを作成
 */
export const createErrorMessage = (error, taskId = null) => {
  return createMessage(MessageTypes.ERROR, {
    taskId,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code
    }
  });
};

/**
 * ログメッセージを作成
 */
export const createLogMessage = (level, message, metadata = {}) => {
  return createMessage(MessageTypes.LOG, {
    level, // 'info', 'warn', 'error', 'debug'
    message,
    metadata
  });
};

/**
 * 音声リクエストメッセージを作成
 */
export const createVoiceRequestMessage = (text, voiceId = null) => {
  return createMessage(MessageTypes.VOICE_REQUEST, {
    text,
    voiceId,
    requestedAt: Date.now()
  });
};

/**
 * Slack投稿リクエストメッセージを作成
 */
export const createSlackPostMessage = (channel, message, options = {}) => {
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
export const createRitualStartMessage = (ritualType, participants = []) => {
  return createMessage(MessageTypes.RITUAL_START, {
    ritualType,
    participants,
    startedAt: Date.now()
  });
};

/**
 * メッセージバリデーション
 */
export const validateMessage = (message) => {
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
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * IPCメッセージハンドラーの基底クラス
 * 各エージェントはこれを継承して使用
 */
export class IPCHandler {
  constructor(agentName) {
    this.agentName = agentName;
    this.messageHandlers = new Map();
    this.setupDefaultHandlers();
  }
  
  /**
   * デフォルトのハンドラーを設定
   * @private
   */
  setupDefaultHandlers() {
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
  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }
  
  /**
   * メッセージを処理
   */
  async handleMessage(message) {
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
        this.send(createErrorMessage(error));
      }
    } else {
      console.warn(`No handler for message type: ${message.type}`);
    }
  }
  
  /**
   * メッセージを送信
   */
  send(message) {
    if (process.send) {
      process.send(message);
    } else {
      console.error('Not running as child process, cannot send message');
    }
  }
  
  /**
   * ログを送信
   */
  log(level, message, metadata = {}) {
    this.send(createLogMessage(level, message, metadata));
  }
  
  /**
   * クリーンアップ処理（オーバーライド可能）
   */
  async cleanup() {
    // 子クラスでオーバーライド
  }
  
  /**
   * プロセスメッセージリスナーを開始
   */
  startListening() {
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