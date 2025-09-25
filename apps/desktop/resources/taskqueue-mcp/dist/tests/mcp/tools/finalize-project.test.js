import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, createTestProjectInFile, createTestTaskInFile, verifyProjectInFile, verifyToolExecutionError } from '../test-helpers.js';
describe('finalize_project Tool', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    describe('Success Cases', () => {
        it('should finalize a project with all tasks completed and approved', async () => {
            // Create a project with completed and approved tasks
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Test Project",
                completed: false
            });
            // Add completed and approved tasks
            await Promise.all([
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 1",
                    description: "First task",
                    status: "done",
                    approved: true,
                    completedDetails: "Task 1 completed"
                }),
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Task 2",
                    description: "Second task",
                    status: "done",
                    approved: true,
                    completedDetails: "Task 2 completed"
                })
            ]);
            // Finalize the project
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            // Verify response
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            // Verify project state in file
            await verifyProjectInFile(context.testFilePath, project.projectId, {
                completed: true
            });
        });
        it('should finalize a project with auto-approved tasks', async () => {
            // Create a project with auto-approve enabled
            const project = await createTestProjectInFile(context.testFilePath, {
                initialPrompt: "Auto-approve Project",
                autoApprove: true,
                completed: false
            });
            // Add completed tasks (they should be auto-approved)
            await Promise.all([
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Auto Task 1",
                    description: "First auto-approved task",
                    status: "done",
                    approved: true,
                    completedDetails: "Auto task 1 completed"
                }),
                createTestTaskInFile(context.testFilePath, project.projectId, {
                    title: "Auto Task 2",
                    description: "Second auto-approved task",
                    status: "done",
                    approved: true,
                    completedDetails: "Auto task 2 completed"
                })
            ]);
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyCallToolResult(result);
            expect(result.isError).toBeFalsy();
            await verifyProjectInFile(context.testFilePath, project.projectId, {
                completed: true,
                autoApprove: true
            });
        });
    });
    describe('Error Cases', () => {
        it('should return error when project has incomplete tasks', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                projectId: "proj-1",
                initialPrompt: "open project",
                projectPlan: "test",
                tasks: [{
                        id: "task-1",
                        title: "open task",
                        description: "test",
                        status: "not started",
                        approved: false,
                        completedDetails: ""
                    }]
            });
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyToolExecutionError(result, /Not all tasks are done/);
            // Verify project remains incomplete
            await verifyProjectInFile(context.testFilePath, project.projectId, {
                completed: false
            });
        });
        it('should return error when project has unapproved tasks', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                projectId: "proj-2",
                initialPrompt: "pending approval project",
                projectPlan: "test",
                tasks: [{
                        id: "task-2",
                        title: "pending approval task",
                        description: "test",
                        status: "done",
                        approved: false,
                        completedDetails: "completed"
                    }]
            });
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyToolExecutionError(result, /Not all done tasks are approved/);
            await verifyProjectInFile(context.testFilePath, project.projectId, {
                completed: false
            });
        });
        it('should return error when project is already completed', async () => {
            const project = await createTestProjectInFile(context.testFilePath, {
                projectId: "proj-3",
                initialPrompt: "completed project",
                projectPlan: "test",
                completed: true,
                tasks: [{
                        id: "task-3",
                        title: "completed task",
                        description: "test",
                        status: "done",
                        approved: true,
                        completedDetails: "completed"
                    }]
            });
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: project.projectId
                }
            });
            verifyToolExecutionError(result, /Project is already completed/);
        });
        it('should return error for non-existent project', async () => {
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: "non_existent_project"
                }
            });
            verifyToolExecutionError(result, /Project non_existent_project not found/);
        });
        it('should return error for invalid project ID format', async () => {
            const result = await context.client.callTool({
                name: "finalize_project",
                arguments: {
                    projectId: "invalid-format"
                }
            });
            verifyToolExecutionError(result, /Project invalid-format not found/);
        });
    });
});
//# sourceMappingURL=finalize-project.test.js.map