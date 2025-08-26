import { MCPServerStreamableHttp, getAllMcpTools } from '@openai/agents';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import type { Tool } from '@openai/agents';

const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';

let calendarServer: MCPServerStreamableHttp | null = null;
let cachedTools: Tool[] | null = null;

// カレンダー接続用のツール
const connectCalendarTool = tool({
  name: 'connect_google_calendar',
  description: 'Google Calendarを接続',
  parameters: z.object({}),
  execute: async () => {
    const userId = process.env.CURRENT_USER_ID || 'desktop-user';
    
    const response = await fetch(`${PROXY_URL}/api/composio/calendar-mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    
    if (!data.connected && data.authUrl) {
      const { shell } = require('electron');
      shell.openExternal(data.authUrl);
      return 'Google Calendar認証ページを開きました。ブラウザで認証を完了してください。';
    }
    
    return 'Google Calendarは既に接続されています。';
  }
});

export async function getGoogleCalendarTools(userId: string): Promise<Tool[]> {
  try {
    if (cachedTools && calendarServer) {
      return cachedTools;
    }
    
    console.log('🔗 Initializing Google Calendar MCP...');
    
    const response = await fetch(`${PROXY_URL}/api/composio/calendar-mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    
    if (!data.connected) {
      console.log('❌ Google Calendar not connected - authentication required');
      return [connectCalendarTool as unknown as Tool];
    }
    
    // MCPServerStreamableHttpで接続（文字列URLをそのまま使用）
    console.log('🚀 Connecting to Google Calendar MCP:', data.mcpUrl);
    calendarServer = new MCPServerStreamableHttp({
      url: data.mcpUrl,  // そのまま文字列URL
      name: 'Google Calendar',
      cacheToolsList: true
    });
    
    await calendarServer.connect();
    
    // ツールを展開
    cachedTools = await getAllMcpTools({
      mcpServers: [calendarServer],
      convertSchemasToStrict: true
    });
    
    console.log(`✅ Google Calendar MCP connected with ${cachedTools.length} tools`);
    return cachedTools;
    
  } catch (error) {
    console.error('❌ Failed to get Google Calendar tools:', error);
    return [connectCalendarTool as unknown as Tool];
  }
}

export async function cleanupGoogleCalendarServer(): Promise<void> {
  if (calendarServer) {
    await calendarServer.close();
    calendarServer = null;
    cachedTools = null;
  }
}