import { RealtimeAgent } from '@openai/agents/realtime';
import { setTracingDisabled, hostedMcpTool } from '@openai/agents';
import { allTools } from './tools';
import { getMCPTools } from './mcpServers';
// import { getGoogleCalendarTools } from './googleCalendarMCP';
import { resolveGoogleCalendarMcp } from './remoteMcp';

// RealtimeAgent作成（保存プロンプト運用に移行済みのため instructions は渡さない）
export const createAniccaAgent = async (userId?: string | null) => {
  // トレースを無効化（getAllMcpToolsのエラー回避）
  setTracingDisabled(true);

  // 既存のMCPツール取得（SlackなどGoogle Calendar以外）
  const mcpTools = await getMCPTools(userId);

  // Remote (hosted) MCP: Google Calendar（接続済み時のみ注入）
  const hostedMcpTools: any[] = [];
  if (userId) {
    try {
      const cfg = await resolveGoogleCalendarMcp(userId);
      if (cfg) {
        hostedMcpTools.push(
          hostedMcpTool({
            // カレンダー限定にするため serverLabel を明示
            serverLabel: 'google_calendar',
            serverUrl: cfg.serverUrl,
            // Authorization ヘッダに統一（server_url方式はauthorizationフィールドを使用しない）
            headers: {
              Authorization: cfg.authorization?.startsWith('Bearer ')
                ? cfg.authorization
                : `Bearer ${cfg.authorization}`
            },
            // カレンダーの実行系ツールのみ許可（Gmailは除外）
            allowedTools: {
              toolNames: [
                // Calendar
                'list_calendars',
                'get_events',
                'create_event',
                'modify_event',
                'delete_event'
              ]
            },
            requireApproval: 'never'
          })
        );
      } else {
        // 設定が未完了（未接続など）の場合は Calendar MCP のみスキップ
        console.warn('Google Calendar MCP not configured; skipping hosted tool registration');
      }
    } catch (e) {
      // ログにエラーを出し、Calendar MCP のみスキップ（他ツールは継続）
      console.error('Failed to resolve Google Calendar MCP:', e);
    }
  }

  // 全ツール結合
  const combinedTools = [...allTools, ...mcpTools, ...hostedMcpTools];

  return new RealtimeAgent({
    name: 'Anicca',
    tools: combinedTools,
    voice: 'alloy'
  });
};

