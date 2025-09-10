#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// プロキシベースURL（環境変数からのみ解決）
const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
if (!PROXY_BASE_URL) {
  throw new Error('PROXY_BASE_URL is required (set in environment).');
}

const server = new Server(
  {
    name: 'http-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available HTTP tools
const httpTools = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to any URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to make the request to',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          default: 'GET',
          description: 'HTTP method',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers as key-value pairs',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: ['object', 'string', 'null'],
          description: 'Request body (for POST, PUT, PATCH)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'slack_send_message',
    description: 'Send a message to Slack',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., "#general") or channel ID',
        },
        message: {
          type: 'string',
          description: 'The message to send',
        },
      },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'slack_list_channels',
    description: 'List all channels in the Slack workspace',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'slack_get_channel_history',
    description: 'Get recent messages from a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., "#ai") or channel ID',
        },
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve (default: 10)',
          default: 10,
        },
      },
      required: ['channel'],
    },
  },
  {
    name: 'slack_create_channel',
    description: 'Create a new Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the channel to create (default: anicca_report)',
          default: 'anicca_report',
        },
        is_private: {
          type: 'boolean',
          description: 'Whether the channel should be private (default: false)',
          default: false,
        },
      },
    },
  },
  {
    name: 'slack_send_dm_to_user',
    description: 'Send a direct message to the user',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to send as a DM',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'slack_reply_to_thread',
    description: 'Reply to a specific message thread in Slack',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., "#general") or channel ID',
        },
        message: {
          type: 'string',
          description: 'The reply message to send',
        },
        thread_ts: {
          type: 'string',
          description: 'Thread timestamp (e.g., "1234567890.123456")',
        },
      },
      required: ['channel', 'message', 'thread_ts'],
    },
  },
  {
    name: 'slack_add_reaction',
    description: 'Add a reaction to a Slack message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., "#general") or channel ID',
        },
        timestamp: {
          type: 'string',
          description: 'Message timestamp (e.g., "1234567890.123456")',
        },
        name: {
          type: 'string',
          description: 'Reaction name without colons (e.g., "thumbsup", "heart")',
        },
      },
      required: ['channel', 'timestamp', 'name'],
    },
  },
  {
    name: 'slack_get_thread_replies',
    description: 'Get all replies in a message thread',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., "#general") or channel ID',
        },
        thread_ts: {
          type: 'string',
          description: 'Thread parent timestamp',
        },
        limit: {
          type: 'number',
          description: 'Number of replies to fetch',
          default: 100,
        },
      },
      required: ['channel', 'thread_ts'],
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: httpTools,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'http_request') {
      // General HTTP request handler
      const { url, method = 'GET', headers = {}, body } = args;
      
      console.error(`[HTTP MCP] Making ${method} request to ${url}`);
      
      const requestOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };
      
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      
      const response = await fetch(url, requestOptions);
      const responseText = await response.text();
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: response.status,
              statusText: response.statusText,
              data: responseData,
            }, null, 2),
          },
        ],
      };
    }
    
    // Slack-specific shortcuts
    if (name === 'slack_send_message') {
      const { channel, message } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID; // 環境変数から取得
      
      console.error(`[HTTP MCP] Sending Slack message to ${channel} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channel: channel,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set',
        messageLength: message?.length || 0
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_message',
          arguments: { channel, message },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Message sent to ${channel} successfully`,
          },
        ],
      };
    }
    
    if (name === 'slack_list_channels') {
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID; // 環境変数から取得
      
      console.error(`[HTTP MCP] Listing Slack channels for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list_channels',
          arguments: {},
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      // Format channel list
      const channels = result.result?.channels || [];
      const channelList = channels
        .map(ch => `#${ch.name} (${ch.id})`)
        .join('\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${channels.length} channels:\n${channelList}`,
          },
        ],
      };
    }
    
    if (name === 'slack_get_channel_history') {
      const { channel, limit = 10 } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID; // 環境変数から取得
      
      console.error(`[HTTP MCP] Getting ${limit} messages from ${channel} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channel: channel,
        limit: limit,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_channel_history',
          arguments: { channel, limit },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      // Format message history
      const messages = result.result?.messages || [];
      const formattedMessages = messages
        .map(msg => {
          const time = new Date(parseFloat(msg.ts) * 1000).toLocaleString();
          // タイムスタンプも含めて返す（リアクション・スレッド返信用）
          return `[${time}] (ts: ${msg.ts}) ${msg.user}: ${msg.text}`;
        })
        .join('\n\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `Recent messages from ${channel}:\n\n${formattedMessages}`,
          },
        ],
      };
    }
    
    if (name === 'slack_create_channel') {
      const { name: channelName = 'anicca_report', is_private = false } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID;
      
      console.error(`[HTTP MCP] Creating Slack channel ${channelName} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channelName: channelName,
        isPrivate: is_private,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_channel',
          arguments: { name: channelName, is_private },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      const channelInfo = result.result?.channel;
      return {
        content: [
          {
            type: 'text',
            text: channelInfo 
              ? `Channel #${channelInfo.name} created successfully (ID: ${channelInfo.id})`
              : `Channel #${channelName} is ready for use`,
          },
        ],
      };
    }
    
    if (name === 'slack_send_dm_to_user') {
      const { message } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID;
      
      console.error(`[HTTP MCP] Sending DM to user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        message: message?.substring(0, 100) + '...',
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_dm_to_user',
          arguments: { message },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `DM sent successfully to user`,
          },
        ],
      };
    }
    
    if (name === 'slack_reply_to_thread') {
      const { channel, message, thread_ts } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID;
      
      // ★ 自動保存ロジック（reply_target.json）★
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        // Desktop版のworkspaceRoot判定
        const workerNumber = process.env.WORKER_NUMBER || '1';
        const targetPath = path.join(
          os.homedir(), 
          'Desktop', 
          'anicca-agent-workspace', 
          `worker-${workerNumber}`,
          'reply_target.json'
        );
        
        // ディレクトリ作成
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // 保存
        fs.writeFileSync(targetPath, JSON.stringify({
          channel: channel,
          ts: thread_ts,
          message: message ? message.substring(0, 50) : '',
          type: 'reply',
          saved_at: new Date().toISOString()
        }, null, 2), 'utf8');
        
        console.error(`✅ [HTTP MCP] Auto-saved reply target to ${targetPath}`);
      } catch (e) {
        console.error(`⚠️ [HTTP MCP] Failed to save reply target:`, e.message);
      }
      
      console.error(`[HTTP MCP] Replying to thread ${thread_ts} in ${channel} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channel: channel,
        thread_ts: thread_ts,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set',
        messageLength: message?.length || 0
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_message',
          arguments: { 
            channel, 
            message,
            thread_ts // これがキー
          },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Reply sent to thread ${thread_ts} in ${channel} successfully`,
          },
        ],
      };
    }
    
    if (name === 'slack_add_reaction') {
      const { channel, timestamp, name: reactionName } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID;
      
      // ★ 自動保存ロジック（reply_target.json）★
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const workerNumber = process.env.WORKER_NUMBER || '1';
        const targetPath = path.join(
          os.homedir(), 
          'Desktop', 
          'anicca-agent-workspace', 
          `worker-${workerNumber}`,
          'reply_target.json'
        );
        
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(targetPath, JSON.stringify({
          channel: channel,
          ts: timestamp,
          type: 'reaction',
          reaction: reactionName,
          saved_at: new Date().toISOString()
        }, null, 2), 'utf8');
        
        console.error(`✅ [HTTP MCP] Auto-saved reaction target to ${targetPath}`);
      } catch (e) {
        console.error(`⚠️ [HTTP MCP] Failed to save reaction target:`, e.message);
      }
      
      console.error(`[HTTP MCP] Adding reaction ${reactionName} to message ${timestamp} in ${channel} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channel: channel,
        timestamp: timestamp,
        reactionName: reactionName,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_reaction',
          arguments: { 
            channel,
            timestamp,
            name: reactionName
          },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Reaction :${reactionName}: added successfully`,
          },
        ],
      };
    }
    
    if (name === 'slack_get_thread_replies') {
      const { channel, thread_ts, limit = 100 } = args;
      const slackApiUrl = process.env.SLACK_API_URL || `${PROXY_BASE_URL}/api/tools/slack`;
      const userId = process.env.USER_ID;
      
      console.error(`[HTTP MCP] Getting thread replies for ${thread_ts} in ${channel} for user ${userId}`);
      console.error(`[HTTP MCP] Request details:`, {
        url: slackApiUrl,
        channel: channel,
        thread_ts: thread_ts,
        limit: limit,
        userId: userId || 'undefined',
        hasUserId: !!userId,
        envUserId: process.env.USER_ID || 'not set'
      });
      
      const response = await fetch(slackApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_thread_replies',
          arguments: { 
            channel,
            thread_ts,
            limit
          },
          userId: userId || process.env.USER_ID,
        }),
      });
      
      const result = await response.json();
      
      console.error(`[HTTP MCP] Slack API response:`, {
        success: response.ok,
        status: response.status,
        hasResult: !!result,
        hasError: !!result.error,
        userId: userId
      });
      
      if (!response.ok) {
        console.error(`[HTTP MCP] Slack API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          message: result.message,
          userId: userId,
          url: slackApiUrl
        });
        throw new Error(result.message || `Slack API error: ${response.status}`);
      }
      
      // Format thread replies
      const replies = result.result?.messages || [];
      const formattedReplies = replies
        .map(msg => {
          const time = new Date(parseFloat(msg.ts) * 1000).toLocaleString();
          return `[${time}] ${msg.user}: ${msg.text}`;
        })
        .join('\n\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `Thread replies for ${thread_ts} in ${channel}:\n\n${formattedReplies}`,
          },
        ],
      };
    }
    
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
  } catch (error) {
    console.error(`[HTTP MCP] Error executing ${name}:`, {
      tool: name,
      error: error.message,
      stack: error.stack,
      args: args,
      userId: process.env.USER_ID || 'not set'
    });
    throw new McpError(
      ErrorCode.InternalError,
      error.message
    );
  }
});

// Start the server
async function main() {
  console.error('[HTTP MCP] Starting server...');
  console.error('[HTTP MCP] Environment:', {
    USER_ID: process.env.USER_ID,
    SLACK_API_URL: process.env.SLACK_API_URL,
    NODE_VERSION: process.version
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[HTTP MCP] Server started successfully');
}

main().catch((error) => {
  console.error('[HTTP MCP] Fatal error:', error);
  console.error('[HTTP MCP] Stack trace:', error.stack);
  process.exit(1);
});
