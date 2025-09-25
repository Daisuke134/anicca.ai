import { TaskManagerFile } from "../types/data.js";
export interface InitializedTaskData {
    data: TaskManagerFile;
    maxProjectId: number;
    maxTaskId: number;
}
export declare class FileSystemService {
    private filePath;
    private lockFilePath;
    constructor(filePath: string);
    /**
     * Gets the platform-appropriate app data directory
     */
    static getAppDataDir(): string;
    /**
     * Acquires a file system lock
     */
    private acquireLock;
    /**
     * Releases the file system lock
     */
    private releaseLock;
    /**
     * Execute a file operation with file system lock
     */
    private executeOperation;
    /**
     * Loads and initializes task data from the JSON file
     */
    loadAndInitializeTasks(): Promise<InitializedTaskData>;
    /**
     * Explicitly reloads task data from the disk
     */
    reloadTasks(): Promise<TaskManagerFile>;
    /**
     * Calculate max IDs from task data
     */
    calculateMaxIds(data: TaskManagerFile): {
        maxProjectId: number;
        maxTaskId: number;
    };
    /**
     * Loads raw task data from the JSON file
     */
    private loadTasks;
    /**
     * Saves task data to the JSON file with file system lock
     */
    saveTasks(data: TaskManagerFile): Promise<void>;
    /**
     * Reads an attachment file from the current working directory
     * @param filename The name of the file to read (relative to cwd)
     * @returns The contents of the file as a string
     * @throws {FileReadError} If the file cannot be read
     */
    readAttachmentFile(filename: string): Promise<string>;
}
