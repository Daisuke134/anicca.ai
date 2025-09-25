import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, createTestProjectInFile, createTestTaskInFile, verifyToolExecutionError } from '../test-helpers.js';
describe('read_project Tool', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should read a project with minimal data', async () => {
            // Create a test project
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project",
                projectPlan: "",
                completed: false
            });
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Test Task",
                description: "Test Description"
            });
            // Read the project
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            // Verify response
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Verify project data
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toMatchObject({
                projectId: project.projectId,
                initialPrompt: "Test Project",
                completed: false,
                tasks: [{
                        title: "Test Task",
                        description: "Test Description",
                        status: "not started",
                        approved: false
                    }]
            });
        });
        it('should read a project with all optional fields', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Full Project",
                projectPlan: "Detailed project plan",
                completed: false,
                autoApprove: true
            });
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Full Task",
                description: "Task with all fields",
                status: "done",
                approved: true,
                completedDetails: "Task completed",
                toolRecommendations: "Use these tools",
                ruleRecommendations: "Follow these rules"
            });
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toMatchObject({
                projectId: project.projectId,
                initialPrompt: "Full Project",
                projectPlan: "Detailed project plan",
                completed: false,
                autoApprove: true,
                tasks: [{
                        title: "Full Task",
                        description: "Task with all fields",
                        status: "done",
                        approved: true,
                        completedDetails: "Task completed",
                        toolRecommendations: "Use these tools",
                        ruleRecommendations: "Follow these rules"
                    }]
            });
        });
        it('should read a completed project', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Completed Project",
                completed: true
            });
            await createTestTaskInFile(context.testFilePath, project.projectId, {
                title: "Completed Task",
                description: "This task is done",
                status: "done",
                approved: true,
                completedDetails: "Task completed"
            });
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toMatchObject({
                projectId: project.projectId,
                completed: true,
                tasks: [{
                        status: "done",
                        approved: true
                    }]
            });
        });
        it('should read a project with multiple tasks', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Multi-task Project"
            });
            // Create tasks in different states
            await Promise.all([
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 1",
                    description: "Not started",
                    status: "not started"
                }),
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 2",
                    description: "In progress",
                    status: "in progress"
                }),
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 3",
                    description: "Completed",
                    status: "done",
                    approved: true,
                    completedDetails: "Done and approved"
                })
            ]);
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyCallToolResult(result);
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData.tasks).toHaveLength(3);
            expect(responseData.tasks.map((t) => t.status)).toEqual([
                "not started",
                "in progress",
                "done"
            ]);
        });
    });
    describe('Error Cases', () => {
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: "non_existent_project"
                }
            });
            verifyToolExecutionError(result, /Project non_existent_project not found/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "read_project",
                arguments: {
                    projectId: "invalid-format"
                }
            });
            verifyToolExecutionError(result, /Project invalid-format not found/);
        });
    });
});
//# sourceMappingURL=read-project.test.js.map