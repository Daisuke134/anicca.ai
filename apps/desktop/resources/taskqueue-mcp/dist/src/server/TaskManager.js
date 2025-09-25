import * as path from "node:path";
import { AppError, AppErrorCode } from "../types/errors.js";
import { FileSystemService } from "./FileSystemService.js";
import { generateObject, jsonSchema } from "ai";
// Default path follows platform-specific conventions
const DEFAULT_PATH = path.join(FileSystemService.getAppDataDir(), "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;
export class TaskManager {
    projectCounter = 0;
    taskCounter = 0;
    data = { projects: [] };
    fileSystemService;
    initialized;
    constructor(testFilePath) {
        this.fileSystemService = new FileSystemService(testFilePath || TASK_FILE_PATH);
        this.initialized = this.loadTasks().catch(error => {
            console.error('Failed to initialize TaskManager:', error);
            // Set default values for failed initialization
            this.data = { projects: [] };
            this.projectCounter = 0;
            this.taskCounter = 0;
        });
    }
    async loadTasks() {
        try {
            const { data, maxProjectId, maxTaskId } = await this.fileSystemService.loadAndInitializeTasks();
            this.data = data;
            this.projectCounter = maxProjectId;
            this.taskCounter = maxTaskId;
        }
        catch (error) {
            // Propagate the error to be handled by the constructor
            throw new AppError('Failed to load tasks from disk', AppErrorCode.FileReadError, error);
        }
    }
    async ensureInitialized() {
        try {
            await this.initialized;
        }
        catch (error) {
            // If initialization failed, throw an AppError that can be handled by the tool executor
            throw new AppError('Failed to initialize task manager', AppErrorCode.FileReadError, error);
        }
    }
    async reloadFromDisk() {
        try {
            const data = await this.fileSystemService.reloadTasks();
            this.data = data;
            const { maxProjectId, maxTaskId } = this.fileSystemService.calculateMaxIds(data);
            this.projectCounter = maxProjectId;
            this.taskCounter = maxTaskId;
        }
        catch (error) {
            // Propagate as AppError to be handled by the tool executor
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to reload tasks from disk', AppErrorCode.FileReadError, error);
        }
    }
    async saveTasks() {
        await this.fileSystemService.saveTasks(this.data);
    }
    async createProject(initialPrompt, tasks, projectPlan, autoApprove) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        this.projectCounter += 1;
        const projectId = `proj-${this.projectCounter}`;
        const newTasks = [];
        for (const taskDef of tasks) {
            this.taskCounter += 1;
            newTasks.push({
                id: `task-${this.taskCounter}`,
                title: taskDef.title,
                description: taskDef.description,
                status: "not started",
                approved: false,
                completedDetails: "",
                toolRecommendations: taskDef.toolRecommendations,
                ruleRecommendations: taskDef.ruleRecommendations,
            });
        }
        const newProject = {
            projectId,
            initialPrompt,
            projectPlan: projectPlan || initialPrompt,
            tasks: newTasks,
            completed: false,
            autoApprove: autoApprove === false ? false : true,
        };
        this.data.projects.push(newProject);
        await this.saveTasks();
        return {
            projectId,
            totalTasks: newTasks.length,
            tasks: newTasks.map((t) => ({
                id: t.id,
                title: t.title,
                description: t.description,
            })),
            message: `Project ${projectId} created with ${newTasks.length} tasks.`,
        };
    }
    async generateProjectPlan({ prompt, provider, model, attachments, }) {
        await this.ensureInitialized();
        // Read all attachment files
        const attachmentContents = [];
        for (const filename of attachments) {
            try {
                const content = await this.fileSystemService.readAttachmentFile(filename);
                attachmentContents.push(content);
            }
            catch (error) {
                throw new AppError(`Failed to read attachment file: ${filename}`, AppErrorCode.FileReadError, error);
            }
        }
        // Define the schema for the LLM's response using jsonSchema helper
        const projectPlanSchema = jsonSchema({
            type: "object",
            properties: {
                projectPlan: { type: "string" },
                tasks: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            toolRecommendations: { type: "string" },
                            ruleRecommendations: { type: "string" },
                        },
                        required: ["title", "description"],
                    },
                },
            },
            required: ["tasks"],
        });
        // Wrap prompt and attachments in XML tags
        let llmPrompt = `<prompt>${prompt}</prompt>`;
        llmPrompt += `\n<outputFormat>Return your output as JSON formatted according to the following schema: ${JSON.stringify(projectPlanSchema, null, 2)}</outputFormat>`;
        for (const content of attachmentContents) {
            llmPrompt += `\n<attachment>${content}</attachment>`;
        }
        // Import and configure the appropriate provider
        let modelProvider;
        switch (provider) {
            case "openai":
                const { openai } = await import("@ai-sdk/openai");
                modelProvider = openai(model);
                break;
            case "google":
                const { google } = await import("@ai-sdk/google");
                modelProvider = google(model);
                break;
            case "deepseek":
                const { deepseek } = await import("@ai-sdk/deepseek");
                modelProvider = deepseek(model);
                break;
            default:
                throw new AppError(`Invalid provider: ${provider}`, AppErrorCode.InvalidProvider);
        }
        try {
            const { object } = await generateObject({
                model: modelProvider,
                schema: projectPlanSchema,
                prompt: llmPrompt,
            });
            return await this.createProject(prompt, object.tasks, object.projectPlan);
        }
        catch (err) {
            if (err.name === 'LoadAPIKeyError' ||
                err.message.includes('API key is missing') ||
                err.message.includes('You didn\'t provide an API key') ||
                err.message.includes('unregistered callers') ||
                (err.responseBody && err.responseBody.includes('Authentication Fails'))) {
                throw new AppError(`Missing API key environment variable required for ${provider}`, AppErrorCode.ConfigurationError, err);
            }
            // Check for invalid model errors by looking at the error code, type, and message
            if ((err.data?.error?.code === 'model_not_found') &&
                err.message.includes('model')) {
                throw new AppError(`Invalid model: ${model} is not available for ${provider}`, AppErrorCode.InvalidModel, err);
            }
            // For unknown errors, preserve the original error but wrap it
            throw new AppError("Failed to generate project plan due to an unexpected error", AppErrorCode.LLMGenerationError, err);
        }
    }
    async getNextTask(projectId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        if (proj.completed) {
            throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
        }
        if (!proj.tasks.length) {
            throw new AppError('Project has no tasks', AppErrorCode.TaskNotFound);
        }
        const nextTask = proj.tasks.find((t) => !(t.status === "done" && t.approved));
        if (!nextTask) {
            // all tasks done and approved?
            const allDoneAndApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
            if (allDoneAndApproved && !proj.completed) {
                return {
                    message: `All tasks have been completed and approved. Awaiting project completion approval.`
                };
            }
            throw new AppError('No incomplete or unapproved tasks found', AppErrorCode.TaskNotFound);
        }
        return {
            projectId: proj.projectId,
            task: { ...nextTask },
        };
    }
    async approveTaskCompletion(projectId, taskId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        const task = proj.tasks.find((t) => t.id === taskId);
        if (!task) {
            throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
        }
        if (task.status !== "done") {
            throw new AppError('Task not done yet', AppErrorCode.TaskNotDone);
        }
        if (task.approved) {
            throw new AppError('Task is already approved', AppErrorCode.TaskAlreadyApproved);
        }
        task.approved = true;
        await this.saveTasks();
        return {
            projectId: proj.projectId,
            task: {
                id: task.id,
                title: task.title,
                description: task.description,
                completedDetails: task.completedDetails,
                approved: task.approved,
            },
        };
    }
    async approveProjectCompletion(projectId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        if (proj.completed) {
            throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
        }
        const allDone = proj.tasks.every((t) => t.status === "done");
        if (!allDone) {
            throw new AppError('Not all tasks are done', AppErrorCode.TasksNotAllDone);
        }
        const allApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
        if (!allApproved) {
            throw new AppError('Not all done tasks are approved', AppErrorCode.TasksNotAllApproved);
        }
        proj.completed = true;
        await this.saveTasks();
        return {
            projectId: proj.projectId,
            message: "Project is fully completed and approved.",
        };
    }
    async openTaskDetails(projectId, taskId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const project = this.data.projects.find((p) => p.projectId === projectId);
        if (!project) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        const target = project.tasks.find((t) => t.id === taskId);
        if (!target) {
            throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
        }
        return {
            projectId: project.projectId,
            task: { ...target },
        };
    }
    async listProjects(state) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        if (state && !["all", "open", "completed", "pending_approval"].includes(state)) {
            throw new AppError(`Invalid state filter: ${state}`, AppErrorCode.InvalidState);
        }
        let filteredProjects = [...this.data.projects];
        if (state && state !== "all") {
            filteredProjects = filteredProjects.filter((p) => {
                switch (state) {
                    case "open":
                        return !p.completed;
                    case "completed":
                        return p.completed;
                    case "pending_approval":
                        return !p.completed && p.tasks.every((t) => t.status === "done");
                    default:
                        return true;
                }
            });
        }
        return {
            message: `Current projects in the system:`,
            projects: filteredProjects.map((p) => ({
                projectId: p.projectId,
                initialPrompt: p.initialPrompt,
                totalTasks: p.tasks.length,
                completedTasks: p.tasks.filter((t) => t.status === "done").length,
                approvedTasks: p.tasks.filter((t) => t.approved).length,
            })),
        };
    }
    async listTasks(projectId, state) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        if (state && !["all", "open", "completed", "pending_approval"].includes(state)) {
            throw new AppError(`Invalid state filter: ${state}`, AppErrorCode.InvalidState);
        }
        let allTasks = [];
        if (projectId) {
            const proj = this.data.projects.find((p) => p.projectId === projectId);
            if (!proj) {
                throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
            }
            allTasks = [...proj.tasks];
        }
        else {
            // Collect tasks from all projects
            allTasks = this.data.projects.flatMap((p) => p.tasks);
        }
        if (state && state !== "all") {
            allTasks = allTasks.filter((task) => {
                switch (state) {
                    case "open":
                        return !task.approved;
                    case "completed":
                        return task.status === "done" && task.approved;
                    case "pending_approval":
                        return task.status === "done" && !task.approved;
                    default:
                        return true;
                }
            });
        }
        return {
            message: `Tasks in the system${projectId ? ` for project ${projectId}` : ""}:\n${allTasks.length} tasks found.`,
            tasks: allTasks,
        };
    }
    async addTasksToProject(projectId, tasks) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        if (proj.completed) {
            throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
        }
        const newTasks = [];
        for (const taskDef of tasks) {
            this.taskCounter += 1;
            const newTask = {
                id: `task-${this.taskCounter}`,
                title: taskDef.title,
                description: taskDef.description,
                status: "not started",
                approved: false,
                completedDetails: "",
                toolRecommendations: taskDef.toolRecommendations,
                ruleRecommendations: taskDef.ruleRecommendations,
            };
            newTasks.push(newTask);
            proj.tasks.push(newTask);
        }
        await this.saveTasks();
        return {
            newTasks: newTasks.map((t) => ({
                id: t.id,
                title: t.title,
                description: t.description,
            })),
            message: `Added ${newTasks.length} tasks to project ${projectId}`,
        };
    }
    async updateTask(projectId, taskId, updates) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        if (proj.completed) {
            throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
        }
        const task = proj.tasks.find((t) => t.id === taskId);
        if (!task) {
            throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
        }
        if (task.approved) {
            throw new AppError('Cannot modify an approved task', AppErrorCode.CannotModifyApprovedTask);
        }
        // Apply updates
        Object.assign(task, updates);
        // Generate message if needed
        let message = undefined;
        if (updates.status === 'done' && proj.autoApprove === false) {
            message = `Task marked as done but requires human approval.\nTo approve, user should run: npx taskqueue approve-task -- ${projectId} ${taskId}`;
        }
        await this.saveTasks();
        return { task, message };
    }
    async deleteTask(projectId, taskId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const proj = this.data.projects.find((p) => p.projectId === projectId);
        if (!proj) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        if (proj.completed) {
            throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
        }
        const taskIndex = proj.tasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1) {
            throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
        }
        const task = proj.tasks[taskIndex];
        if (task.approved) {
            throw new AppError('Cannot delete an approved task', AppErrorCode.CannotModifyApprovedTask);
        }
        proj.tasks.splice(taskIndex, 1);
        await this.saveTasks();
        return {
            message: `Task ${taskId} deleted from project ${projectId}`,
        };
    }
    async readProject(projectId) {
        await this.ensureInitialized();
        await this.reloadFromDisk();
        const project = this.data.projects.find((p) => p.projectId === projectId);
        if (!project) {
            throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
        }
        return {
            projectId: project.projectId,
            initialPrompt: project.initialPrompt,
            projectPlan: project.projectPlan,
            completed: project.completed,
            autoApprove: project.autoApprove,
            tasks: project.tasks,
        };
    }
}
//# sourceMappingURL=TaskManager.js.map