import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';

// 1. get_hacker_news_stories
export const get_hacker_news_stories = tool({
  name: 'get_hacker_news_stories',
  description: 'Get the latest Hacker News stories',
  parameters: z.object({
    count: z.number().default(10).describe('Number of stories to fetch')
  }),
  execute: async ({ count }) => {
    try {
      const response = await fetch(`${PROXY_URL}/api/tools/news`, {
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
      const response = await fetch(`${PROXY_URL}/api/tools/search_exa`, {
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

// 3. think_with_claude
export const think_with_claude = tool({
  name: 'think_with_claude',
  description: 'Send complex tasks to Claude for execution. Use for app creation, coding, etc.',
  parameters: z.object({
    task: z.string().describe('Task description for Claude')
  }),
  needsApproval: true,
  execute: async ({ task }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/execution/parallel-sdk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          task: {
            type: 'general',
            originalRequest: task,
            userId
          }
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error executing task: ${error.message}`;
    }
  }
});

// 4. connect_slack
export const connect_slack = tool({
  name: 'connect_slack',
  description: 'Connect to Slack workspace',
  parameters: z.object({}),
  execute: async () => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/auth/slack/oauth-url?userId=${userId}`);
      const data = await response.json();
      if (data.authUrl) {
        const { shell } = require('electron');
        shell.openExternal(data.authUrl);
        return 'Slackの認証ページを開きました。ブラウザで認証を完了してください。';
      }
      return 'Slack接続URLの取得に失敗しました';
    } catch (error: any) {
      return `Error connecting to Slack: ${error.message}`;
    }
  }
});

// 5. slack_list_channels
export const slack_list_channels = tool({
  name: 'slack_list_channels',
  description: 'List all Slack channels',
  parameters: z.object({}),
  execute: async () => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list_channels',
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error listing channels: ${error.message}`;
    }
  }
});

// 6. slack_send_message
export const slack_send_message = tool({
  name: 'slack_send_message',
  description: 'Send a message to a Slack channel. DO NOT use for replies - use slack_reply_to_thread instead',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    message: z.string().describe('Message to send')
  }),
  needsApproval: true,
  execute: async ({ channel, message }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          channel,
          message,
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error sending message: ${error.message}`;
    }
  }
});

// 7. slack_get_channel_history
export const slack_get_channel_history = tool({
  name: 'slack_get_channel_history',
  description: 'Get message history from a Slack channel. Always specify limit parameter',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    limit: z.number().default(10).describe('Number of messages to retrieve')
  }),
  execute: async ({ channel, limit }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_channel_history',
          channel,
          limit,
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error getting history: ${error.message}`;
    }
  }
});

// 8. slack_add_reaction
export const slack_add_reaction = tool({
  name: 'slack_add_reaction',
  description: 'Add a reaction emoji to a Slack message',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    timestamp: z.string().describe('Message timestamp'),
    name: z.string().describe('Emoji name without colons')
  }),
  needsApproval: true,
  execute: async ({ channel, timestamp, name }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_reaction',
          channel,
          timestamp,
          name,
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error adding reaction: ${error.message}`;
    }
  }
});

// 9. slack_reply_to_thread
export const slack_reply_to_thread = tool({
  name: 'slack_reply_to_thread',
  description: 'Reply to a message in a Slack thread',
  parameters: z.object({
    channel: z.string().describe('Channel name without #'),
    message: z.string().describe('Reply message'),
    thread_ts: z.string().describe('Thread timestamp of the message to reply to')
  }),
  needsApproval: true,
  execute: async ({ channel, message, thread_ts }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply_to_thread',
          channel,
          message,
          thread_ts,
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error replying to thread: ${error.message}`;
    }
  }
});

// 10. slack_get_thread_replies
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
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_thread_replies',
          channel,
          thread_ts,
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error getting thread replies: ${error.message}`;
    }
  }
});

// 11. text_to_speech
export const text_to_speech = tool({
  name: 'text_to_speech',
  description: 'ElevenLabsで高品質な音声を生成',
  parameters: z.object({
    text: z.string().describe('読み上げるテキスト'),
    voice: z.string().default('Rachel').describe('音声の種類（Rachel=優しい女性、Drew=元気な男性、Clyde=力強い男性）')
  }),
  execute: async ({ text, voice }) => {
    try {
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voice || 'Rachel',
          userId
        })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error generating speech: ${error.message}`;
    }
  }
});

// 12. play_audio
export const play_audio = tool({
  name: 'play_audio',
  description: '生成された音声ファイルを再生',
  parameters: z.object({
    file_path: z.string().describe('再生する音声ファイルのパス')
  }),
  execute: async ({ file_path }) => {
    try {
      const response = await fetch(`${PROXY_URL}/api/tools/play-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path })
      });
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error: any) {
      return `Error playing audio: ${error.message}`;
    }
  }
});

// 13. read_file
export const read_file = tool({
  name: 'read_file',
  description: 'Read contents of a file',
  parameters: z.object({
    path: z.string().describe('File path relative to ~/.anicca/ or absolute path')
  }),
  execute: async ({ path: filePath }) => {
    try {
      // Handle relative path to ~/.anicca/
      let resolvedPath = filePath;
      if (!filePath.startsWith('/')) {
        resolvedPath = path.join(os.homedir(), '.anicca', filePath);
      } else {
        resolvedPath = filePath.replace('~', os.homedir());
      }
      
      const content = await fs.readFile(resolvedPath, 'utf8');
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  }
});

// 14. write_file
export const write_file = tool({
  name: 'write_file',
  description: 'Write content to a file or update scheduled tasks',
  parameters: z.object({
    path: z.string().describe('File path relative to ~/.anicca/ or absolute path'),
    content: z.string().describe('Content to write')
  }),
  needsApproval: true,
  execute: async ({ path: filePath, content }) => {
    try {
      // Handle relative path to ~/.anicca/
      let resolvedPath = filePath;
      if (!filePath.startsWith('/')) {
        resolvedPath = path.join(os.homedir(), '.anicca', filePath);
      } else {
        resolvedPath = filePath.replace('~', os.homedir());
      }
      
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(resolvedPath, content, 'utf8');
      
      // scheduled_tasks.jsonの場合は、メインプロセスに通知
      if (resolvedPath.includes('scheduled_tasks.json')) {
        process.send?.({ type: 'RELOAD_SCHEDULED_TASKS' });
      }
      
      return `File written successfully to ${filePath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }
});

// すべてのツールをエクスポート
export const allTools = [
  get_hacker_news_stories,
  search_exa,
  think_with_claude,
  connect_slack,
  slack_list_channels,
  slack_send_message,
  slack_get_channel_history,
  slack_add_reaction,
  slack_reply_to_thread,
  slack_get_thread_replies,
  text_to_speech,
  play_audio,
  read_file,
  write_file
];