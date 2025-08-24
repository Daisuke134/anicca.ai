import { MCPServerSSE } from '@openai/agents';
import { Composio } from '@composio/core';

const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';

// Composio clientとMCPサーバーのインスタンスを管理
let composioClient: Composio | null = null;
let composioGoogleCalendarServer: MCPServerSSE | null = null;

export async function getComposioGoogleCalendarMCPServer(userId: string): Promise<MCPServerSSE> {
  if (composioGoogleCalendarServer) {
    return composioGoogleCalendarServer;
  }

  try {
    console.log('🔗 Initializing Composio Google Calendar MCP...');
    
    // Composio APIキーを取得
    console.log('📡 Getting Composio config from:', `${PROXY_URL}/api/composio/config`);
    const configResponse = await fetch(`${PROXY_URL}/api/composio/config`);
    
    if (!configResponse.ok) {
      const errorText = await configResponse.text();
      console.error('❌ Config response error:', configResponse.status, errorText);
      throw new Error(`Failed to get Composio config: ${configResponse.status}`);
    }
    
    const configData = await configResponse.json();
    console.log('✅ Got Composio config');
    
    // Composioクライアント初期化（将来の拡張用に保持）
    if (!composioClient) {
      composioClient = new Composio({ apiKey: configData.apiKey });
      console.log('✅ Composio client initialized');
    }
    
    // MCP ID取得
    console.log('📡 Getting MCP config from:', `${PROXY_URL}/api/composio/mcp-config`);
    const mcpResponse = await fetch(`${PROXY_URL}/api/composio/mcp-config`);
    
    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      console.error('❌ MCP config response error:', mcpResponse.status, errorText);
      throw new Error(`Failed to get MCP config: ${mcpResponse.status}`);
    }
    
    const mcpData = await mcpResponse.json();
    console.log('✅ Got MCP config:', mcpData);
    
    // Composio SDK経由でMCP URLを取得（公式推奨方法）
    console.log('🔍 Getting server URLs via SDK for user:', userId, 'MCP ID:', mcpData.mcpId);
    
    // 公式ドキュメント通りの正しい呼び出し方
    const serverUrls = await composioClient.mcp.getServer(
      mcpData.mcpId,      // 第1引数: サーバーID
      userId              // 第2引数: ユーザーID  
    );
    
    console.log('✅ Got Composio MCP URLs from SDK:', serverUrls);
    
    // 配列の最初のURLを取得
    const mcpUrl = serverUrls[0]?.url?.toString();
    if (!mcpUrl) {
      console.error('❌ No MCP URL found in SDK response:', serverUrls);
      throw new Error('No MCP URL found in SDK response');
    }
    
    console.log('🚀 Connecting to MCP URL:', mcpUrl);
    
    // MCPサーバー作成
    composioGoogleCalendarServer = new MCPServerSSE({
      url: mcpUrl,
      name: 'Composio Google Calendar',
      cacheToolsList: true
    });
    
    await composioGoogleCalendarServer.connect();
    console.log('🎉 Composio Google Calendar MCP connected successfully!');
    return composioGoogleCalendarServer;
    
  } catch (error) {
    console.error('💥 Failed to initialize Composio MCP:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    throw error;
  }
}

export async function cleanupComposioMCPServers(): Promise<void> {
  if (composioGoogleCalendarServer) {
    await composioGoogleCalendarServer.close();
    composioGoogleCalendarServer = null;
  }
}