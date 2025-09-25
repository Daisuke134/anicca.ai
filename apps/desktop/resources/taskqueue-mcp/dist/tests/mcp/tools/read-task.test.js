import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyToolExecutionError, verifyToolSuccessResponse, createTestProjectInFile, createTestTaskInFile } from '../test-helpers.js';
describe('read_task Tool', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should successfully read an existing task', async () => {
            // Create a project with a task
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project"
            });
            const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Test Task",
                description: "Task description",
                status: "not started"
            });
            const result = await context.client.callTool({
                name: "read_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: task.id
                }
            });
            const responseData = verifyToolSuccessResponse(result);
            expect(responseData.task).toMatchObject({
                id: task.id,
                title: "Test Task",
                description: "Task description",
                status: "not started"
            });
        });
        it('should read a completed task with all details', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Project with Completed Task"
            });
            const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Completed Task",
                description: "A finished task",
                status: "done",
                approved: true,
                completedDetails: "Task was completed successfully",
                toolRecommendations: "Used tool X and Y",
                ruleRecommendations: "Applied rule Z"
            });
            const result = await context.client.callTool({
                name: "read_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: task.id
                }
            });
            const responseData = verifyToolSuccessResponse(result);
            expect(responseData.task).toMatchObject({
                id: task.id,
                title: "Completed Task",
                description: "A finished task",
                status: "done",
                approved: true,
                completedDetails: "Task was completed successfully",
                toolRecommendations: "Used tool X and Y",
                ruleRecommendations: "Applied rule Z"
            });
        });
    });
    describe('Error Cases', () => {
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "read_task",
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
                name: "read_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: "non-existent-task"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Task non-existent-task not found/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "read_task",
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
                name: "read_task",
                arguments: {
                    projectId: project.projectId,
                    taskId: "invalid-task-id"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Task invalid-task-id not found/);
        });
    });
});
//# sourceMappingURL=read-task.test.js.map