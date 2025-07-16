// ParallelSDK Type Definitions

export interface Task {
  id: string;
  originalRequest: string;
  context?: string;
  userId?: string;
  description?: string;
}

export interface TaskAssignment {
  worker: string;
  task: string;
}

export interface TaskInfo {
  task: Task;
  assignedTo: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed';
  result?: any;
}

export interface WorkerInfo {
  id: string;
  name: string;
  process: any; // Child process
  status: 'idle' | 'busy' | 'error';
}

export interface TaskResult {
  success: boolean;
  output: string;
  metadata?: {
    executedBy: string;
    taskType?: string;
    scheduledCount?: number;
    normalTasks?: TaskAssignment[];
    scheduledTasks?: TaskAssignment[];
    taskCount?: number;
    duration?: number;
    toolsUsed?: string[];
    generatedFiles?: string[];
    preview?: {
      previewUrl?: string;
    };
  };
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  metadata?: {
    executedBy: string;
    taskType?: string;
    scheduledCount?: number;
    normalTasks?: TaskAssignment[];
    scheduledTasks?: TaskAssignment[];
    taskCount?: number;
    duration?: number;
    toolsUsed?: string[];
    generatedFiles?: string[];
    preview?: {
      previewUrl?: string;
    };
  };
  previewUrl?: string;
  appId?: string;
}

export interface IPCMessage {
  type: string;
  payload?: any;
  timestamp: number;
}

export interface WorkerProfile {
  name: string;
  personality: string;
  strengths: string[];
  approach: string;
}

export interface ClaudeMemory {
  specialty?: string;
  learnings?: string[];
  completedTasks?: string[];
  userInfo?: Record<string, any>;
}