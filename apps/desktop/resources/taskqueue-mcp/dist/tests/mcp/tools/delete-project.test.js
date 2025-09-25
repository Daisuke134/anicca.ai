import { describe, it, beforeEach, afterEach } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyToolExecutionError, verifyToolSuccessResponse, createTestProject } from '../test-helpers.js';
describe('delete_project Tool', () => {
    let context;
    beforeEach(async () => {
        context = await setupTestContext();
    });
    afterEach(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should successfully delete an empty project', async () => {
            // Create a project using the actual create_project tool
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Test Project",
                tasks: [] // No tasks
            });
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId
                }
            });
            verifyToolSuccessResponse(result);
            // Verify project is deleted by attempting to read a task from it
            const readResult = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId
                }
            });
            verifyToolExecutionError(readResult, /Tool execution failed: Project .* not found/);
        });
        it('should successfully delete a project with non-approved tasks', async () => {
            // Create a project with non-approved tasks using the actual create_project tool
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Test Project with Tasks",
                tasks: [
                    { title: "Task 1", description: "First task" },
                    { title: "Task 2", description: "Second task" }
                ]
            });
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId
                }
            });
            verifyToolSuccessResponse(result);
            // Verify project is deleted
            const readResult = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId
                }
            });
            verifyToolExecutionError(readResult, /Tool execution failed: Project .* not found/);
        });
        it('should successfully delete a project with approved tasks', async () => {
            // Create a project with tasks
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Project with Tasks",
                tasks: [
                    { title: "Task to Approve", description: "This task will be approved" }
                ]
            });
            // Get the task ID
            const nextTaskResult = await context.client.callTool({
                name: "get_next_task",
                arguments: { projectId }
            });
            const taskData = verifyToolSuccessResponse(nextTaskResult);
            const taskId = taskData.task.id;
            // Mark task as done
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId,
                    taskId,
                    status: "done",
                    completedDetails: "Task completed"
                }
            });
            // Approve the task
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId,
                    taskId
                }
            });
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId
                }
            });
            verifyToolSuccessResponse(result);
            // Verify project is deleted
            const readResult = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId
                }
            });
            verifyToolExecutionError(readResult, /Tool execution failed: Project .* not found/);
        });
        it('should successfully delete a completed project', async () => {
            // Create a project and complete all its tasks
            const projectId = await createTestProject(context.client, {
                initialPrompt: "Project to Complete",
                tasks: [
                    { title: "Task 1", description: "Task to complete" }
                ]
            });
            // Get the task ID
            const nextTaskResult = await context.client.callTool({
                name: "get_next_task",
                arguments: { projectId }
            });
            const taskData = verifyToolSuccessResponse(nextTaskResult);
            const taskId = taskData.task.id;
            // Mark task as done
            await context.client.callTool({
                name: "update_task",
                arguments: {
                    projectId,
                    taskId,
                    status: "done",
                    completedDetails: "Task completed"
                }
            });
            // Approve the task
            await context.client.callTool({
                name: "approve_task",
                arguments: {
                    projectId,
                    taskId
                }
            });
            // Mark project as completed
            await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId
                }
            });
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId
                }
            });
            verifyToolSuccessResponse(result);
            // Verify project is deleted
            const readResult = await context.client.callTool({
                name: "get_next_task",
                arguments: {
                    projectId
                }
            });
            verifyToolExecutionError(readResult, /Tool execution failed: Project .* not found/);
        });
    });
    describe('Error Cases', () => {
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId: "non_existent_project"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project not found: non_existent_project/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "delete_project",
                arguments: {
                    projectId: "invalid-format"
                }
            });
            verifyToolExecutionError(result, /Tool execution failed: Project not found: invalid-format/);
        });
    });
});
//# sourceMappingURL=delete-project.test.js.map