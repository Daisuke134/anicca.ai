import { describe, it, expect } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyCallToolResult, verifyToolExecutionError, } from '../test-helpers.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
describe('generate_project_plan Tool', () => {
    describe('OpenAI Provider', () => {
        // Skip by default as it requires OpenAI API key
        it.skip('should generate a project plan using OpenAI', async () => {
            // Create context with default API keys
            const context = await setupTestContext();
            try {
                // Skip if no OpenAI API key is set
                const openaiApiKey = process.env.OPENAI_API_KEY;
                if (!openaiApiKey) {
                    console.error('Skipping test: OPENAI_API_KEY not set');
                    return;
                }
                // Create a temporary requirements file
                const requirementsPath = path.join(context.tempDir, 'requirements.md');
                const requirements = `# Project Plan Requirements

- This is a test of whether we are correctly attaching files to our prompt
- Return a JSON project plan with one task
- Task title must be 'AmazingTask'
- Task description must be AmazingDescription
- Project plan attribute should be AmazingPlan`;
                await fs.writeFile(requirementsPath, requirements, 'utf-8');
                // Test prompt and context
                const testPrompt = "Create a step-by-step project plan to build a simple TODO app with React";
                // Generate project plan
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: testPrompt,
                        provider: "openai",
                        model: "gpt-4o-mini",
                        attachments: [requirementsPath]
                    }
                });
                verifyCallToolResult(result);
                expect(result.isError).toBeFalsy();
                const planData = JSON.parse(result.content[0].text);
                // Verify the generated plan structure
                expect(planData).toHaveProperty('tasks');
                expect(Array.isArray(planData.tasks)).toBe(true);
                expect(planData.tasks.length).toBeGreaterThan(0);
                // Verify task structure
                const firstTask = planData.tasks[0];
                expect(firstTask).toHaveProperty('title');
                expect(firstTask).toHaveProperty('description');
                // Verify that the generated task adheres to the requirements file context
                expect(firstTask.title).toBe('AmazingTask');
                expect(firstTask.description).toBe('AmazingDescription');
            }
            finally {
                await teardownTestContext(context);
            }
        });
        it('should handle OpenAI API errors gracefully', async () => {
            // Create a new context without the OpenAI API key
            const context = await setupTestContext(undefined, false, {
                OPENAI_API_KEY: '',
                GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ''
            });
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "openai",
                        model: "gpt-4o-mini",
                        // Invalid/missing API key should cause an error
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Missing API key environment variable required for openai/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
    });
    describe('Google Provider', () => {
        // Skip by default as it requires Google API key
        it.skip('should generate a project plan using Google Gemini', async () => {
            // Create context with default API keys
            const context = await setupTestContext();
            try {
                // Skip if no Google API key is set
                const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
                if (!googleApiKey) {
                    console.error('Skipping test: GOOGLE_GENERATIVE_AI_API_KEY not set');
                    return;
                }
                // Create a temporary requirements file
                const requirementsPath = path.join(context.tempDir, 'google-requirements.md');
                const requirements = `# Project Plan Requirements (Google Test)

- This is a test of whether we are correctly attaching files to our prompt for Google models
- Return a JSON project plan with one task
- Task title must be 'GeminiTask'
- Task description must be 'GeminiDescription'
- Project plan attribute should be 'GeminiPlan'`;
                await fs.writeFile(requirementsPath, requirements, 'utf-8');
                // Test prompt and context
                const testPrompt = "Create a step-by-step project plan to develop a cloud-native microservice using Go";
                // Generate project plan using Google Gemini
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: testPrompt,
                        provider: "google",
                        model: "gemini-2.0-flash-001",
                        attachments: [requirementsPath]
                    }
                });
                verifyCallToolResult(result);
                expect(result.isError).toBeFalsy();
                const planData = JSON.parse(result.content[0].text);
                // Verify the generated plan structure
                expect(planData).toHaveProperty('tasks');
                expect(Array.isArray(planData.tasks)).toBe(true);
                expect(planData.tasks.length).toBeGreaterThan(0);
                // Verify task structure
                const firstTask = planData.tasks[0];
                expect(firstTask).toHaveProperty('title');
                expect(firstTask).toHaveProperty('description');
                // Verify that the generated task adheres to the requirements file context
                expect(firstTask.title).toBe('GeminiTask');
                expect(firstTask.description).toBe('GeminiDescription');
            }
            finally {
                await teardownTestContext(context);
            }
        });
        it('should handle Google API errors gracefully', async () => {
            // Create a new context without the Google API key
            const context = await setupTestContext(undefined, false, {
                OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
                GOOGLE_GENERATIVE_AI_API_KEY: ''
            });
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "google",
                        model: "gemini-1.5-flash-latest",
                        // Invalid/missing API key should cause an error
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Missing API key environment variable required for google/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
    });
    describe('Deepseek Provider', () => {
        // Skip by default as it requires Deepseek API key
        it.skip('should generate a project plan using Deepseek', async () => {
            // Create context with default API keys
            const context = await setupTestContext();
            try {
                // Skip if no Deepseek API key is set
                const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
                if (!deepseekApiKey) {
                    console.error('Skipping test: DEEPSEEK_API_KEY not set');
                    return;
                }
                // Create a temporary requirements file
                const requirementsPath = path.join(context.tempDir, 'deepseek-requirements.md');
                const requirements = `# Project Plan Requirements (Deepseek Test)

- This is a test of whether we are correctly attaching files to our prompt for Deepseek models
- Return a JSON project plan with one task
- Task title must be 'DeepseekTask'
- Task description must be 'DeepseekDescription'
- Project plan attribute should be 'DeepseekPlan'`;
                await fs.writeFile(requirementsPath, requirements, 'utf-8');
                // Test prompt and context
                const testPrompt = "Create a step-by-step project plan to build a machine learning pipeline";
                // Generate project plan using Deepseek
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: testPrompt,
                        provider: "deepseek",
                        model: "deepseek-chat",
                        attachments: [requirementsPath]
                    }
                });
                verifyCallToolResult(result);
                expect(result.isError).toBeFalsy();
                const planData = JSON.parse(result.content[0].text);
                // Verify the generated plan structure
                expect(planData).toHaveProperty('data');
                expect(planData).toHaveProperty('tasks');
                expect(Array.isArray(planData.tasks)).toBe(true);
                expect(planData.tasks.length).toBeGreaterThan(0);
                // Verify task structure
                const firstTask = planData.tasks[0];
                expect(firstTask).toHaveProperty('title');
                expect(firstTask).toHaveProperty('description');
                // Verify that the generated task adheres to the requirements file context
                expect(firstTask.title).toBe('DeepseekTask');
                expect(firstTask.description).toBe('DeepseekDescription');
            }
            finally {
                await teardownTestContext(context);
            }
        });
        it('should handle Deepseek API errors gracefully', async () => {
            // Create a new context without the Deepseek API key
            const context = await setupTestContext(undefined, false, {
                OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
                GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
                DEEPSEEK_API_KEY: ''
            });
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "deepseek",
                        model: "deepseek-chat",
                        // Invalid/missing API key should cause an error
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Missing API key environment variable required for deepseek/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
    });
    describe('Error Cases', () => {
        it('should return error for invalid provider', async () => {
            const context = await setupTestContext();
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "invalid_provider",
                        model: "some-model"
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Invalid provider: invalid_provider/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
        // Skip by default as it requires OpenAI API key
        it.skip('should return error for invalid model', async () => {
            const context = await setupTestContext();
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "openai",
                        model: "invalid-model"
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Invalid model: invalid-model is not available for openai/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
        it('should return error for non-existent attachment file', async () => {
            const context = await setupTestContext();
            try {
                const result = await context.client.callTool({
                    name: "generate_project_plan",
                    arguments: {
                        prompt: "Test prompt",
                        provider: "openai",
                        model: "gpt-4o-mini",
                        attachments: ["/non/existent/file.md"]
                    }
                });
                verifyToolExecutionError(result, /Tool execution failed: Failed to read attachment file/);
            }
            finally {
                await teardownTestContext(context);
            }
        });
    });
});
//# sourceMappingURL=generate-project-plan.test.js.map