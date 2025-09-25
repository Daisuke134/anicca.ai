import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, verifyToolExecutionError, createTestProject } from '../test-helpers.js';
import path from 'path';
import os from 'os';
describe('list_tasks Tool', () => {
    describe('Success Cases', () => {
        let context;
        beforeAll(async () => {
            context = await setupTestContext();
        });
        afterAll(async () => {
            await teardownTestContext(context);
        });
        it('should list all tasks with no filters', async () => {
            // Create a test project with tasks
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Test Project",
                tasks: [
                    { title: "Task 1", description: "First test task" },
                    { title: "Task 2", description: "Second test task" }
                ]
            });
            // Test list_tasks with no filters
            const result = await context.client.callTool({
                name: "list_tasks",
                arguments: {}
            });
            // Verify response format
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Parse and verify response data
            const responseData = JSON.parse(result.content[0].text);
            expect(responseData).toHaveProperty('message');
            expect(responseData).toHaveProperty('tasks');
            expect(Array.isArray(responseData.tasks)).toBe(true);
            expect(responseData.tasks.length).toBe(2);
            // Verify task properties
            const tasks = responseData.tasks;
            tasks.forEach((task) => {
                expect(task).toHaveProperty('id');
                expect(task).toHaveProperty('title');
                expect(task).toHaveProperty('description');
                expect(task).toHaveProperty('status');
                expect(task).toHaveProperty('approved');
            });
        });
        it('should filter tasks by project ID', async () => {
            // Create two projects with different tasks
            const project1Id = await createTestProject(context.client, {
                initialPrompt: "Project 1",
                tasks: [{ title: "P1 Task", description: "Project 1 task" }]
            });
            const project2Id = await createTestProject(context.client, {
                initialPrompt: "Project 2",
                tasks: [{ title: "P2 Task", description: "Project 2 task" }]
            });
            // Test filtering by project1
            const result1 = await context.client.callTool({
                name: "list_tasks",
                arguments: { projectId: project1Id }
            });
            verifyCallToolResult(result1);
            const data1 = JSON.parse(result1.content[0].text);
            expect(data1.tasks.length).toBe(1);
            expect(data1.tasks[0].title).toBe("P1 Task");
            // Test filtering by project2
            const result2 = await context.client.callTool({
                name: "list_tasks",
                arguments: { projectId: project2Id }
            });
            verifyCallToolResult(result2);
            const data2 = JSON.parse(result2.content[0].text);
            expect(data2.tasks.length).toBe(1);
            expect(data2.tasks[0].title).toBe("P2 Task");
        });
        it('should filter tasks by state', async () => {
            // Create a project with tasks in different states
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Mixed States Project",
                tasks: [
                    { title: "Not Started Task", description: "This task will remain not started" },
                    { title: "Done But Not Approved Task", description: "This task will be done but not approved" },
                    { title: "Completed And Approved Task", description: "This task will be completed and approved" }
                ]
            });
            // Get task IDs for each task
            const tasks = await context.client.callTool({
                name: "list_tasks",
                arguments: { projectId }
            });
            const [notStartedTaskId, doneNotApprovedTaskId, completedTaskId] = JSON.parse(tasks.content[0].text)
                .tasks.map((t) => t.id);
            // Set up task states:
            // 1. Leave first task as is (not started)
            // 2. Mark second task as done (but not approved)
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId,
                    taskId: doneNotApprovedTaskId,
                    status: "done",
                    completedDetails: "Task completed in test"
                }
            });
            // 3. Mark third task as done and approved
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId,
                    taskId: completedTaskId,
                    status: "done",
                    completedDetails: "Task completed in test"
                }
            });
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId,
                    taskId: completedTaskId
                }
            });
            // Test filtering by 'open' state - should include both not started and done-but-not-approved tasks
            const openResult = await context.client.callTool({
                name: "list_tasks",
                arguments: {
                    projectId,
                    state: "open"
                }
            });
            verifyCallToolResult(openResult);
            const openData = JSON.parse(openResult.content[0].text);
            expect(openData.tasks.some((t) => t.title === "Not Started Task")).toBe(true);
            expect(openData.tasks.some((t) => t.title === "Done But Not Approved Task")).toBe(true);
            expect(openData.tasks.some((t) => t.title === "Completed And Approved Task")).toBe(false);
            expect(openData.tasks.length).toBe(2); // Should have both non-approved tasks
            // Test filtering by 'pending_approval' state
            const pendingResult = await context.client.callTool({
                name: "list_tasks",
                arguments: {
                    projectId,
                    state: "pending_approval"
                }
            });
            verifyCallToolResult(pendingResult);
            const pendingData = JSON.parse(pendingResult.content[0].text);
            expect(pendingData.tasks.some((t) => t.title === "Done But Not Approved Task")).toBe(true);
            expect(pendingData.tasks.some((t) => t.title === "Not Started Task")).toBe(false);
            expect(pendingData.tasks.some((t) => t.title === "Completed And Approved Task")).toBe(false);
            expect(pendingData.tasks.length).toBe(1); // Should only have the done-but-not-approved task
            // Test filtering by 'completed' state
            const completedResult = await context.client.callTool({
                name: "list_tasks",
                arguments: {
                    projectId,
                    state: "completed"
                }
            });
            verifyCallToolResult(completedResult);
            const completedData = JSON.parse(completedResult.content[0].text);
            expect(completedData.tasks.some((t) => t.title === "Completed And Approved Task")).toBe(true);
            expect(completedData.tasks.some((t) => t.title === "Not Started Task")).toBe(false);
            expect(completedData.tasks.some((t) => t.title === "Done But Not Approved Task")).toBe(false);
            expect(completedData.tasks.length).toBe(1); // Should only have the completed and approved task
        });
        it('should combine project ID and state filters', async () => {
            // Create two projects with tasks in different states
            const project1Id = await createTestProject(context.client, {
                initialPrompt: "Project 1",
                tasks: [
                    { title: "P1 Not Started Task", description: "Project 1 not started task" },
                    { title: "P1 Completed Task", description: "Project 1 completed task" }
                ]
            });
            const project2Id = await createTestProject(context.client, {
                initialPrompt: "Project 2",
                tasks: [
                    { title: "P2 Not Started Task", description: "Project 2 not started task" },
                    { title: "P2 Completed Task", description: "Project 2 completed task" }
                ]
            });
            // Get task IDs for each project
            const p1Tasks = await context.client.callTool({
                name: "list_tasks",
                arguments: { projectId: project1Id }
            });
            const [p1OpenTaskId, p1CompletedTaskId] = JSON.parse(p1Tasks.content[0].text)
                .tasks.map((t) => t.id);
            const p2Tasks = await context.client.callTool({
                name: "list_tasks",
                arguments: { projectId: project2Id }
            });
            const [p2OpenTaskId, p2CompletedTaskId] = JSON.parse(p2Tasks.content[0].text)
                .tasks.map((t) => t.id);
            // Complete and approve one task in each project
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId: project1Id,
                    taskId: p1CompletedTaskId,
                    status: "done",
                    completedDetails: "Task completed in test"
                }
            });
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId: project1Id,
                    taskId: p1CompletedTaskId
                }
            });
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId: project2Id,
                    taskId: p2CompletedTaskId,
                    status: "done",
                    completedDetails: "Task completed in test"
                }
            });
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId: project2Id,
                    taskId: p2CompletedTaskId
                }
            });
            // Test combined filtering - should only show non-approved tasks from project1
            const result = await context.client.callTool({
                name: "list_tasks",
                arguments: {
                    projectId: project1Id,
                    state: "open"
                }
            });
            verifyCallToolResult(result);
            const data = JSON.parse(result.content[0].text);
            expect(data.tasks.length).toBe(1);
            expect(data.tasks[0].title).toBe("P1 Not Started Task");
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
                    name: "list_tasks",
                    arguments: { state: "invalid_state" }
                });
                verifyToolExecutionError(result, /Invalid state parameter. Must be one of: open, pending_approval, completed, all/);
            });
            it('should handle invalid project ID', async () => {
                const result = await context.client.callTool({
                    name: "list_tasks",
                    arguments: { projectId: "non-existent-project" }
                });
                verifyToolExecutionError(result, /Project non-existent-project not found/);
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
                    name: "list_tasks",
                    arguments: {}
                });
                verifyToolExecutionError(result, /Failed to reload tasks from disk/);
            });
        });
    });
});
//# sourceMappingURL=list-tasks.test.js.map