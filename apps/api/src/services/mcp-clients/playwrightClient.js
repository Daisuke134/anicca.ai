import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class PlaywrightMcpService {
  constructor() {
    this.client = null;
    this.transport = null;
  }

  async initialize() {
    if (this.client) {
      console.log('⚠️ Playwright MCP service already initialized');
      return;
    }

    try {
      console.log('🚀 Starting Playwright MCP server...');
      console.log('🔍 Environment check:');
      console.log('  NODE_ENV:', process.env.NODE_ENV);
      console.log('  Railway environment?', process.env.RAILWAY_ENVIRONMENT ? 'Yes' : 'No');
      
      // StdioClientTransportを作成（これがサーバープロセスも起動する）
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: [
          '-y',
          '@playwright/mcp@latest',
          '--browser=chrome',  // Chromeを使用（YouTube再生に最適）
          '--connect-over-cdp' // ユーザーのブラウザを直接操作
        ],
        env: {
          ...process.env
        }
      });

      // MCPクライアントを作成
      this.client = new Client({
        name: 'anicca-playwright-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // クライアントを接続
      await this.client.connect(this.transport);
      
      console.log('✅ Playwright MCP client connected');
      
      // 利用可能なツールを確認
      const tools = await this.client.listTools();
      console.log('🛠️ Available Playwright tools:', tools.tools.map(t => t.name));
      
    } catch (error) {
      console.error('❌ Failed to initialize Playwright MCP:', error);
      throw error;
    }
  }

  async callTool(toolName, args) {
    if (!this.client) {
      throw new Error('Playwright MCP client not initialized');
    }

    try {
      console.log(`🎯 Calling Playwright tool: ${toolName}`, args);
      
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });
      
      console.log(`✅ Playwright tool ${toolName} completed`);
      return result;
    } catch (error) {
      console.error(`❌ Playwright tool ${toolName} error:`, error);
      throw error;
    }
  }

  async shutdown() {
    if (this.transport) {
      console.log('🔌 Shutting down Playwright MCP...');
      await this.transport.close();
      this.client = null;
      this.transport = null;
    }
  }
}

// シングルトンインスタンスをエクスポート
export const playwrightMcpService = new PlaywrightMcpService();