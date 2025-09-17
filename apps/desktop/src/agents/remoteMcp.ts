import { PROXY_URL } from '../config';
import { isOnline } from '../services/network';
import { getAuthService } from '../services/desktopAuthService';

export type McpServerConfig = {
  serverLabel: string;
  serverUrl: string;
  authorization?: string;
};

/**
 * Resolve Google Calendar remote MCP server using workspace-mcp
 * - Uses workspace-mcp deployed on Railway with multi-user OAuth support
 * - Returns MCP configuration if available, null otherwise
 */
export async function resolveGoogleCalendarMcp(userId: string): Promise<McpServerConfig | null> {
  try {
    if (!(await isOnline())) {
      console.log('🛑 Offline - skip MCP status check');
      return null;
    }
    const statusUrl = `${PROXY_URL}/api/mcp/gcal/status`;
    let token: string | null = null;
    try {
      token = await getAuthService().getProxyJwt();
    } catch (err: any) {
      if (err?.code === 'PAYMENT_REQUIRED') {
        console.warn('MCP status check skipped: payment required');
        return null;
      }
      throw err;
    }
    if (!token) {
      console.warn('No proxy token available for MCP status');
      return null;
    }
    const statusRes = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ userId })
    });

    if (!statusRes.ok) {
      console.error(`MCP status check failed: ${statusRes.status}`);
      return null;
    }

    const statusData = await statusRes.json();
    
    if (statusData.connected && statusData.server_url && statusData.authorization) {
      console.log('✅ Google Calendar MCP connected via workspace-mcp');
      return {
        serverLabel: 'google_calendar',
        serverUrl: statusData.server_url,
        authorization: statusData.authorization
      };
    }
    // 接続未完了（認可トークン未取得など）
    console.warn('Google Calendar MCP not configured');
    return null;
  } catch (error) {
    console.error('Failed to resolve Google Calendar MCP:', error);
    return null;
  }
}

/**
 * Get OAuth URL for Google Calendar connection
 */
export async function getGoogleCalendarOAuthUrl(userId: string): Promise<string | null> {
  try {
    let token: string | null = null;
    try {
      token = await getAuthService().getProxyJwt();
    } catch (err: any) {
      if (err?.code === 'PAYMENT_REQUIRED') {
        console.warn('OAuth URL fetch skipped: payment required');
        return null;
      }
      throw err;
    }
    if (!token) {
      return null;
    }
    const url = `${PROXY_URL}/api/mcp/gcal/oauth-url?userId=${userId}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      console.error(`Failed to get OAuth URL: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    return data.url;
  } catch (error) {
    console.error('Failed to get OAuth URL:', error);
    return null;
  }
}
