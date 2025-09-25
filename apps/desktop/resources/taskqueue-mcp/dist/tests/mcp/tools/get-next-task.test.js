import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyToolExecutionError, verifyToolSuccessResponse, createTestProjectInFile, createTestTaskInFile, readTaskManagerFile } from '../test-helpers.js';
describe('get_next_task Tool', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should get first task when no tasks are started', async () => {
            // Create a project with multiple unstarted tasks
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project"
            });
            // Create tasks sequentially to ensure order
            const task1 = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Task 1",
                description: "First task",
                status: "not started"
            });
            const task2 = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Task 2",
                description: "Second task",
                status: "not started"
            });
            const tasks = [task1, task2];
            // Verify tasks are in expected order in the file
            const fileData = await readTaskManagerFile(context.testFilePath);
            const projectInFile = fileData.projects.find((p) => p.projectId === project.projectId);
            expect(projectInFile?.tasks[0].title).toBe("Task 1");
            expect(projectInFile?.tasks[1].title).toBe("Task 2");
            // Get next task
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: project.projectId
                }
            });
            const responseData = verifyToolSuccessResponse(result);
            expect(responseData.task).toMatchObject({
                id: tasks[0].id,
                title: "Task 1",
                status: "not started"
            });
        });
        it('should get next incomplete task after completed tasks', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Sequential Tasks"
            });
            // Create tasks with first one completed
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Done Task",
                description: "Already completed",
                status: "done",
                approved: true,
                completedDetails: "Completed first"
            });
            const nextTask = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Next Task",
                description: "Should be next",
                status: "not started"
            });
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: project.projectId
                }
            });
            const responseData = verifyToolSuccessResponse(result);
            expect(responseData.task).toMatchObject({
                id: nextTask.id,
                title: "Next Task",
                status: "not started"
            });
        });
        it('should get in-progress task if one exists', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Project with In-progress Task"
            });
            // Create multiple tasks with one in progress
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Done Task",
                description: "Already completed",
                status: "done",
                approved: true,
                completedDetails: "Completed"
            });
            const inProgressTask = await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Current Task",
                description: "In progress",
                status: "in progress"
            });
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Future Task",
                description: "Not started yet",
                status: "not started"
            });
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: project.projectId
                }
            });
            const responseData = verifyToolSuccessResponse(result);
            expect(responseData.task).toMatchObject({
                id: inProgressTask.id,
                title: "Current Task",
                status: "in progress"
            });
        });
        it('should return error when all tasks are completed', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Completed Project",
                completed: true
            });
            // Create only completed tasks
            await Promise.all([
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 1",
                    description: "First done",
                    status: "done",
                    approved: true,
                    completedDetails: "Done"
                }),
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 2",
                    description: "Second done",
                    status: "done",
                    approved: true,
                    completedDetails: "Done"
                })
            ]);
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project is already completed/);
        });
    });
    describe('Error Cases', () => {
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: "non_existent_project"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project non_existent_project not found/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: "invalid-format"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project invalid-format not found/);
        });
        it('should return error for project with no tasks', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Empty Project",
                tasks: []
            });
            const result = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project has no tasks/);
        });
    });
});
//# sourceMappingURL=get-next-task.test.js.map