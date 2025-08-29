import { PROXY_URL } from '../config';

export type McpServerConfig = {
  serverLabel: string;
  serverUrl: string;
  authorization?: string;
};

/**
 * Resolve Google Calendar remote MCP server for the current user.
 * - If not connected, opens the OAuth URL in the browser and returns null.
 * - If connected, returns the hosted MCP tool configuration.
 */
// 起動時は何もしない（ブラウザを開かない）。接続確認のみ行う
export async function resolveGoogleCalendarMcp(userId: string): Promise<McpServerConfig | null> {
  const url = `${PROXY_URL}/api/composio/calendar-mcp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });

  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar MCP HTTP ${res.status} at ${url}: ${text.slice(0, 300)}`);
  }
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar MCP returned non-JSON at ${url} (content-type=${ct}). Body: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.connected && data.mcpUrl) {
    return { serverLabel: 'google_calendar', serverUrl: data.mcpUrl };
  }
  // 未接続時は null を返す（起動時はブラウザを開かない）
  return null;
}
