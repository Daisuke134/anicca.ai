import { AppError, AppErrorCode } from "../types/errors.js";
// ---------------------- UTILITY FUNCTIONS ----------------------
/**
 * Throws an AppError if a required parameter is not present or not a string.
 */
function validateRequiredStringParam(param, paramName) {
    if (typeof param !== "string" || !param) {
        throw new AppError(`Invalid or missing required parameter: ${paramName} (Expected string)`, AppErrorCode.MissingParameter);
    }
    return param;
}
/**
 * Validates that a project ID parameter exists and is a string.
 */
function validateProjectId(projectId) {
    return validateRequiredStringParam(projectId, "projectId");
}
/**
 * Validates that a task ID parameter exists and is a string.
 */
function validateTaskId(taskId) {
    return validateRequiredStringParam(taskId, "taskId");
}
/**
 * Throws an AppError if tasks is not defined or not an array.
 */
function validateTaskList(tasks) {
    if (!Array.isArray(tasks)) {
        throw new AppError("Invalid or missing required parameter: tasks (Expected array)", AppErrorCode.InvalidArgument);
    }
}
/**
 * Validates an optional "state" parameter against the allowed states.
 */
function validateOptionalStateParam(state, validStates) {
    if (state === undefined)
        return undefined;
    if (typeof state === "string" && validStates.includes(state))
        return state;
    throw new AppError(`Invalid state parameter. Must be one of: ${validStates.join(", ")}`, AppErrorCode.InvalidState);
}
/**
 * Validates an array of task objects, ensuring each has required fields.
 */
function validateTaskObjects(tasks, errorPrefix) {
    validateTaskList(tasks);
    const taskArray = tasks;
    return taskArray.map((task, index) => {
        if (!task || typeof task !== "object") {
            throw new AppError(`${errorPrefix || "Task"} at index ${index} must be an object`, AppErrorCode.InvalidArgument);
        }
        const t = task;
        const title = validateRequiredStringParam(t.title, `title in task at index ${index}`);
        const description = validateRequiredStringParam(t.description, `description in task at index ${index}`);
        return {
            title,
            description,
            toolRecommendations: t.toolRecommendations ? String(t.toolRecommendations) : undefined,
            ruleRecommendations: t.ruleRecommendations ? String(t.ruleRecommendations) : undefined,
        };
    });
}
// ---------------------- TOOL EXECUTOR MAP ----------------------
export const toolExecutorMap = new Map();
// ---------------------- TOOL EXECUTORS ----------------------
/**
 * Tool executor for listing projects with optional state filtering
 */
const listProjectsToolExecutor = {
    name: "list_projects",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const state = validateOptionalStateParam(args.state, [
            "open",
            "pending_approval",
            "completed",
            "all",
        ]);
        // 2. Core Logic Execution
        const resultData = await taskManager.listProjects(state);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(listProjectsToolExecutor.name, listProjectsToolExecutor);
/**
 * Tool executor for creating new projects with tasks
 */
const createProjectToolExecutor = {
    name: "create_project",
    async execute(taskManager, args) {
        const initialPrompt = validateRequiredStringParam(args.initialPrompt, "initialPrompt");
        const validatedTasks = validateTaskObjects(args.tasks);
        const projectPlan = args.projectPlan !== undefined ? String(args.projectPlan) : undefined;
        const autoApprove = args.autoApprove;
        if (args.projectPlan !== undefined && typeof args.projectPlan !== 'string') {
            throw new AppError("Invalid type for optional parameter 'projectPlan' (Expected string)", AppErrorCode.InvalidArgument);
        }
        if (args.autoApprove !== undefined && typeof args.autoApprove !== 'boolean') {
            throw new AppError("Invalid type for optional parameter 'autoApprove' (Expected boolean)", AppErrorCode.InvalidArgument);
        }
        const resultData = await taskManager.createProject(initialPrompt, validatedTasks, projectPlan, autoApprove);
        return resultData;
    },
};
toolExecutorMap.set(createProjectToolExecutor.name, createProjectToolExecutor);
/**
 * Tool executor for generating project plans using an LLM
 */
const generateProjectPlanToolExecutor = {
    name: "generate_project_plan",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const prompt = validateRequiredStringParam(args.prompt, "prompt");
        const provider = validateRequiredStringParam(args.provider, "provider");
        const model = validateRequiredStringParam(args.model, "model");
        // Validate optional attachments
        let attachments = [];
        if (args.attachments !== undefined) {
            if (!Array.isArray(args.attachments)) {
                throw new AppError("Invalid attachments: must be an array of strings", AppErrorCode.InvalidArgument);
            }
            attachments = args.attachments.map((att, index) => {
                if (typeof att !== "string") {
                    throw new AppError(`Invalid attachment at index ${index}: must be a string`, AppErrorCode.InvalidArgument);
                }
                return att;
            });
        }
        // 2. Core Logic Execution
        const resultData = await taskManager.generateProjectPlan({
            prompt,
            provider,
            model,
            attachments,
        });
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(generateProjectPlanToolExecutor.name, generateProjectPlanToolExecutor);
/**
 * Tool executor for getting the next task in a project
 */
const getNextTaskToolExecutor = {
    name: "get_next_task",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        // 2. Core Logic Execution
        const resultData = await taskManager.getNextTask(projectId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(getNextTaskToolExecutor.name, getNextTaskToolExecutor);
/**
 * Tool executor for updating a task
 */
const updateTaskToolExecutor = {
    name: "update_task",
    async execute(taskManager, args) {
        const projectId = validateProjectId(args.projectId);
        const taskId = validateTaskId(args.taskId);
        const updates = {};
        if (args.title !== undefined) {
            updates.title = validateRequiredStringParam(args.title, "title");
        }
        if (args.description !== undefined) {
            updates.description = validateRequiredStringParam(args.description, "description");
        }
        if (args.toolRecommendations !== undefined) {
            if (typeof args.toolRecommendations !== "string") {
                throw new AppError("Invalid toolRecommendations: must be a string", AppErrorCode.InvalidArgument);
            }
            updates.toolRecommendations = args.toolRecommendations;
        }
        if (args.ruleRecommendations !== undefined) {
            if (typeof args.ruleRecommendations !== "string") {
                throw new AppError("Invalid ruleRecommendations: must be a string", AppErrorCode.InvalidArgument);
            }
            updates.ruleRecommendations = args.ruleRecommendations;
        }
        if (args.status !== undefined) {
            const status = args.status;
            if (typeof status !== "string" ||
                !["not started", "in progress", "done"].includes(status)) {
                throw new AppError("Invalid status: must be one of 'not started', 'in progress', 'done'", AppErrorCode.InvalidArgument);
            }
            if (status === "done") {
                updates.completedDetails = validateRequiredStringParam(args.completedDetails, "completedDetails (required when status = 'done')");
            }
            updates.status = status;
        }
        const resultData = await taskManager.updateTask(projectId, taskId, updates);
        return resultData;
    },
};
toolExecutorMap.set(updateTaskToolExecutor.name, updateTaskToolExecutor);
/**
 * Tool executor for reading project details
 */
const readProjectToolExecutor = {
    name: "read_project",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        // 2. Core Logic Execution
        const resultData = await taskManager.readProject(projectId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(readProjectToolExecutor.name, readProjectToolExecutor);
/**
 * Tool executor for deleting projects
 */
const deleteProjectToolExecutor = {
    name: "delete_project",
    async execute(taskManager, args) {
        const projectId = validateProjectId(args.projectId);
        const projectIndex = taskManager["data"].projects.findIndex((p) => p.projectId === projectId);
        if (projectIndex === -1) {
            throw new AppError(`Project not found: ${projectId}`, AppErrorCode.ProjectNotFound);
        }
        taskManager["data"].projects.splice(projectIndex, 1);
        await taskManager["saveTasks"]();
        return {
            status: "project_deleted",
            message: `Project ${projectId} has been deleted.`,
        };
    },
};
toolExecutorMap.set(deleteProjectToolExecutor.name, deleteProjectToolExecutor);
/**
 * Tool executor for adding tasks to a project
 */
const addTasksToProjectToolExecutor = {
    name: "add_tasks_to_project",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        const tasks = validateTaskObjects(args.tasks);
        // 2. Core Logic Execution
        const resultData = await taskManager.addTasksToProject(projectId, tasks);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(addTasksToProjectToolExecutor.name, addTasksToProjectToolExecutor);
/**
 * Tool executor for finalizing (completing) projects
 */
const finalizeProjectToolExecutor = {
    name: "finalize_project",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        // 2. Core Logic Execution
        const resultData = await taskManager.approveProjectCompletion(projectId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(finalizeProjectToolExecutor.name, finalizeProjectToolExecutor);
/**
 * Tool executor for listing tasks with optional projectId and state
 */
const listTasksToolExecutor = {
    name: "list_tasks",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = args.projectId !== undefined ? validateProjectId(args.projectId) : undefined;
        const state = validateOptionalStateParam(args.state, [
            "open",
            "pending_approval",
            "completed",
            "all",
        ]);
        // 2. Core Logic Execution
        const resultData = await taskManager.listTasks(projectId, state);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(listTasksToolExecutor.name, listTasksToolExecutor);
/**
 * Tool executor for reading task details
 */
const readTaskToolExecutor = {
    name: "read_task",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        const taskId = validateTaskId(args.taskId);
        // 2. Core Logic Execution
        const resultData = await taskManager.openTaskDetails(projectId, taskId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(readTaskToolExecutor.name, readTaskToolExecutor);
/**
 * Tool executor for creating an individual task in a project
 */
const createTaskToolExecutor = {
    name: "create_task",
    async execute(taskManager, args) {
        const projectId = validateProjectId(args.projectId);
        const title = validateRequiredStringParam(args.title, "title");
        const description = validateRequiredStringParam(args.description, "description");
        if (args.toolRecommendations !== undefined && typeof args.toolRecommendations !== "string") {
            throw new AppError("Invalid type for optional parameter 'toolRecommendations' (Expected string)", AppErrorCode.InvalidArgument);
        }
        if (args.ruleRecommendations !== undefined && typeof args.ruleRecommendations !== "string") {
            throw new AppError("Invalid type for optional parameter 'ruleRecommendations' (Expected string)", AppErrorCode.InvalidArgument);
        }
        const singleTask = {
            title,
            description,
            toolRecommendations: args.toolRecommendations ? String(args.toolRecommendations) : undefined,
            ruleRecommendations: args.ruleRecommendations ? String(args.ruleRecommendations) : undefined,
        };
        const resultData = await taskManager.addTasksToProject(projectId, [singleTask]);
        return resultData;
    },
};
toolExecutorMap.set(createTaskToolExecutor.name, createTaskToolExecutor);
/**
 * Tool executor for deleting tasks
 */
const deleteTaskToolExecutor = {
    name: "delete_task",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        const taskId = validateTaskId(args.taskId);
        // 2. Core Logic Execution
        const resultData = await taskManager.deleteTask(projectId, taskId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(deleteTaskToolExecutor.name, deleteTaskToolExecutor);
/**
 * Tool executor for approving completed tasks
 */
const approveTaskToolExecutor = {
    name: "approve_task",
    async execute(taskManager, args) {
        // 1. Argument Validation
        const projectId = validateProjectId(args.projectId);
        const taskId = validateTaskId(args.taskId);
        // 2. Core Logic Execution
        const resultData = await taskManager.approveTaskCompletion(projectId, taskId);
        // 3. Return raw success data
        return resultData;
    },
};
toolExecutorMap.set(approveTaskToolExecutor.name, approveTaskToolExecutor);
//# sourceMappingURL=toolExecutors.js.map