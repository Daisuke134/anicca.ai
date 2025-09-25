import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, verifyProjectInFile, verifyTaskInFile, readTaskManagerFile } from '../test-helpers.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
describe('create_project Tool', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should create a project with minimal parameters', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Test Project",
                    tasks: [
                        { title: "Task 1", description: "First test task" }
                    ]
                }
            });
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Parse and verify response
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toHaveProperty('projectId');
            const projectId = responseData.projectId;
            // Verify project was created in file
            await verifyProjectInFile(context.testFilePath, projectId, {
                initialPrompt: "Test Project",
                completed: false
            });
            // Verify task was created
            await verifyTaskInFile(context.testFilePath, projectId, responseData.tasks[0].id, {
                title: "Task 1",
                description: "First test task",
                status: "not started",
                approved: false
            });
        });
        it('should create a project with no tasks', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Project with No Tasks",
                    tasks: []
                }
            });
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Parse and verify response
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toHaveProperty('projectId');
            const projectId = responseData.projectId;
            // Verify project was created in file
            await verifyProjectInFile(context.testFilePath, projectId, {
                initialPrompt: "Project with No Tasks",
                completed: false
            });
            // Verify no tasks were created
            const data = await readTaskManagerFile(context.testFilePath);
            const project = data.projects.find(p => p.projectId === projectId);
            expect(project?.tasks).toHaveLength(0);
        });
        it('should create a project with multiple tasks', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Multi-task Project",
                    tasks: [
                        { title: "Task 1", description: "First task" },
                        { title: "Task 2", description: "Second task" },
                        { title: "Task 3", description: "Third task" }
                    ]
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            const projectId = responseData.projectId;
            // Verify all tasks were created
            const data = await readTaskManagerFile(context.testFilePath);
            const project = data.projects.find(p => p.projectId === projectId);
            expect(project?.tasks).toHaveLength(3);
            expect(project?.tasks.map(t => t.title)).toEqual([
                "Task 1",
                "Task 2",
                "Task 3"
            ]);
            expect(project).toHaveProperty('autoApprove', true);
        });
        it('should create a project with auto-approve enabled', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Auto-approve Project",
                    tasks: [
                        { title: "Auto Task", description: "This task will be auto-approved" }
                    ],
                    autoApprove: true
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            const projectId = responseData.projectId;
            // Verify project was created with auto-approve
            const data = await readTaskManagerFile(context.testFilePath);
            const project = data.projects.find(p => p.projectId === projectId);
            expect(project).toHaveProperty('autoApprove', true);
        });
        it('should create a project with project plan', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Planned Project",
                    projectPlan: "Detailed plan for the project execution",
                    tasks: [
                        { title: "Planned Task", description: "Task with a plan" }
                    ]
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            const projectId = responseData.projectId;
            await verifyProjectInFile(context.testFilePath, projectId, {
                initialPrompt: "Planned Project",
                projectPlan: "Detailed plan for the project execution"
            });
        });
        it('should create tasks with tool and rule recommendations', async () => {
            const result = await context.client.callTool({
                name: "create_project",
                arguments: {
                    initialPrompt: "Project with Recommendations",
                    tasks: [{
                            title: "Task with Recommendations",
                            description: "Task description",
                            toolRecommendations: "Use tool X and Y",
                            ruleRecommendations: "Follow rules A and B"
                        }]
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            const projectId = responseData.projectId;
            const taskId = responseData.tasks[0].id;
            await verifyTaskInFile(context.testFilePath, projectId, taskId, {
                toolRecommendations: "Use tool X and Y",
                ruleRecommendations: "Follow rules A and B"
            });
        });
    });
    describe('Error Cases', () => {
        it('should return error for missing required parameters', async () => {
            try {
                await context.client.callTool({
                    name: "create_project",
                    arguments: {
                    // Missing initialPrompt and tasks
                    }
                });
                fail('Expected McpError to be thrown');
            }
            catch (error) {
                expect(error instanceof McpError).toBe(true);
                expect(error.message).toContain('Invalid or missing required parameter: initialPrompt');
            }
        });
        it('should return error for invalid task data', async () => {
            try {
                await context.client.callTool({
                    name: "create_project",
                    arguments: {
                        initialPrompt: "Invalid Task Project",
                        tasks: [
                            { title: "Task 1" } // Missing required description
                        ]
                    }
                });
                fail('Expected McpError to be thrown');
            }
            catch (error) {
                expect(error instanceof McpError).toBe(true);
                expect(error.message).toContain('Invalid or missing required parameter: description');
            }
        });
    });
});
//# sourceMappingURL=create-project.test.js.map