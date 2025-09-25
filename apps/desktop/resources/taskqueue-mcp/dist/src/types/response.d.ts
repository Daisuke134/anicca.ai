import { Task } from "./data.js";
export interface ProjectCreationSuccessData {
    projectId: string;
    totalTasks: number;
    tasks: Array<{
        id: string;
        title: string;
        description: string;
    }>;
    message: string;
}
export interface ApproveTaskSuccessData {
    projectId: string;
    task: {
        id: string;
        title: string;
        description: string;
        completedDetails: string;
        approved: boolean;
    };
}
export interface ApproveProjectSuccessData {
    projectId: string;
    message: string;
}
export interface OpenTaskSuccessData {
    projectId: string;
    task: Task;
}
export interface ListProjectsSuccessData {
    message: string;
    projects: Array<{
        projectId: string;
        initialPrompt: string;
        totalTasks: number;
        completedTasks: number;
        approvedTasks: number;
    }>;
}
export interface ListTasksSuccessData {
    message: string;
    tasks: Task[];
}
export interface AddTasksSuccessData {
    message: string;
    newTasks: Array<{
        id: string;
        title: string;
        description: string;
    }>;
}
export interface DeleteTaskSuccessData {
    message: string;
}
export interface ReadProjectSuccessData {
    projectId: string;
    initialPrompt: string;
    projectPlan: string;
    completed: boolean;
    autoApprove?: boolean;
    tasks: Task[];
}
export interface UpdateTaskSuccessData {
    task: Task;
    message?: string;
}
