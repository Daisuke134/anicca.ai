import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getAuthService } from '../services/desktopAuthService';

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
  parameters: z.object({
    limit: z.number().default(30).describe('Maximum number of channels to list (default: 30)')
  }),
  execute: async (params) => {
    try {
      // パラメータをデフォルト値と組み合わせ
      const { limit = 30 } = params || {};
      
      const userId = process.env.CURRENT_USER_ID || 'desktop-user';
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
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

// 6. slack_send_message
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
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
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

// 7. slack_get_channel_history
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
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
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

// 8. slack_add_reaction
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
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
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

// 9. slack_reply_to_thread
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
      const response = await fetch(`${PROXY_URL}/api/tools/slack`, {
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
  execute: async ({ path: filePath, content }) => {
    try {
      // Handle relative path to ~/.anicca/
      let resolvedPath = filePath;
      if (filePath.startsWith('~/')) {
        // ~/path の場合：~ を os.homedir() に置換
        resolvedPath = filePath.replace('~', os.homedir());
      } else if (filePath.startsWith('/')) {
        // 絶対パスの場合：そのまま使用
        resolvedPath = filePath;
      } else {
        // 相対パスの場合：~/.anicca/ に追加
        resolvedPath = path.join(os.homedir(), '.anicca', filePath);
      }
      
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      // JSONファイルの場合は自動整形
      if (resolvedPath.endsWith('.json')) {
        try {
          // JSONとしてパース可能か確認
          const jsonData = JSON.parse(content);
          // 整形して書き込み
          await fs.writeFile(resolvedPath, JSON.stringify(jsonData, null, 2), 'utf8');
        } catch {
          // JSONでない場合はそのまま書き込み
          await fs.writeFile(resolvedPath, content, 'utf8');
        }
      } else {
        await fs.writeFile(resolvedPath, content, 'utf8');
      }
      
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

// 15. text_to_speech (ElevenLabs)
export const text_to_speech = tool({
  name: 'text_to_speech',
  description: 'Convert text to speech using ElevenLabs',
  parameters: z.object({
    text: z.string().describe('Text to convert to speech'),
    voice_id: z.string().describe('Voice ID - default: pNInz6obpgDQGcFmaJgB (Adam)'),
    model: z.string().describe('Model ID - default: eleven_turbo_v2_5'),
    stability: z.number().describe('Voice stability (0-1) - default: 0.5'),
    similarity_boost: z.number().describe('Voice similarity (0-1) - default: 0.75'),
    speed: z.number().describe('Speech speed (0.5-2.0) - default: 1.0')
  }),
  execute: async ({ text, voice_id, model, stability, similarity_boost, speed }) => {
    try {
      // デフォルト値の設定（男性の深い声）
      const voiceId = voice_id || 'pNInz6obpgDQGcFmaJgB'; // Adam（デフォルト）
      const modelId = model || 'eleven_turbo_v2_5';
      const voiceStability = stability ?? 0.5;
      const voiceSimilarity = similarity_boost ?? 0.75;
      const voiceSpeed = speed ?? 1.0;
      
      const response = await fetch(`${PROXY_URL}/api/mcp/elevenlabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'text_to_speech',
          params: { 
            text, 
            voice_id: voiceId,
            model: modelId,
            voice_settings: {
              stability: voiceStability,
              similarity_boost: voiceSimilarity,
              speed: voiceSpeed
            }
          }
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.audioBase64) {
        // audioBase64を含めて返す（sessionManagerが処理する）
        return {
          type: 'text',
          text: `音声生成完了（使用音声ID: ${voiceId}）`,
          audioBase64: data.audioBase64
        };
      }
      
      return data.message || 'Audio generation failed';
    } catch (error: any) {
      return `Error generating speech: ${error.message}`;
    }
  }
});

// 16. open_url
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
  read_file,
  write_file,
  text_to_speech,
  open_url,
];