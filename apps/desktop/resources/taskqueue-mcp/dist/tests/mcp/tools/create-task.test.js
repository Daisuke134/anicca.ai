import { describe, it, expect, beforeEach } from '@jest/globals';
import { setupTestContext, teardownTestContext, createTestProject, verifyCallToolResult, verifyTaskInFile, verifyToolExecutionError, verifyProtocolError } from '../test-helpers.js';
describe('create_task Tool', () => {
    let context;
    let projectId;
    beforeEach(async () => {
        context = await setupTestContext();
        // Create a test project for each test case
        projectId = await createTestProject(context.client);
    });
    afterEach(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should create a task with minimal parameters', async () => {
            const result = await context.client.callTool({
                name: "create_task",
                arguments: {
                    projectId,
                    title: "New Test Task",
                    description: "A simple test task"
                }
            });
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Parse and verify response
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toHaveProperty('message');
            expect(responseData).toHaveProperty('newTasks');
            expect(responseData.newTasks).toHaveLength(1);
            const newTask = responseData.newTasks[0];
            // Verify task was created in file
            await verifyTaskInFile(context.testFilePath, projectId, newTask.id, {
                title: "New Test Task",
                description: "A simple test task",
                status: "not started",
                approved: false
            });
        });
        it('should create a task with tool and rule recommendations', async () => {
            const result = await context.client.callTool({
                name: "create_task",
                arguments: {
                    projectId,
                    title: "Task with Recommendations",
                    description: "Task with specific recommendations",
                    toolRecommendations: "Use tool A and B",
                    ruleRecommendations: "Follow rules X and Y"
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            const newTask = responseData.newTasks[0];
            await verifyTaskInFile(context.testFilePath, projectId, newTask.id, {
                title: "Task with Recommendations",
                description: "Task with specific recommendations",
                toolRecommendations: "Use tool A and B",
                ruleRecommendations: "Follow rules X and Y"
            });
        });
        it('should create multiple tasks in sequence', async () => {
            const tasks = [
                { title: "First Task", description: "Task 1 description" },
                { title: "Second Task", description: "Task 2 description" },
                { title: "Third Task", description: "Task 3 description" }
            ];
            const taskIds = [];
            for (const task of tasks) {
                const result = await context.client.callTool({
                    name: "create_task",
                    arguments: {
                        projectId,
                        ...task
                    }
                });
                verifyCallToolResult(result);
                const responseData = JSON.parse(result.content[0].text);
                taskIds.push(responseData.newTasks[0].id);
            }
            // Verify all tasks were created
            for (let i = 0; i < tasks.length; i++) {
                await verifyTaskInFile(context.testFilePath, projectId, taskIds[i], {
                    title: tasks[i].title,
                    description: tasks[i].description,
                    status: "not started"
                });
            }
        });
    });
    describe('Error Cases', () => {
        it('should return error for missing required parameters', async () => {
            try {
                await context.client.callTool({
                    name: "create_task",
                    arguments: {
                        projectId
                        // Missing title and description
                    }
                });
                expect(true).toBe(false); // This line should never be reached
            }
            catch (error) {
                verifyProtocolError(error, -32602, 'Invalid or missing required parameter');
            }
        });
        it('should return error for invalid project ID', async () => {
            const result = await context.client.callTool({
                name: "create_task",
                arguments: {
                    projectId: "non-existent-project",
                    title: "Test Task",
                    description: "Test Description"
                }
            });
            verifyToolExecutionError(result, /Project non-existent-project not found/);
        });
        it('should return error for empty title', async () => {
            try {
                await context.client.callTool({
                    name: "create_task",
                    arguments: {
                        projectId,
                        title: "",
                        description: "Test Description"
                    }
                });
                expect(true).toBe(false); // This line should never be reached
            }
            catch (error) {
                verifyProtocolError(error, -32602, 'Invalid or missing required parameter: title');
            }
        });
        it('should return error for empty description', async () => {
            try {
                await context.client.callTool({
                    name: "create_task",
                    arguments: {
                        projectId,
                        title: "Test Task",
                        description: ""
                    }
                });
                expect(true).toBe(false); // This line should never be reached
            }
            catch (error) {
                verifyProtocolError(error, -32602, 'Invalid or missing required parameter: description');
            }
        });
    });
});
//# sourceMappingURL=create-task.test.js.map