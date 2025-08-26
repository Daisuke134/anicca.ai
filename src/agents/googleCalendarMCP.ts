import { MCPServerStreamableHttp, getAllMcpTools } from '@openai/agents';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import type { Tool } from '@openai/agents';

const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';

let calendarServer: MCPServerStreamableHttp | null = null;
let cachedTools: Tool[] | null = null;
let lastUserId: string | null = null;

// カレンダーツール初期化
async function initializeCalendarTools(mcpUrl: string): Promise<void> {
  if (calendarServer) {
    await calendarServer.close();
  }
  
  console.log('🚀 Connecting to Google Calendar MCP:', mcpUrl);
  calendarServer = new MCPServerStreamableHttp({
    url: mcpUrl,
    name: 'Google Calendar',
    cacheToolsList: true
  });
  
  await calendarServer.connect();
  
  cachedTools = await getAllMcpTools({
    mcpServers: [calendarServer],
    convertSchemasToStrict: true
  });
  
  console.log(`✅ Google Calendar MCP connected with ${cachedTools.length} tools`);
}

// カレンダー接続用のツール
const connectCalendarTool = tool({
  name: 'connect_google_calendar',
  description: 'Google Calendarを接続',
  parameters: z.object({}),
  execute: async () => {
    const userId = process.env.CURRENT_USER_ID || 'desktop-user';
    
    // キャッシュをクリア（重要！）
    cachedTools = null;
    calendarServer = null;
    
    const response = await fetch(`${PROXY_URL}/api/composio/calendar-mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    console.log('Calendar MCP response:', data);
    
    if (!data.connected && data.authUrl) {
      const { shell } = require('electron');
      shell.openExternal(data.authUrl);
      return 'Google Calendar認証ページを開きました。ブラウザで認証を完了してから、もう一度「カレンダーを確認して」と言ってください。';
    }
    
    if (data.connected) {
      // 接続済みの場合、ツールを再読み込み
      try {
        await initializeCalendarTools(data.mcpUrl);
        return 'Google Calendarが接続されました。カレンダーの操作が可能です。';
      } catch (error) {
        console.error('Failed to initialize calendar tools:', error);
        return 'Google Calendarは接続されていますが、ツールの初期化に失敗しました。';
      }
    }
    
    return 'Google Calendar接続状態の確認に失敗しました。';
  }
});

export async function getGoogleCalendarTools(userId: string): Promise<Tool[]> {
  try {
    // ユーザーが変わったらキャッシュをクリア
    if (lastUserId && lastUserId !== userId) {
      cachedTools = null;
      calendarServer = null;
    }
    lastUserId = userId;
    
    // キャッシュがあればそれを返す
    if (cachedTools && calendarServer) {
      return cachedTools;
    }
    
    console.log('🔗 Checking Google Calendar connection...');
    
    const response = await fetch(`${PROXY_URL}/api/composio/calendar-mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    const data = await response.json();
    console.log('Calendar MCP status:', data);
    
    if (!data.connected) {
      console.log('❌ Google Calendar not connected - authentication required');
      return [connectCalendarTool as unknown as Tool];
    }
    
    // 接続済みなら初期化
    await initializeCalendarTools(data.mcpUrl);
    return [...cachedTools!, connectCalendarTool as unknown as Tool];
    
  } catch (error) {
    console.error('❌ Failed to get Google Calendar tools:', error);
    return [connectCalendarTool as unknown as Tool];
  }
}

export async function cleanupGoogleCalendarServer(): Promise<void> {
  if (calendarServer) {
    await calendarServer.close();
    calendarServer = null;
  }
  cachedTools = null;
  lastUserId = null;
}