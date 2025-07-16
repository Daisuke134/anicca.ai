import { IPCHandler, MessageTypes, TaskStatus, createStatusUpdateMessage, createTaskCompleteMessage, createErrorMessage } from './IPCProtocol';
import { Task, TaskResult } from './types';
import { ClaudeExecutorService } from '../claudeExecutorService';
import { SQLiteDatabase } from '../sqliteDatabase';

/**
 * BaseWorker - すべてのWorkerエージェントの基底クラス
 */
export class BaseWorker extends IPCHandler {
  protected agentId: string;
  protected workerNumber: string;
  protected executor: ClaudeExecutorService;
  protected database: SQLiteDatabase;
  protected currentTask: any = null;
  protected stats = {
    completedTasks: 0,
    failedTasks: 0,
    taskTypes: {} as Record<string, number>
  };

  constructor() {
    const agentName = process.env.AGENT_NAME || 'Worker';
    super(agentName);
    
    this.agentId = process.env.AGENT_ID || '';
    this.workerNumber = process.env.WORKER_NUMBER || '1';
    
    // Initialize database and executor
    this.database = new SQLiteDatabase();
    this.executor = new ClaudeExecutorService(this.database);
    
    console.log(`🤖 ${this.agentName} (${this.agentId}) is initializing...`);
    this.setupHandlers();
    this.sendReady();
  }

  async initialize() {
    await this.database.init();
    console.log(`✅ ${this.agentName} initialized`);
  }

  private setupHandlers() {
    this.on(MessageTypes.TASK_ASSIGN, async (payload: any) => {
      await this.handleTaskAssignment(payload);
    });
    
    this.on(MessageTypes.STATUS_REQUEST, () => {
      this.reportStatus();
    });
  }

  private sendReady() {
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

  private async handleTaskAssignment(payload: any) {
    const { taskId, task } = payload;
    
    this.log('info', `Received task ${taskId}: ${task.originalRequest}`);
    this.currentTask = { taskId, task, startTime: Date.now() };
    
    this.send(createStatusUpdateMessage(taskId, TaskStatus.IN_PROGRESS, 0));
    
    try {
      const result = await this.executeTask(task);
      
      this.stats.completedTasks++;
      const taskType = task.type || 'general';
      this.stats.taskTypes[taskType] = (this.stats.taskTypes[taskType] || 0) + 1;
      
      this.send(createTaskCompleteMessage(taskId, result));
      this.log('info', `Task ${taskId} completed successfully`);
      
    } catch (error: any) {
      this.stats.failedTasks++;
      this.send(createErrorMessage(error, taskId));
      this.log('error', `Task ${taskId} failed: ${error.message}`);
    } finally {
      this.currentTask = null;
    }
  }

  protected async executeTask(task: Task): Promise<TaskResult> {
    this.log('info', `Executing task: ${task.originalRequest}`);
    
    try {
      // Execute with ClaudeExecutorService
      const result = await this.executor.executeAction({
        type: 'general',
        reasoning: task.originalRequest,
        parameters: {
          query: task.originalRequest
        },
        context: task.context || ''
      });
      
      return {
        success: true,
        output: result.result || 'Task completed',
        metadata: {
          executedBy: this.agentName,
          duration: Date.now() - (this.currentTask?.startTime || Date.now()),
          toolsUsed: result.toolsUsed,
          generatedFiles: result.generatedFiles
        }
      };
      
    } catch (error: any) {
      throw new Error(`Task execution failed: ${error.message}`);
    }
  }

  private reportStatus() {
    const status = {
      agentId: this.agentId,
      agentName: this.agentName,
      isExecuting: !!this.currentTask,
      stats: this.stats
    };
    
    this.send(createStatusUpdateMessage(
      this.currentTask?.taskId || null,
      this.currentTask ? TaskStatus.IN_PROGRESS : 'idle',
      null
    ));
  }

  async cleanup() {
    this.log('info', 'Shutting down...');
    
    if (this.currentTask) {
      this.send(createErrorMessage(
        new Error('Agent shutting down'),
        this.currentTask.taskId
      ));
    }
  }
}