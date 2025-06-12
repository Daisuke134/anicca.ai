import { MCPClientService } from './mcpClientService';

export interface PlaywrightAction {
  type: string;
  selector?: string;
  value?: string;
  url?: string;
  timeout?: number;
}

export class PlaywrightMCPService extends MCPClientService {
  constructor() {
    super();
  }

  async connectToPlaywright() {
    try {
      // Connect to Playwright MCP server
      await this.connectToServer(
        'npx',
        ['@playwright/mcp@latest'],
        {}
      );
      console.log('🎭 Connected to Playwright MCP Server');
      
      // List available tools for debugging
      const tools = await this.listTools();
      console.log('📋 Playwright MCP Tools available:', tools.map(t => t.name));
    } catch (error) {
      console.error('❌ Failed to connect to Playwright MCP:', error);
      throw error;
    }
  }

  async navigateTo(url: string): Promise<any> {
    try {
      console.log('🌐 Navigating to:', url);
      const response = await this.callTool('navigate', { url });
      return response;
    } catch (error) {
      console.error('❌ Error navigating:', error);
      throw error;
    }
  }

  async click(selector: string): Promise<any> {
    try {
      console.log('🖱️ Clicking element:', selector);
      const response = await this.callTool('click', { selector });
      return response;
    } catch (error) {
      console.error('❌ Error clicking:', error);
      throw error;
    }
  }

  async fill(selector: string, value: string): Promise<any> {
    try {
      console.log('⌨️ Filling input:', selector);
      const response = await this.callTool('fill', { selector, value });
      return response;
    } catch (error) {
      console.error('❌ Error filling input:', error);
      throw error;
    }
  }

  async screenshot(options?: { fullPage?: boolean }): Promise<string> {
    try {
      console.log('📸 Taking screenshot');
      const response = await this.callTool('screenshot', options || {});
      return response;
    } catch (error) {
      console.error('❌ Error taking screenshot:', error);
      throw error;
    }
  }

  async evaluate(script: string): Promise<any> {
    try {
      console.log('📝 Evaluating script');
      const response = await this.callTool('evaluate', { script });
      return response;
    } catch (error) {
      console.error('❌ Error evaluating script:', error);
      throw error;
    }
  }

  async waitForSelector(selector: string, options?: { timeout?: number }): Promise<any> {
    try {
      console.log('⏳ Waiting for selector:', selector);
      const response = await this.callTool('waitForSelector', { selector, ...options });
      return response;
    } catch (error) {
      console.error('❌ Error waiting for selector:', error);
      throw error;
    }
  }
}