import { shell } from 'electron';
import { PROXY_URL } from '../config';

export type McpServerConfig = {
  serverLabel: string;
  serverUrl: string;
  authorization?: string;
  requireApproval?: 'never' | 'manual';
};

/**
 * Resolve Google Calendar remote MCP server for the current user.
 * - If not connected, opens the OAuth URL in the browser and returns null.
 * - If connected, returns the hosted MCP tool configuration.
 */
export async function resolveGoogleCalendarMcp(userId: string): Promise<McpServerConfig | null> {
  const res = await fetch(`${PROXY_URL}/api/composio/calendar-mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });

  const data = await res.json();

  if (!data.connected && data.authUrl) {
    await shell.openExternal(data.authUrl);
    return null; // User must complete OAuth then try again
  }

  if (data.connected && data.mcpUrl) {
    return {
      serverLabel: 'google_calendar',
      serverUrl: data.mcpUrl,
      requireApproval: 'never'
      // authorization: data.authToken ?? undefined,
    };
  }

  return null;
}

