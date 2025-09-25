import { TaskState } from "../types/data.js";
import { ProjectCreationSuccessData, ApproveTaskSuccessData, ApproveProjectSuccessData, OpenTaskSuccessData, ListProjectsSuccessData, ListTasksSuccessData, AddTasksSuccessData, DeleteTaskSuccessData, ReadProjectSuccessData, UpdateTaskSuccessData } from "../types/response.js";
export declare class TaskManager {
    private projectCounter;
    private taskCounter;
    private data;
    private fileSystemService;
    private initialized;
    constructor(testFilePath?: string);
    private loadTasks;
    private ensureInitialized;
    reloadFromDisk(): Promise<void>;
    private saveTasks;
    createProject(initialPrompt: string, tasks: {
        title: string;
        description: string;
        toolRecommendations?: string;
        ruleRecommendations?: string;
    }[], projectPlan?: string, autoApprove?: boolean): Promise<ProjectCreationSuccessData>;
    generateProjectPlan({ prompt, provider, model, attachments, }: {
        prompt: string;
        provider: string;
        model: string;
        attachments: string[];
    }): Promise<ProjectCreationSuccessData>;
    getNextTask(projectId: string): Promise<OpenTaskSuccessData | {
        message: string;
    }>;
    approveTaskCompletion(projectId: string, taskId: string): Promise<ApproveTaskSuccessData>;
    approveProjectCompletion(projectId: string): Promise<ApproveProjectSuccessData>;
    openTaskDetails(projectId: string, taskId: string): Promise<OpenTaskSuccessData>;
    listProjects(state?: TaskState): Promise<ListProjectsSuccessData>;
    listTasks(projectId?: string, state?: TaskState): Promise<ListTasksSuccessData>;
    addTasksToProject(projectId: string, tasks: {
        title: string;
        description: string;
        toolRecommendations?: string;
        ruleRecommendations?: string;
    }[]): Promise<AddTasksSuccessData>;
    updateTask(projectId: string, taskId: string, updates: {
        title?: string;
        description?: string;
        toolRecommendations?: string;
        ruleRecommendations?: string;
        status?: "not started" | "in progress" | "done";
        completedDetails?: string;
    }): Promise<UpdateTaskSuccessData>;
    deleteTask(projectId: string, taskId: string): Promise<DeleteTaskSuccessData>;
    readProject(projectId: string): Promise<ReadProjectSuccessData>;
}
