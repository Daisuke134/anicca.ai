import { MCPServerStdio, getAllMcpTools, withTrace } from '@openai/agents';
import type { Tool } from '@openai/agents';
import path from 'path';
import os from 'os';


export async function initializeMCPServers(userId?: string | null) {
  const servers: MCPServerStdio[] = [];
  
  // Filesystem MCP Server（~/.aniccaのみアクセス可能）
  const filesystemServer = new MCPServerStdio({
    name: 'filesystem-mcp',
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      path.join(os.homedir(), '.anicca')  // セキュリティ: ~/.aniccaのみ
    ]
  });
  
  servers.push(filesystemServer);

  // 各サーバーに接続
  for (const server of servers) {
    try {
      await server.connect();
      console.log(`✅ Connected to ${server.name}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${server.name}:`, error);
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
    // getAllMcpToolsでツールを事前に展開（RealtimeAgentの要件）
    const allMcpTools = await withTrace('getMCPTools', async () => {
      return await getAllMcpTools({
        mcpServers: servers,
        convertSchemasToStrict: true
      });
    });
    
    console.log(`📦 Loaded ${allMcpTools.length} MCP tools from ${servers.length} servers`);
    return allMcpTools;
  } catch (error) {
    console.error('Failed to get MCP tools:', error);
    return [];
  }
}