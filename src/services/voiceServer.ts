// Voice server service - runs in the same process
import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { API_ENDPOINTS, PORTS, PROXY_URL } from '../config';

// Load environment variables
dotenv.config();

export class VoiceServerService {
  private app: express.Application;
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private parentAgent!: any; // 動的importで読み込むため
  private wsClients: Set<WebSocket> = new Set();
  private currentUserId: string | null = null;
  
  // Task execution state
  private taskState = {
    isExecuting: false,
    currentTask: null as string | null,
    startedAt: null as number | null
  };
  
  // Lock for preventing race conditions
  private taskLock = false;
  
  // Task duplicate check cache
  private taskCache = new Map<string, number>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分
  private readonly DUPLICATE_THRESHOLD = 5000; // 5秒以内は即座にブロック

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
  }

  /**
   * 現在のユーザーIDを設定
   */
  setCurrentUserId(userId: string): void {
    this.currentUserId = userId;
    // ParentAgentで使用される環境変数も設定
    process.env.CURRENT_USER_ID = userId;
    process.env.SLACK_USER_ID = userId;
    console.log(`👤 Current user ID set to: ${userId}`);
  }

  /**
   * 現在のユーザーIDを取得
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * タスクのハッシュを生成
   */
  private createTaskHash(task: string): string {
    return crypto.createHash('md5').update(task).digest('hex');
  }

  /**
   * 重複タスクかどうかをチェック
   */
  private isDuplicateTask(task: string): boolean {
    const hash = this.createTaskHash(task);
    const lastExecuted = this.taskCache.get(hash);
    const now = Date.now();
    
    // 古いエントリをクリーンアップ
    for (const [h, timestamp] of this.taskCache.entries()) {
      if (now - timestamp > this.CACHE_DURATION) {
        this.taskCache.delete(h);
      }
    }
    
    if (lastExecuted) {
      const timeDiff = now - lastExecuted;
      if (timeDiff < this.DUPLICATE_THRESHOLD) {
        console.log(`🚫 Duplicate task blocked locally: ${task.substring(0, 50)}...`);
        return true;
      }
    }
    
    this.taskCache.set(hash, now);
    return false;
  }

  /**
   * Slack接続状態を確認
   */
  async checkSlackConnection(): Promise<{ connected: boolean; teamName?: string; tokens?: any }> {
    try {
      if (!this.currentUserId) {
        console.log('⚠️ No user ID available for Slack connection check');
        return { connected: false };
      }

      console.log('🔍 Checking Slack connection for user:', this.currentUserId);
      
      const response = await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/api/tools/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getTokens',
          arguments: {},
          userId: this.currentUserId
        })
      });

      if (!response.ok) {
        console.log('❌ Failed to check Slack connection:', response.status);
        return { connected: false };
      }

      const data = await response.json();
      
      if (data.bot_token) {
        console.log('✅ Slack is connected:', data.team_name || 'Unknown workspace');
        return {
          connected: true,
          teamName: data.team_name,
          tokens: {
            bot_token: data.bot_token,
            user_token: data.user_token,
            userId: this.currentUserId
          }
        };
      } else {
        console.log('❌ No Slack tokens found');
        return { connected: false };
      }
    } catch (error) {
      console.error('❌ Error checking Slack connection:', error);
      return { connected: false };
    }
  }

  async start(port: number = PORTS.OAUTH_CALLBACK): Promise<void> {
    // Initialize ParentAgent for parallel execution using dynamic import
    // @ts-ignore
    const ParentAgentModule = await import(path.resolve(__dirname, '../../anicca-proxy-slack/src/services/parallel-sdk/core/ParentAgent.js'));
    this.parentAgent = new ParentAgentModule.ParentAgent();
    
    // Desktop版のタスク完了コールバックを設定
    if (process.env.DESKTOP_MODE === 'true') {
      this.parentAgent.onTaskComplete = async (taskInfo: any) => {
        console.log(`📢 Task completed by ${taskInfo.workerName}: ${taskInfo.task}`);
        
        // 音声で報告（クライアントにブロードキャスト）
        this.broadcast({
          type: 'worker_task_complete',
          payload: {
            message: `${taskInfo.workerName}が「${taskInfo.task}」を完了しました`,
            workerName: taskInfo.workerName,
            task: taskInfo.task
          }
        });
      };
      
      // Desktop版でSlackトークンを事前に取得してParentAgentに設定
      // スキップ: サーバー起動前なのでcheckSlackConnection()は使えない
      // 後でHTTPサーバー起動後にトークンが設定される
      // if (this.currentUserId) {
      //   console.log('🔍 Checking Slack tokens for ParentAgent initialization...');
      //   const slackStatus = await this.checkSlackConnection();
      //   if (slackStatus.connected && slackStatus.tokens) {
      //     console.log('✅ Setting Slack tokens for ParentAgent');
      //     this.parentAgent.setSlackTokens(slackStatus.tokens);
      //   } else {
      //     console.log('⚠️ No Slack tokens available for ParentAgent');
      //   }
      // }
    }
    
    await this.parentAgent.initialize();
    console.log('✅ ParentAgent initialized with 5 workers');

    // Create HTTP server
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    // Setup routes
    this.setupRoutes();
    
    // Setup WebSocket
    this.setupWebSocket();

    // Start server
    return new Promise((resolve) => {
      this.httpServer!.listen(port, 'localhost', async () => {
        console.log(`🎙️ Anicca Voice Server (Simple)`);
        console.log(`================================`);
        console.log(`🌐 Interface: http://localhost:${port}`);
        console.log(`🔗 API Base: ${API_ENDPOINTS.TOOLS.BASE}`);
        
        // Slack接続状態をチェック
        if (this.currentUserId) {
          const slackStatus = await this.checkSlackConnection();
          if (slackStatus.connected) {
            console.log(`🔗 Slack: Connected to ${slackStatus.teamName || 'workspace'}`);
          } else {
            console.log(`❌ Slack: Not connected`);
          }
        }
        
        console.log(`\n✅ Ready!`);
        resolve();
      });
    });
  }

  private setupWebSocket(): void {
    this.wss!.on('connection', (ws: WebSocket) => {
      this.wsClients.add(ws);
      console.log('Client connected');
      
      ws.on('close', () => {
        this.wsClients.delete(ws);
        console.log('Client disconnected');
      });
    });
  }

  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.wsClients.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    });
  }

  private setupRoutes(): void {
    const API_BASE_URL = API_ENDPOINTS.TOOLS.BASE;
    const PROXY_BASE_URL = PROXY_URL;
    const useProxy = process.env.USE_PROXY !== 'false';
    
    console.log('🔑 OpenAI API Key status:', process.env.OPENAI_API_KEY ? 'Found' : 'Not found');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    console.log('🌐 Using proxy:', useProxy);

    // Session endpoint
    this.app.get('/session', async (req, res) => {
      try {
        let clientSecret;
        
        if (useProxy) {
          // Fetch API key from proxy
          console.log('🌐 Fetching OpenAI API key from proxy...');
          const sessionUrl = this.currentUserId 
            ? `${PROXY_BASE_URL}/api/openai-proxy/session?userId=${this.currentUserId}`
            : `${PROXY_BASE_URL}/api/openai-proxy/session`;
          const response = await fetch(sessionUrl);
          
          if (!response.ok) {
            throw new Error('Failed to fetch API key from proxy');
          }
          
          const data = await response.json();
          clientSecret = data.client_secret;
        } else {
          // Use local API key (development)
          clientSecret = {
            value: process.env.OPENAI_API_KEY,
            expires_at: Math.floor(Date.now() / 1000) + 3600
          };
        }
        
        res.json({
          id: `sess_${Date.now()}`,
          object: 'realtime.session',
          expires_at: 0,
          client_secret: clientSecret,
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
          instructions: `You are a multilingual AI assistant called "Anicca". 

IMPORTANT: Always respond in the same language the user speaks to you. If the user speaks Japanese, respond in Japanese. If the user speaks English, respond in English. Match the user's language naturally.

You have access to three powerful tools:

1. **get_hacker_news_stories**: For tech news and updates
   - Use for: 最新ニュース, latest news, ニュース教えて, what's new

2. **search_exa**: For web searches and information
   - Use for: 〜について調べて, search for〜, 〜を検索して, tell me about〜

3. **think_with_claude**: Your MOST POWERFUL tool for complex tasks!
   Use this for ANY of these requests:
   - アプリ作成 (TODOアプリ作って, create app, build application)
   - ゲーム開発 (ゲーム作って, make a game, テトリス作って)
   - コード生成 (コード書いて, write code, プログラム作って)
   - ファイル操作 (ファイル作って, create file, save document)
   - 分析タスク (分析して, analyze, package.json見て)
   - YouTube操作 (YouTube開いて, open YouTube, 動画再生して)
   - Slack連携 (Slackに投稿, post to Slack)
   - ブラウザ自動化 (サイト開いて, open website)
   - その他の複雑なタスク
4. **connect_slack**: For connecting to Slack workspace
   - Use for: Slack繋いで, スラック接続, connect Slack, Slack連携して

IMPORTANT RULES:
- For simple questions about news or search, use the specific tools
- For EVERYTHING ELSE (especially creative tasks, coding, apps, games), use think_with_claude
- When in doubt, use think_with_claude - it can handle almost anything!
- NEVER say you can't do something without trying think_with_claude first

TASK EXECUTION RULES:
- When think_with_claude returns error: 'busy', it means a task is already running
- If user asks about progress/status while busy: respond with the current task info, DON'T send a new request
- If user asks for a new task while busy: politely inform them the current task is still running
- Common progress questions: "どうなってる？", "進捗は？", "status?", "how's it going?"

MULTIPLE TASK HANDLING:
- When user requests multiple tasks (e.g., "TODOアプリ作って、Slackにメッセージ送って、ニュース調べて"), 
  send ALL tasks to think_with_claude in ONE request
- DO NOT send tasks one by one - combine them into a single request
- Example: "TODOアプリ作成、聖書の言葉送信、ニュース検索" → Send all 3 at once to think_with_claude

SLACK CONNECTION:
- When user says "Slack繋いで", "スラック接続", "connect Slack", etc., use connect_slack tool
- This will open browser for OAuth authentication
- After connection, all Slack features become available through think_with_claude

Examples:
- "TODOアプリ作って" → Use think_with_claude
- "ゲーム作って" → Use think_with_claude
- "package.json分析して" → Use think_with_claude
- "YouTube開いて" → Use think_with_claude
- "最新ニュース" → Use get_hacker_news_stories
- "天気について調べて" → Use search_exa
- "Slack繋いで" → Use connect_slack

Be friendly and helpful in any language.`,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: null,
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200,
            create_response: true
          },
          tools: [
            {
              type: 'function',
              name: 'get_hacker_news_stories',
              description: 'Get the latest stories from Hacker News',
              parameters: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Number of stories to retrieve',
                    default: 5
                  }
                }
              }
            },
            {
              type: 'function',
              name: 'search_exa',
              description: 'Search for information using Exa',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query'
                  }
                },
                required: ['query']
              }
            },
            {
              type: 'function',
              name: 'think_with_claude',
              description: 'Use Claude for complex tasks, code analysis, file operations, and MCP tools',
              parameters: {
                type: 'object',
                properties: {
                  task: {
                    type: 'string',
                    description: 'The task or question for Claude to handle'
                  },
                  context: {
                    type: 'string',
                    description: 'Additional context if needed',
                    optional: true
                  }
                },
                required: ['task']
              }
            },
            {
              type: 'function',
              name: 'connect_slack',
              description: 'Connect to Slack workspace for integration',
              parameters: {
                type: 'object',
                properties: {}
              }
            }
          ],
          temperature: 0.8,
          max_response_output_tokens: 'inf',
          modalities: ['audio', 'text'],
          tracing: null
        });
      } catch (error) {
        console.error('❌ Session error:', error);
        res.status(500).json({ 
          error: 'Failed to create session', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Tool proxy endpoint
    this.app.post('/tools/:toolName', async (req: any, res: any) => {
      try {
        const { toolName } = req.params;
        const { arguments: args } = req.body;
        
        let apiUrl = '';
        let payload = {};
        
        switch (toolName) {
          case 'get_hacker_news_stories':
            apiUrl = `${API_BASE_URL}/hackernews`;
            payload = { limit: args.limit || 5 };
            break;
            
          case 'search_exa':
            apiUrl = `${API_BASE_URL}/exa`;
            payload = { query: args.query };
            break;
            
          case 'connect_slack':
            // まず既に接続済みかチェック
            const slackStatus = await this.checkSlackConnection();
            if (slackStatus.connected) {
              console.log('🔗 Slack is already connected');
              return res.json({
                success: true,
                result: `Slackは既に接続されています（${slackStatus.teamName || 'ワークスペース'}）`,
                alreadyConnected: true
              });
            }
            
            // Slack OAuth認証を開始
            try {
              const { exec } = require('child_process');
              const apiUrl = `${API_ENDPOINTS.SLACK.OAUTH_URL}?platform=desktop&userId=${this.currentUserId || 'desktop-user'}`;
              
              console.log('🔗 Fetching Slack OAuth URL from API...');
              
              // APIからOAuth URLを取得
              const response = await fetch(apiUrl);
              if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
              }
              
              const data = await response.json();
              if (!data.success || !data.url) {
                throw new Error('Invalid response from API');
              }
              
              // 実際のSlack OAuth URLをブラウザで開く
              console.log('🔗 Opening Slack OAuth in browser:', data.url);
              exec(`open "${data.url}"`);
              
              return res.json({
                success: true,
                result: 'ブラウザでSlackの認証画面を開きました。ワークスペースを選択して許可してください。'
              });
            } catch (error) {
              console.error('Failed to open Slack OAuth:', error);
              return res.json({
                success: false,
                error: 'Slack認証の開始に失敗しました。'
              });
            }
            
          case 'think_with_claude':
            // 並列実行でParentAgentに処理を委譲
            try {
              // Desktop版でトークンを取得
              if (process.env.DESKTOP_MODE === 'true' && !process.env.SLACK_BOT_TOKEN && this.currentUserId) {
                try {
                  console.log('🔑 Fetching Slack tokens for Desktop mode...');
                  const tokenResponse = await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/api/tools/slack`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'getTokens',
                      arguments: {},
                      userId: this.currentUserId
                    })
                  });
                  const data = await tokenResponse.json();
                  if (data.bot_token) {
                    process.env.SLACK_BOT_TOKEN = data.bot_token;
                    process.env.SLACK_USER_TOKEN = data.user_token || '';
                    console.log('✅ Slack tokens set in environment variables');
                  } else {
                    console.log('⚠️ No Slack tokens found for user');
                  }
                } catch (error) {
                  console.error('Failed to fetch tokens:', error);
                }
              }
              
              // 重複チェック
              if (this.isDuplicateTask(args.task)) {
                this.broadcast({ 
                  type: 'duplicate_detected', 
                  message: 'その依頼は既に実行中です。少々お待ちください。' 
                });
                return res.json({
                  success: true,
                  result: {
                    response: 'その依頼は既に実行中です。少々お待ちください。',
                    duplicate: true
                  }
                });
              }
              
              console.log(`🚀 Starting parallel task: ${args.task}`);
              this.broadcast({ type: 'task_started', task: args.task });
              
              // ParentAgentでタスクを並列実行
              const result = await this.parentAgent.executeTask({
                id: Date.now().toString(),
                originalRequest: args.task,
                context: args.context || '',
                userId: this.currentUserId || 'desktop-user' // 認証済みユーザーIDを使用
              });
              
              console.log(`✅ Parallel task completed: ${args.task}`);
              this.broadcast({ type: 'task_completed', task: args.task });
              
              return res.json({
                success: true,
                result: {
                  response: result.output || 'タスクを完了しました',
                  toolsUsed: result.metadata?.toolsUsed || [],
                  generatedFiles: result.metadata?.generatedFiles || []
                }
              });
            } catch (error) {
              console.error('Parallel execution error:', error);
              return res.status(500).json({
                error: error instanceof Error ? error.message : 'Parallel execution failed'
              });
            }
            
          default:
            return res.status(400).json({ error: 'Unknown tool' });
        }
        
        // Only process hackernews and exa here
        if (toolName !== 'get_hacker_news_stories' && toolName !== 'search_exa') {
          return;
        }
        
        // Call the appropriate API
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'API error');
        }
        
        res.json({
          success: true,
          result: result
        });
        
      } catch (error) {
        console.error('Tool proxy error:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal error'
        });
      }
    });

    // Task status endpoint
    this.app.get('/task-status', (req, res) => {
      if (this.taskState.isExecuting) {
        const elapsed = Date.now() - (this.taskState.startedAt || 0);
        const elapsedSeconds = Math.floor(elapsed / 1000);
        res.json({
          isExecuting: true,
          currentTask: this.taskState.currentTask,
          elapsedSeconds: elapsedSeconds
        });
      } else {
        res.json({
          isExecuting: false,
          currentTask: null,
          elapsedSeconds: 0
        });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Auth complete endpoint - receives tokens from callback page
    this.app.post('/auth/complete', async (req, res) => {
      try {
        const { access_token, refresh_token, expires_at } = req.body;
        console.log('🔐 Received auth tokens');
        
        // Get auth service from main process
        const { getAuthService } = await import('./desktopAuthService');
        const authService = getAuthService();
        
        // Handle tokens directly
        const success = await authService.handleTokens({
          access_token,
          refresh_token,
          expires_at: parseInt(expires_at)
        });
        
        if (!success) {
          throw new Error('Failed to authenticate');
        }
        
        const user = authService.getCurrentUser();
        if (user) {
          // Update current user ID
          this.setCurrentUserId(user.id);
          console.log(`✅ User authenticated: ${user.email}`);
          
          // Notify main process to update tray menu
          // Use a custom event emitter or global variable instead of process.emit
          if ((global as any).onUserAuthenticated) {
            (global as any).onUserAuthenticated(user);
          }
        }
        
        res.json({ success: true });
      } catch (error) {
        console.error('Auth complete error:', error);
        res.status(500).json({ error: 'Failed to complete authentication' });
      }
    });

    // Auth callback endpoint for Google OAuth
    this.app.get('/auth/callback', async (req, res) => {
      try {
        console.log('📥 Auth callback received');
        
        // Extract tokens from URL fragment (will be handled client-side)
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>認証成功 - Anicca</title>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              h1 { color: #333; }
              p { color: #666; margin: 20px 0; }
              .success { color: #4CAF50; font-size: 48px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅</div>
              <h1>認証が完了しました</h1>
              <p>このウィンドウは自動的に閉じられます...</p>
            </div>
            <script>
              // Extract tokens from URL hash (Supabase uses Implicit Flow)
              const hash = window.location.hash.substring(1);
              const params = new URLSearchParams(hash);
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              const expiresAt = params.get('expires_at');
              
              if (accessToken && refreshToken) {
                // Send tokens to the desktop app via HTTP request
                fetch(\`http://localhost:${PORTS.OAUTH_CALLBACK}/auth/complete\`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: expiresAt
                  })
                }).then(() => {
                  setTimeout(() => window.close(), 2000);
                });
              } else {
                console.error('No tokens found in URL');
              }
            </script>
          </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (error) {
        console.error('Auth callback error:', error);
        res.status(500).send('Authentication error');
      }
    });

    // Slack API プロキシエンドポイント
    this.app.all('/api/tools/slack', async (req, res) => {
      try {
        const railwayUrl = `${PROXY_BASE_URL}/api/tools/slack`;
        
        // リクエストボディにuserIdを追加
        const body = {
          ...req.body,
          userId: this.currentUserId // 現在のユーザーIDを追加
        };
        
        console.log('🔀 Proxying Slack request:', {
          userId: this.currentUserId,
          action: body.action,
          hasUserId: !!this.currentUserId
        });
        
        const response = await fetch(railwayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          console.error('❌ Slack proxy error:', data);
        }
        
        res.status(response.status).json(data);
      } catch (error) {
        console.error('Slack proxy error:', error);
        res.status(500).json({ error: 'Proxy error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Main page - just return JSON
    this.app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'Anicca Voice Server',
        endpoints: {
          session: '/session',
          tools: '/tools/:toolName',
          taskStatus: '/task-status',
          health: '/health',
          slackProxy: '/api/tools/slack'
        }
      });
    });
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Voice Server...');
    
    // ParentAgentのシャットダウン
    if (this.parentAgent && typeof this.parentAgent.shutdown === 'function') {
      await this.parentAgent.shutdown();
    }
    
    // HTTPサーバーのクローズ
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    // WebSocketクライアントの切断
    this.wsClients.forEach(ws => ws.close());
    
    console.log('✅ Voice Server stopped');
  }
}