import { TaskManager } from "./TaskManager.js";
/**
 * Interface defining the contract for tool executors.
 * Each tool executor is responsible for executing a specific tool's logic
 * and handling its input validation.
 */
interface ToolExecutor {
    /** The name of the tool this executor handles */
    name: string;
    /**
     * Executes the tool's logic with the given arguments
     * @param taskManager The TaskManager instance to use for task-related operations
     * @param args The arguments passed to the tool as a key-value record
     * @returns A promise that resolves to the raw data from TaskManager
     */
    execute: (taskManager: TaskManager, args: Record<string, unknown>) => Promise<unknown>;
}
export declare const toolExecutorMap: Map<string, ToolExecutor>;
export {};
