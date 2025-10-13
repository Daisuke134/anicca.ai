import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import fetch, { RequestInit } from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getAuthService } from '../services/desktopAuthService';
import { PORTS, PROXY_URL, API_ENDPOINTS } from '../config';
import { advanceRoutineStepForTool } from '../services/routines';
import { ensureWakeAdvanceAllowed, markWakeRoutineInactive } from './wakeAdvanceGate';

async function proxyFetch(url: string, init: RequestInit = {}) {
  const auth = getAuthService();
  const jwt = await auth.getProxyJwt();
  if (!jwt) {
    const err: any = new Error('Login required.');
    err.name = 'ProxyAuthError';
    throw err;
  }
  const headers: Record<string, string> = {};
  const original = init.headers as any;
  if (Array.isArray(original)) {
    for (const [key, value] of original) {
      headers[String(key)] = String(value);
    }
  } else if (original && typeof original.forEach === 'function') {
    original.forEach((value: string, key: string) => {
      headers[key] = value;
    });
  } else if (original) {
    for (const [key, value] of Object.entries(original as Record<string, string>)) {
      headers[key] = value;
    }
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  headers['Authorization'] = `Bearer ${jwt}`;
  return fetch(url, { ...init, headers });
}

// 1. get_hacker_news_stories
export const get_hacker_news_stories = tool({
  name: 'get_hacker_news_stories',
  description: 'Get the latest Hacker News stories',
  parameters: z.object({
    count: z.number().default(10).describe('Number of stories to fetch')
  }),
  execute: async ({ count }) => {
    try {
      const response = await proxyFetch(`${PROXY_URL}/api/tools/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error fetching news: ${error.message}`;
    }
  }
});

// 2. search_exa
export const search_exa = tool({
  name: 'search_exa',
  description: 'Search the web using Exa API',
  parameters: z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().default(5).describe('Number of results')
  }),
  execute: async ({ query, numResults }) => {
    try {
      const response = await proxyFetch(`${PROXY_URL}/api/tools/search_exa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, numResults })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error searching: ${error.message}`;
    }
  }
});

// 3. connect_slack
export const connect_slack = tool({
  name: 'connect_slack',
  description: 'Connect to Slack workspace',
  parameters: z.object({}),
  execute: async () => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(`${API_ENDPOINTS.SLACK.OAUTH_URL}?userId=${userId}`);
      const data = await response.json();
      const launchUrl = data.url || data.authUrl; // 後方互換
      if (launchUrl) {
        const { shell } = require('electron');
        shell.openExternal(launchUrl);
        return 'Opened the Slack sign-in page. Please finish authentication in your browser.';
      }
      return 'Failed to retrieve the Slack connection URL.';
    } catch (error: any) {
      return `Error connecting to Slack: ${error.message}`;
    }
  }
});

// 4. slack_list_channels
export const slack_list_channels = tool({
  name: 'slack_list_channels',
  description: 'List all Slack channels',
  parameters: z.object({
    limit: z.number().default(30).describe('Maximum number of channels to list (default: 30)')
  }),
  execute: async (params) => {
    try {
      // パラメータをデフォルト値と組み合わせ
      const { limit = 30 } = params || {};
      
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_channels',
          userId,
          arguments: { limit }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error listing channels: ${error.message}`;
    }
  }
});

// 5. slack_send_message
export const slack_send_message = tool({
  name: 'slack_send_message',
  description: 'Send a message to a Slack channel. DO NOT use for replies - use slack_reply_to_thread instead',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    message: z.string().describe('Message to send')
  }),
  execute: async ({ channel, message }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          userId,
          arguments: { channel, message }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error sending message: ${error.message}`;
    }
  }
});

// 6. slack_get_channel_history
export const slack_get_channel_history = tool({
  name: 'slack_get_channel_history',
  description: 'Get message history from a Slack channel. Optionally specify limit parameter',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    limit: z.number().default(10).describe('Number of messages to retrieve (default: 10)')
  }),
  execute: async (params) => {
    try {
      // パラメータをデフォルト値と組み合わせ
      const { channel, limit = 10 } = params || {};
      
      // パラメータ検証を追加
      if (!channel) {
        return JSON.stringify({
          error: "Channel parameter is required",
          suggestion: "Please specify a channel name (e.g., 'general')"
        });
      }
      
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_channel_history',
          userId,
          arguments: { channel, limit }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error getting history: ${error.message}`;
    }
  }
});

// 7. slack_add_reaction
export const slack_add_reaction = tool({
  name: 'slack_add_reaction',
  description: 'Add a reaction emoji to a Slack message',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    timestamp: z.string().describe('Message timestamp'),
    name: z.string().describe('Emoji name without colons')
  }),
  execute: async ({ channel, timestamp, name }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_reaction',
          userId,
          arguments: { channel, timestamp, name }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error adding reaction: ${error.message}`;
    }
  }
});

// 8. slack_reply_to_thread
export const slack_reply_to_thread = tool({
  name: 'slack_reply_to_thread',
  description: 'Reply to a message in a Slack thread',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    message: z.string().describe('Reply message'),
    thread_ts: z.string().describe('Thread timestamp of the message to reply to')
  }),
  execute: async ({ channel, message, thread_ts }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply_to_thread',
          userId,
          arguments: { channel, message, thread_ts }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error replying to thread: ${error.message}`;
    }
  }
});

// 9. slack_get_thread_replies
export const slack_get_thread_replies = tool({
  name: 'slack_get_thread_replies',
  description: 'Get all replies in a Slack thread',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    thread_ts: z.string().describe('Thread timestamp')
  }),
  execute: async ({ channel, thread_ts }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await proxyFetch(API_ENDPOINTS.TOOLS.SLACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_thread_replies',
          userId,
          arguments: { channel, thread_ts }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error getting thread replies: ${error.message}`;
    }
  }
});





// 10. advance_routine_step
export const advance_routine_step = tool({
  name: 'advance_routine_step',
  description: 'ルーティン手順を1つ進める。ユーザーが現在の手順を完了した直後に必ず呼び出す。',
  parameters: z.object({
    routineId: z.string().describe('ルーティンID（例: sleep）'),
    acknowledgedStep: z.string().nullable().describe('完了した手順の補足メモ（任意）')
  }),
  execute: async ({ routineId, acknowledgedStep }) => {
    try {
      ensureWakeAdvanceAllowed(routineId);
      const result = advanceRoutineStepForTool(routineId, acknowledgedStep);
      if (result.routineId === 'wake' && result.completed) {
        markWakeRoutineInactive('routine_done');
      }
      return JSON.stringify(result);
    } catch (error: any) {
      return JSON.stringify({
        status: 'error',
        message: error?.message || String(error)
      });
    }
  }
});

// 11. open_url
export const open_url = tool({
  name: 'open_url',
  description: 'URLをデフォルトアプリケーションで開く（Webサイト、Zoomリンク等）',
  parameters: z.object({
    url: z.string().describe('開くURL（http://, https://, zoommtg://等）'),
  }),
  execute: async ({ url }) => {
    try {
      const { shell } = require('electron');
      await shell.openExternal(url);
      return `Successfully opened: ${url}`;
    } catch (error: any) {
      return `Failed to open URL: ${error.message}`;
    }
  },
});

// 12. connect_google_calendar
export const connect_google_calendar = tool({
  name: 'connect_google_calendar',
  description: 'Google Calendarを接続',
  parameters: z.object({}),
  execute: async () => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      let statusResponse;
      try {
        statusResponse = await proxyFetch(`${PROXY_URL}/api/mcp/gcal/status`, {
          method: 'POST',
          body: JSON.stringify({ userId })
        });
      } catch (err: any) {
        if (err?.code === 'PAYMENT_REQUIRED') {
          return 'The free tier limit has been reached. Use the tray menu to upgrade to Anicca Pro.';
        }
        if (err?.name === 'ProxyAuthError') {
          return 'Please sign in to continue.';
        }
        throw err;
      }
      if (!statusResponse.ok) {
        console.warn(`Google Calendar status check failed: ${statusResponse.status}`);
        return 'Failed to check the Google Calendar connection status.';
      }

      const statusData = await statusResponse.json();
      console.log('Calendar MCP status:', {
        connected: !!statusData?.connected,
        server_url: statusData?.server_url || 'hidden'
      });

      if (!statusData.connected || !statusData.authorization) {
        let oauthResponse;
        try {
          oauthResponse = await proxyFetch(`${PROXY_URL}/api/mcp/gcal/oauth-url?userId=${userId}`);
        } catch (err: any) {
          if (err?.code === 'PAYMENT_REQUIRED') {
            return 'The free tier limit has been reached. Use the tray menu to upgrade to Anicca Pro.';
          }
          if (err?.name === 'ProxyAuthError') {
            return 'Please sign in to continue.';
          }
          throw err;
        }
        if (!oauthResponse.ok) {
          console.warn(`Google Calendar OAuth URL fetch failed: ${oauthResponse.status}`);
          return 'Failed to retrieve the Google Calendar authorization URL.';
        }
        const oauthData = await oauthResponse.json();
        if (oauthData.url) {
          const { shell } = require('electron');
          shell.openExternal(oauthData.url);
          return 'Opened the Google Calendar authorization page. Complete the sign-in in your browser, then ask me to check the calendar again.';
        }
        console.warn('Google Calendar OAuth URL payload did not include url');
        return 'Failed to retrieve the Google Calendar authorization URL.';
      }

      if (statusData.connected && statusData.authorization) {
        return 'Google Calendar is already connected. You can manage your calendar now.';
      }

      console.warn('Google Calendar status response did not meet connected criteria');
      return 'Failed to check the Google Calendar connection status.';
    } catch (e: any) {
      console.error('connect_google_calendar failed:', e);
      return 'An unexpected error occurred while connecting Google Calendar.';
    }
  }
});

// 13. disconnect_google_calendar
export const disconnect_google_calendar = tool({
  name: 'disconnect_google_calendar',
  description: 'Google Calendarの接続を解除する（音声コマンド用）',
  parameters: z.object({}),
  execute: async () => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      let resp;
      try {
        resp = await proxyFetch(`${PROXY_URL}/api/mcp/gcal/disconnect`, {
          method: 'POST',
          body: JSON.stringify({ userId })
        });
      } catch (err: any) {
        if (err?.code === 'PAYMENT_REQUIRED') {
          return 'The free tier limit has been reached. Use the tray menu to upgrade to Anicca Pro.';
        }
        if (err?.name === 'ProxyAuthError') {
          return 'Please sign in to continue.';
        }
        throw err;
      }
      if (!resp.ok) {
        return `Failed to disconnect Google Calendar (HTTP ${resp.status}).`;
      }
      try {
        await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/sdk/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch { /* noop */ }
      return 'Google Calendar has been disconnected.';
    } catch (e: any) {
      return `An error occurred while disconnecting Google Calendar: ${e.message}`;
    }
  }
});

// 14. start_google_login（音声からブラウザログインを起動）
export const start_google_login = tool({
  name: 'start_google_login',
  description: 'Googleアカウントでのログインフローを開始する',
  parameters: z.object({}),
  execute: async () => {
    const auth = getAuthService();
    if (auth.isAuthenticated()) {
      return JSON.stringify({ status: 'already_authenticated' });
    }
    const { shell } = require('electron');
    const url = await auth.getGoogleOAuthUrl();
    shell.openExternal(url);
    return JSON.stringify({ status: 'launched', url });
  }
});

// 15. get_current_time（外部API非依存：OSのIANA TZを返す）
export const get_current_time = tool({
  name: 'get_current_time',
  description: '現在の時刻を取得（ユーザーの場所に基づく）',
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return JSON.stringify({ datetime: now.toISOString(), timezone: tz });
  }
});

// 16. convert_time（ISO日時→指定IANA TZの人間可読表示）
export const convert_time = tool({
  name: 'convert_time',
  description: 'ISO日時を指定IANAタイムゾーンのローカル時刻に変換（人間可読）',
  parameters: z.object({
    datetime: z.string().describe('ISO 8601 datetime（例: 2025-09-02T05:41:00Z）'),
    to_timezone: z.string().describe('IANA TZ（例: Asia/Tokyo）'),
    locale: z.string().nullable().describe('表示ロケール。null のときはOS既定ロケール')
  }),
  execute: async ({ datetime, to_timezone, locale }) => {
    try {
      const d = new Date(datetime);
      if (isNaN(d.getTime())) return 'Invalid datetime';
      // locale が null の場合は OS 既定ロケール（Intl に undefined を渡す）
      const fmt = new Intl.DateTimeFormat(locale ?? undefined, {
        timeZone: to_timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      const human = fmt.format(d);
      return JSON.stringify({ human, timezone: to_timezone, source: datetime });
    } catch (e: any) {
      return `convert_time error: ${e.message}`;
    }
  }
});

// すべてのツールをエクスポート
export const allTools = [
  get_hacker_news_stories,
  search_exa,
  connect_slack,
  slack_list_channels,
  slack_send_message,
  slack_get_channel_history,
  slack_add_reaction,
  slack_reply_to_thread,
  slack_get_thread_replies,
  advance_routine_step,
  open_url,
  connect_google_calendar,
  disconnect_google_calendar,
  start_google_login,
  get_current_time,
  convert_time,
];
