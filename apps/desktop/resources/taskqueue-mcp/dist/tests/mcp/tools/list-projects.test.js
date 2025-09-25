import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, verifyToolExecutionError, createTestProject, getFirstTaskId } from '../test-helpers.js';
import path from 'path';
import os from 'os';
describe('list_projects Tool', () => {
    describe('Success Cases', () => {
        let context;
        beforeAll(async () => {
            context = await setupTestContext();
        });
        afterAll(async () => {
            await teardownTestContext(context);
        });
        it('should list projects with no filters', async () => {
            // Create a test project first
            const projectId = await createTestProject(context.client);
            // Test list_projects
            const result = await context.client.callTool({
                name: "list_projects",
                arguments: {}
            });
            // Verify response format
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Parse and verify response data
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toHaveProperty('message');
            expect(responseData).toHaveProperty('projects');
            expect(Array.isArray(responseData.projects)).toBe(true);
            // Verify our test project is in the list
            const projects = responseData.projects;
            const testProject = projects.find((p) => p.projectId === projectId);
            expect(testProject).toBeDefined();
            expect(testProject).toHaveProperty('initialPrompt');
            expect(testProject).toHaveProperty('totalTasks');
            expect(testProject).toHaveProperty('completedTasks');
            expect(testProject).toHaveProperty('approvedTasks');
        });
        it('should filter projects by state', async () => {
            // Create two projects with different states
            const openProjectId = await createTestProject(context.client, {
                initialPrompt: "Open Project",
                tasks: [{ title: "Open Task", description: "This task will remain open" }]
            });
            const completedProjectId = await createTestProject(context.client, {
                initialPrompt: "Completed Project",
                tasks: [{ title: "Done Task", description: "This task will be completed" }],
                autoApprove: true
            });
            // Complete the second project's task
            const taskId = await getFirstTaskId(context.client, completedProjectId);
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId: completedProjectId,
                    taskId,
                    status: "done",
                    completedDetails: "Task completed in test"
                }
            });
            // Approve and finalize the project
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId: completedProjectId,
                    taskId
                }
            });
            await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: completedProjectId
                }
            });
            // Test filtering by 'open' state
            const openResult = await context.client.callTool({
                name: "list_projects",
                arguments: { state: "open" }
            });
            verifyCallToolResult(openResult);
            const openData = JSON.parse(openResult.content[0].text);
            const openProjects = openData.projects;
            expect(openProjects.some((p) => p.projectId === openProjectId)).toBe(true);
            expect(openProjects.some((p) => p.projectId === completedProjectId)).toBe(false);
            // Test filtering by 'completed' state
            const completedResult = await context.client.callTool({
                name: "list_projects",
                arguments: { state: "completed" }
            });
            verifyCallToolResult(completedResult);
            const completedData = JSON.parse(completedResult.content[0].text);
            const completedProjects = completedData.projects;
            expect(completedProjects.some((p) => p.projectId === completedProjectId)).toBe(true);
            expect(completedProjects.some((p) => p.projectId === openProjectId)).toBe(false);
        });
    });
    describe('Error Cases', () => {
        describe('Validation Errors', () => {
            let context;
            beforeAll(async () => {
                context = await setupTestContext();
            });
            afterAll(async () => {
                await teardownTestContext(context);
            });
            it('should handle invalid state parameter', async () => {
                const result = await context.client.callTool({
                    name: "list_projects",
                    arguments: { state: "invalid_state" }
                });
                verifyToolExecutionError(result, /Invalid state parameter. Must be one of: open, pending_approval, completed, all/);
            });
        });
        describe('File System Errors', () => {
            let errorContext;
            const invalidPathDir = path.join(os.tmpdir(), 'nonexistent-dir');
            const invalidFilePath = path.join(invalidPathDir, 'invalid-file.json');
            beforeAll(async () => {
                // Set up test context with invalid file path, skipping file initialization
                errorContext = await setupTestContext(invalidFilePath, true);
            });
            afterAll(async () => {
                await teardownTestContext(errorContext);
            });
            it('should handle server errors gracefully', async () => {
                const result = await errorContext.client.callTool({
                    name: "list_projects",
                    arguments: {}
                });
                verifyToolExecutionError(result, /Failed to reload tasks from disk/);
            });
        });
    });
});
//# sourceMappingURL=list-projects.test.js.map