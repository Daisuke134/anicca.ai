import { BaseWorker } from './BaseWorker';
import { fork, ChildProcess } from 'child_process';
import { Task, TaskResult, WorkerInfo, TaskAssignment, TaskInfo } from '../types';
import * as path from 'path';

/**
 * ParentAgent - タスクの割り振りと管理を行う司令塔
 */
export class ParentAgent extends BaseWorker {
  private workers: Map<string, WorkerInfo> = new Map();
  private tasks: Map<string, TaskInfo> = new Map();
  private maxWorkers = 5;
  
  constructor() {
    process.env.AGENT_NAME = 'ParentAgent';
    process.env.AGENT_ID = 'parent-agent';
    super();
    
    console.log(`👑 ${this.agentName} is initializing as the team leader...`);
  }

  async initialize() {
    try {
      await super.initialize();
      
      console.log(`👥 Spawning permanent worker team...`);
      for (let i = 1; i <= this.maxWorkers; i++) {
        await this.spawnWorker(`Worker${i}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`✅ ${this.agentName} initialization complete`);
      console.log(`👔 Team composition: ${this.workers.size} workers ready`);
    } catch (error) {
      console.error(`❌ ${this.agentName} initialization failed:`, error);
      process.exit(1);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    console.log(`📋 [${this.agentName}] Received main task: ${task.originalRequest}`);
    
    const startTime = Date.now();
    
    try {
      // 1. Worker状況を取得
      const workerStatus = this.getWorkerStatus();
      
      // 2. タスクを分析して割り当て
      const assignments = await this.analyzeAndAssignTasks({
        task: task.originalRequest,
        workers: workerStatus
      });
      
      // 3. 各タスクを並列実行
      const taskPromises = assignments.map(async (assignment, index) => {
        const subTaskId = `${task.id}-${index}`;
        const subTask: Task = {
          ...task,
          id: subTaskId,
          originalRequest: assignment.task
        };
        
        this.tasks.set(subTaskId, {
          task: subTask,
          assignedTo: assignment.worker,
          status: 'assigned'
        });
        
        await this.assignSpecificTaskToWorker(assignment.worker, subTask);
        return await this.waitForTaskCompletion(subTaskId);
      });
      
      // 4. 全タスクの完了を待つ
      const results = await Promise.all(taskPromises);
      
      // 5. 結果を統合
      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: successCount === results.length,
        output: `${successCount}/${results.length}個のタスクを完了しました`,
        metadata: {
          executedBy: this.agentName,
          normalTasks: assignments,
          taskCount: assignments.length,
          duration: duration
        }
      };
      
    } catch (error: any) {
      console.error(`❌ [${this.agentName}] Task execution error:`, error);
      throw error;
    }
  }

  private async spawnWorker(workerName: string): Promise<void> {
    const userId = process.env.SLACK_USER_ID || process.env.CURRENT_USER_ID || 'system';
    console.log(`🚀 [${this.agentName}] Spawning ${workerName} with userId: ${userId}`);
    
    // TypeScriptのWorker.tsを実行
    const workerPath = path.join(__dirname, 'Worker.js');
    const childProcess: ChildProcess = fork(workerPath, [], {
      env: {
        ...process.env,
        AGENT_ID: `worker-${workerName.toLowerCase()}`,
        AGENT_NAME: workerName,
        WORKER_NUMBER: workerName.replace('Worker', ''),
        SLACK_USER_ID: userId,
        CURRENT_USER_ID: userId
      }
    });
    
    const worker: WorkerInfo = {
      id: `worker-${workerName.toLowerCase()}`,
      name: workerName,
      process: childProcess,
      status: 'idle'
    };
    
    this.workers.set(worker.id, worker);
    
    childProcess.on('message', (message) => {
      this.handleWorkerMessage(worker.id, message);
    });
    
    childProcess.on('error', (error) => {
      console.error(`❌ [${this.agentName}] Worker ${workerName} error:`, error);
    });
    
    childProcess.on('exit', (code, signal) => {
      console.log(`👋 [${this.agentName}] Worker ${workerName} exited (code: ${code}, signal: ${signal})`);
      this.workers.delete(worker.id);
    });
  }

  private handleWorkerMessage(workerId: string, message: any) {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    
    console.log(`📨 [${this.agentName}] Message from ${worker.name}:`, message.type);
    
    switch (message.type) {
      case 'READY':
        console.log(`✅ ${worker.name} is ready`);
        worker.status = 'idle';
        break;
        
      case 'TASK_COMPLETE':
        const taskId = message.payload?.taskId;
        const taskInfo = this.tasks.get(taskId);
        if (taskInfo) {
          taskInfo.status = 'completed';
          taskInfo.result = message.payload?.result;
          worker.status = 'idle';
          console.log(`✅ [${this.agentName}] Task completed by ${worker.name}`);
        }
        break;
        
      case 'LOG':
        console.log(`📝 [${worker.name}] ${message.payload?.message}`);
        break;
    }
  }

  private getWorkerStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    for (const [workerId, worker] of this.workers) {
      status[worker.name] = worker.status;
    }
    return status;
  }

  private async analyzeAndAssignTasks(taskInfo: { task: string, workers: Record<string, string> }): Promise<TaskAssignment[]> {
    // 簡易的な実装：タスクを解析して複数のサブタスクに分割
    const task = taskInfo.task.toLowerCase();
    const assignments: TaskAssignment[] = [];
    
    // 複数のタスクが含まれているかチェック
    if (task.includes('同時に') || task.includes('と') || task.includes('、')) {
      // タスクを分割（簡易実装）
      const parts = task.split(/同時に|、|と/);
      const idleWorkers = Object.entries(taskInfo.workers)
        .filter(([name, status]) => status === 'idle')
        .map(([name]) => name);
      
      parts.forEach((part, index) => {
        if (part.trim() && idleWorkers[index]) {
          assignments.push({
            worker: idleWorkers[index],
            task: part.trim()
          });
        }
      });
    } else {
      // 単一タスクの場合
      const idleWorker = Object.entries(taskInfo.workers)
        .find(([name, status]) => status === 'idle');
      
      if (idleWorker) {
        assignments.push({
          worker: idleWorker[0],
          task: taskInfo.task
        });
      }
    }
    
    // デフォルト：最初のアイドルワーカーに割り当て
    if (assignments.length === 0) {
      const firstIdleWorker = Object.entries(taskInfo.workers)
        .find(([name, status]) => status === 'idle');
      
      if (firstIdleWorker) {
        assignments.push({
          worker: firstIdleWorker[0],
          task: taskInfo.task
        });
      }
    }
    
    console.log(`🎯 [${this.agentName}] Task assignments:`, assignments);
    return assignments;
  }

  private async assignSpecificTaskToWorker(workerName: string, task: Task): Promise<void> {
    const worker = Array.from(this.workers.values()).find(w => w.name === workerName);
    if (!worker) {
      throw new Error(`Worker ${workerName} not found`);
    }
    
    if (worker.process.send) {
      worker.process.send({
        type: 'TASK_ASSIGN',
        payload: {
          taskId: task.id,
          task: task
        },
        timestamp: Date.now()
      });
    }
    
    worker.status = 'busy';
    console.log(`🎯 [${this.agentName}] Assigned task to ${worker.name}: ${task.originalRequest.substring(0, 50)}...`);
  }

  private async waitForTaskCompletion(taskId: string): Promise<any> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const taskInfo = this.tasks.get(taskId);
        if (taskInfo && taskInfo.status === 'completed') {
          clearInterval(checkInterval);
          resolve(taskInfo.result || { success: true });
        }
      }, 1000);
      
      // タイムアウト設定（5分）
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({ success: false, error: 'Task timeout' });
      }, 300000);
    });
  }
}