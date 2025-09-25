import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { AppError, AppErrorCode } from "../types/errors.js";
import * as fs from 'node:fs';
export class FileSystemService {
    filePath;
    lockFilePath;
    constructor(filePath) {
        this.filePath = filePath;
        this.lockFilePath = `${filePath}.lock`;
    }
    /**
     * Gets the platform-appropriate app data directory
     */
    static getAppDataDir() {
        const platform = process.platform;
        if (platform === 'darwin') {
            // macOS: ~/Library/Application Support/taskqueue-mcp
            return join(homedir(), 'Library', 'Application Support', 'taskqueue-mcp');
        }
        else if (platform === 'win32') {
            // Windows: %APPDATA%\taskqueue-mcp (usually C:\Users\<user>\AppData\Roaming\taskqueue-mcp)
            return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'taskqueue-mcp');
        }
        else {
            // Linux/Unix/Others: Use XDG Base Directory if available, otherwise ~/.local/share/taskqueue-mcp
            const xdgDataHome = process.env.XDG_DATA_HOME;
            const linuxDefaultDir = join(homedir(), '.local', 'share', 'taskqueue-mcp');
            return xdgDataHome ? join(xdgDataHome, 'taskqueue-mcp') : linuxDefaultDir;
        }
    }
    /**
     * Acquires a file system lock
     */
    async acquireLock() {
        while (true) {
            try {
                // Try to create lock file
                const fd = fs.openSync(this.lockFilePath, 'wx');
                fs.closeSync(fd);
                return;
            }
            catch (error) {
                if (error.code === 'EEXIST') {
                    // Lock file exists, wait and retry
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                throw error;
            }
        }
    }
    /**
     * Releases the file system lock
     */
    async releaseLock() {
        try {
            await fs.promises.unlink(this.lockFilePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    /**
     * Execute a file operation with file system lock
     */
    async executeOperation(operation) {
        await this.acquireLock();
        try {
            return await operation();
        }
        finally {
            await this.releaseLock();
        }
    }
    /**
     * Loads and initializes task data from the JSON file
     */
    async loadAndInitializeTasks() {
        return this.executeOperation(async () => {
            const data = await this.loadTasks();
            const { maxProjectId, maxTaskId } = this.calculateMaxIds(data);
            return {
                data,
                maxProjectId,
                maxTaskId
            };
        });
    }
    /**
     * Explicitly reloads task data from the disk
     */
    async reloadTasks() {
        return this.executeOperation(async () => {
            return this.loadTasks();
        });
    }
    /**
     * Calculate max IDs from task data
     */
    calculateMaxIds(data) {
        const allTaskIds = [];
        const allProjectIds = [];
        for (const proj of data.projects) {
            const projNum = Number.parseInt(proj.projectId.replace("proj-", ""), 10);
            if (!Number.isNaN(projNum)) {
                allProjectIds.push(projNum);
            }
            for (const t of proj.tasks) {
                const tNum = Number.parseInt(t.id.replace("task-", ""), 10);
                if (!Number.isNaN(tNum)) {
                    allTaskIds.push(tNum);
                }
            }
        }
        return {
            maxProjectId: allProjectIds.length > 0 ? Math.max(...allProjectIds) : 0,
            maxTaskId: allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0
        };
    }
    /**
     * Loads raw task data from the JSON file
     */
    async loadTasks() {
        try {
            const data = await readFile(this.filePath, "utf-8");
            return JSON.parse(data);
        }
        catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('ENOENT')) {
                    // If file doesn't exist, return empty data
                    return { projects: [] };
                }
                throw new AppError(`Failed to read tasks file: ${error.message}`, AppErrorCode.FileReadError, error);
            }
            throw new AppError('Unknown error reading tasks file', AppErrorCode.FileReadError, error);
        }
    }
    /**
     * Saves task data to the JSON file with file system lock
     */
    async saveTasks(data) {
        return this.executeOperation(async () => {
            try {
                // Ensure directory exists before writing
                const dir = dirname(this.filePath);
                await mkdir(dir, { recursive: true });
                // Write to the file
                await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
            }
            catch (error) {
                if (error instanceof Error && error.message.includes("EROFS")) {
                    throw new AppError("Cannot save tasks: read-only file system", AppErrorCode.ReadOnlyFileSystem, error);
                }
                throw new AppError("Failed to save tasks file", AppErrorCode.FileWriteError, error);
            }
        });
    }
    /**
     * Reads an attachment file from the current working directory
     * @param filename The name of the file to read (relative to cwd)
     * @returns The contents of the file as a string
     * @throws {FileReadError} If the file cannot be read
     */
    async readAttachmentFile(filename) {
        try {
            const filePath = resolve(process.cwd(), filename);
            return await readFile(filePath, 'utf-8');
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('ENOENT')) {
                throw new AppError(`Attachment file not found: ${filename}`, AppErrorCode.FileReadError, error);
            }
            throw new AppError(`Failed to read attachment file: ${filename}`, AppErrorCode.FileReadError, error);
        }
    }
}
//# sourceMappingURL=FileSystemService.js.map