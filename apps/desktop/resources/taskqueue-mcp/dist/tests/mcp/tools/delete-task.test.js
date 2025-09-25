import { describe, it, beforeEach, afterEach } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyToolExecutionError, verifyToolSuccessResponse, createTestProjectInFile, createTestTaskInFile } from '../test-helpers.js';
describe('delete_task Tool', () => {
    let context;
    beforeEach(async () => {
        context = await setupTestContext();
    });
    afterEach(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should successfully delete an existing task', async () => {
            // Create a project with a task
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project"
            });
            const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Test Task",
                description: "Task to be deleted",
                status: "not started"
            });
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: task.id
                }
            });
            verifyToolSuccessResponse(result);
            // Verify task is deleted by attempting to read it
            const readResult = await context.client.callTool({
                name: "read_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: task.id
                }
            });
            verifyToolExecutionError(readResult, /Tool execution failed: Task .* not found/);
        });
    });
    describe('Error Cases', () => {
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: "non_existent_project",
                    taskId: "task-1"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project non_existent_project not found/);
        });
        it('should return error for non-existent task in existing project', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project"
            });
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: "non-existent-task"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Task non-existent-task not found/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: "invalid-format",
                    taskId: "task-1"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project invalid-format not found/);
        });
        it('should return error for invalid task ID format', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project"
            });
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: "invalid-task-id"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Task invalid-task-id not found/);
        });
        it('should return error when trying to delete an approved task', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Project with Completed Task"
            });
            const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Completed Task",
                description: "A finished task to delete",
                status: "done",
                approved: true,
                completedDetails: "Task was completed successfully"
            });
            const result = await context.client.callTool({
                name: "delete_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: task.id
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Cannot delete an approved task/);
        });
    });
});
//# sourceMappingURL=delete-task.test.js.map