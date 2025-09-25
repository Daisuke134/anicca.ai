export interface Task {
    id: string;
    title: string;
    description: string;
    status: "not started" | "in progress" | "done";
    approved: boolean;
    completedDetails: string;
    toolRecommendations?: string;
    ruleRecommendations?: string;
}
export interface Project {
    projectId: string;
    initialPrompt: string;
    projectPlan: string;
    tasks: Task[];
    completed: boolean;
    autoApprove?: boolean;
}
export interface TaskManagerFile {
    projects: Project[];
}
export declare const VALID_STATUS_TRANSITIONS: {
    readonly "not started": readonly ["in progress"];
    readonly "in progress": readonly ["done", "not started"];
    readonly done: readonly ["in progress"];
};
export type TaskState = "open" | "pending_approval" | "completed" | "all";
