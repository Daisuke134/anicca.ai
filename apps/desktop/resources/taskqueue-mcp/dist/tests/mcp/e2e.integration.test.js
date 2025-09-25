import { describe, it, expect } from '@jest/globals';
import { setupTestContext, teardownTestContext } from './test-helpers.js';
describe('MCP Client Integration', () => {
    let context;
    beforeAll(async () => {
        context = await setupTestContext();
    });
    afterAll(async () => {
        await teardownTestContext(context);
    });
    it('should list available tools', async () => {
        const response = await context.client.listTools();
        expect(response).toBeDefined();
        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);
        expect(response.tools.length).toBeGreaterThan(0);
        // Check for essential tools
        const toolNames = response.tools.map(tool => tool.name);
        expect(toolNames).toContain('list_projects');
        expect(toolNames).toContain('create_project');
        expect(toolNames).toContain('read_project');
        expect(toolNames).toContain('get_next_task');
    });
});
//# sourceMappingURL=e2e.integration.test.js.map