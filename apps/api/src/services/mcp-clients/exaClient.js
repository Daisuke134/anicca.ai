import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class ExaMcpService {
  constructor() {
    this.client = null;
    this.transport = null;
  }

  async initialize() {
    if (this.client) {
      console.log('⚠️ Exa MCP service already initialized');
      return;
    }

    try {
      console.log('🚀 Starting Exa MCP server...');
      console.log('🔍 Environment check:');
      console.log('  NODE_ENV:', process.env.NODE_ENV);
      console.log('  Railway environment?', process.env.RAILWAY_ENVIRONMENT ? 'Yes' : 'No');
      console.log('  EXA_API_KEY:', process.env.EXA_API_KEY ? 'Set' : 'Not set');
      
      // StdioClientTransportを作成（これがサーバープロセスも起動する）
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: [
          '-y', 
          'exa-mcp-server',
          '--tools=web_search_exa,research_paper_search,company_research,crawling,competitor_finder,linkedin_search,wikipedia_search_exa,github_search'
        ],
        env: {
          ...process.env,
          EXA_API_KEY: process.env.EXA_API_KEY
        }
      });

      // MCPクライアントを作成
      this.client = new Client({
        name: 'anicca-exa-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // クライアントを接続
      await this.client.connect(this.transport);
      
      console.log('✅ Exa MCP client connected');
      
      // 利用可能なツールを確認
      try {
        console.log('📋 Listing available tools...');
        const tools = await this.client.listTools();
        console.log('🛠️ Available tools:', JSON.stringify(tools, null, 2));
      } catch (listError) {
        console.error('⚠️ Error listing tools:', listError);
        // エラーがあっても続行
      }
      
      console.log('✅ Exa MCP service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Exa MCP service:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  // クエリの内容から適切な検索ツールを選択
  selectSearchTool(query) {
    const lowerQuery = query.toLowerCase();
    
    // GitHub関連
    if (lowerQuery.includes('github') || lowerQuery.includes('repository') || lowerQuery.includes('repo')) {
      return 'github_search';
    }
    
    // 学術論文・研究
    if (lowerQuery.includes('paper') || lowerQuery.includes('research') || lowerQuery.includes('study') || 
        lowerQuery.includes('academic') || lowerQuery.includes('journal') || lowerQuery.includes('論文')) {
      return 'research_paper_search';
    }
    
    // 企業情報
    if (lowerQuery.includes('company') || lowerQuery.includes('企業') || lowerQuery.includes('会社') ||
        lowerQuery.includes('startup') || lowerQuery.includes('business')) {
      return 'company_research';
    }
    
    // LinkedIn
    if (lowerQuery.includes('linkedin')) {
      return 'linkedin_search';
    }
    
    // Wikipedia
    if (lowerQuery.includes('wikipedia') || lowerQuery.includes('wiki')) {
      return 'wikipedia_search_exa';
    }
    
    // URL指定（クローリング）
    if (lowerQuery.match(/https?:\/\/[^\s]+/)) {
      return 'crawling';
    }
    
    // 競合分析
    if (lowerQuery.includes('competitor') || lowerQuery.includes('競合')) {
      return 'competitor_finder';
    }
    
    // デフォルトは一般的なウェブ検索
    return 'web_search_exa';
  }

  async search(query, options = {}) {
    if (!this.client) {
      throw new Error('Exa MCP service not initialized');
    }

    try {
      // ツール名が明示的に指定されていればそれを使用、なければ自動選択（後方互換性のため）
      const toolName = options.tool || this.selectSearchTool(query);
      
      console.log(`🔍 Searching with Exa MCP: "${query}"`);
      console.log(`🎯 Using tool: ${toolName}`);
      console.log('🔧 Search options:', JSON.stringify(options, null, 2));
      
      // MCPツールを呼び出し
      const result = await this.client.callTool({
        name: toolName,
        arguments: {
          query,
          ...options
        }
      });

      console.log('✅ Exa MCP search completed');
      console.log('📊 Result:', JSON.stringify(result, null, 2));
      return result;
      
    } catch (error) {
      console.error('❌ Exa MCP search error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async close() {
    try {
      if (this.transport) {
        await this.transport.close();
      }
      this.client = null;
      this.transport = null;
      console.log('🔒 Exa MCP service closed');
    } catch (error) {
      console.error('❌ Error closing Exa MCP service:', error);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const exaMcpService = new ExaMcpService();