import { MCPServerStdio, getAllMcpTools, withTrace } from '@openai/agents';
import type { Tool } from '@openai/agents';


export async function initializeMCPServers(userId?: string | null) {
  // 型を明示的に指定
  const servers: MCPServerStdio[] = [];
  

  // 各サーバーに接続
  for (const server of servers) {
    try {
      await server.connect();
      console.log(`✅ Connected to ${server.name}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${server.name}:`, error);
      // エラーの詳細を出力
      if (error instanceof Error) {
        console.error(`   Error message: ${error.message}`);
      }
    }
  }

  return servers;
}


export async function getMCPTools(userId?: string | null): Promise<Tool[]> {
  const servers = await initializeMCPServers(userId);
  
  if (servers.length === 0) {
    console.warn('No MCP servers available');
    return [];
  }

  try {
    // withTraceでラップしてMCPツールを取得
    const allMcpTools = await withTrace('getMCPTools', async () => {
      return await getAllMcpTools({
        mcpServers: servers,
        convertSchemasToStrict: true
      });
    });
    
    console.log(`📦 Loaded ${allMcpTools.length} MCP tools from ${servers.length} servers`);
    allMcpTools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.type === 'function' ? tool.description : 'No description'}`);
    });
    
    return allMcpTools;
  } catch (error) {
    console.error('Failed to get MCP tools:', error);
    return [];
  }
}