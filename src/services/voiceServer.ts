// Voice server service - runs in the same process
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { ClaudeExecutorService } from './claudeExecutorService';
import { SQLiteDatabase } from './sqliteDatabase';

// Load environment variables
dotenv.config();

export class VoiceServerService {
  private app: express.Application;
  private httpServer: any;
  private wss: any;
  private database!: SQLiteDatabase;
  private claudeService!: ClaudeExecutorService;
  private wsClients: Set<any> = new Set();
  
  // Task execution state
  private taskState = {
    isExecuting: false,
    currentTask: null as string | null,
    startedAt: null as number | null
  };

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
  }

  async start(port: number = 8085): Promise<void> {
    // Initialize database and Claude service
    this.database = new SQLiteDatabase();
    await this.database.init();
    this.claudeService = new ClaudeExecutorService(this.database);
    console.log('✅ Claude Executor Service initialized');

    // Create HTTP server
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    // Setup routes
    this.setupRoutes();
    
    // Setup WebSocket
    this.setupWebSocket();

    // Start server
    return new Promise((resolve) => {
      this.httpServer.listen(port, 'localhost', () => {
        console.log(`🎙️ Anicca Voice Server (Simple)`);
        console.log(`================================`);
        console.log(`🌐 Interface: http://localhost:${port}`);
        console.log(`🔗 API Base: https://anicca-proxy-ten.vercel.app/api/tools`);
        console.log(`\n✅ Ready!`);
        resolve();
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: any) => {
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
    const API_BASE_URL = 'https://anicca-proxy-ten.vercel.app/api/tools';
    const PROXY_BASE_URL = 'https://anicca-proxy-ten.vercel.app';
    const useProxy = !process.env.OPENAI_API_KEY || process.env.NODE_ENV === 'production';
    
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
          const response = await fetch(`${PROXY_BASE_URL}/api/openai-proxy/session`);
          
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

Examples:
- "TODOアプリ作って" → Use think_with_claude
- "ゲーム作って" → Use think_with_claude
- "package.json分析して" → Use think_with_claude
- "YouTube開いて" → Use think_with_claude
- "最新ニュース" → Use get_hacker_news_stories
- "天気について調べて" → Use search_exa

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
            
          case 'think_with_claude':
            // Claude実行
            try {
              // 実行状態をチェック
              if (this.taskState.isExecuting) {
                const elapsed = Date.now() - (this.taskState.startedAt || 0);
                const elapsedSeconds = Math.floor(elapsed / 1000);
                return res.json({
                  success: false,
                  error: 'busy',
                  message: `現在「${this.taskState.currentTask}」を実行中です（${elapsedSeconds}秒経過）`,
                  currentTask: this.taskState.currentTask,
                  elapsedTime: elapsedSeconds
                });
              }
              
              // タスク実行開始
              this.taskState.isExecuting = true;
              this.taskState.currentTask = args.task;
              this.taskState.startedAt = Date.now();
              
              console.log(`🚀 Starting task: ${args.task}`);
              this.broadcast({ type: 'task_started', task: args.task });
              
              const result = await this.claudeService.executeAction({
                type: 'general',
                reasoning: args.task,
                parameters: {
                  query: args.task  // ClaudeExecutorServiceが期待するフォーマット
                },
                context: args.context || ''
              });
              
              // タスク完了
              this.taskState.isExecuting = false;
              this.taskState.currentTask = null;
              this.taskState.startedAt = null;
              
              console.log(`✅ Task completed: ${args.task}`);
              this.broadcast({ type: 'task_completed', task: args.task });
              
              return res.json({
                success: true,
                result: {
                  response: result.result || 'タスクを完了しました',
                  toolsUsed: result.toolsUsed || [],
                  generatedFiles: result.generatedFiles || []
                }
              });
            } catch (error) {
              // エラー時も状態をリセット
              this.taskState.isExecuting = false;
              this.taskState.currentTask = null;
              this.taskState.startedAt = null;
              
              console.error('Claude execution error:', error);
              return res.status(500).json({
                error: error instanceof Error ? error.message : 'Claude execution failed'
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

    // Main page - just return JSON
    this.app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        service: 'Anicca Voice Server',
        endpoints: {
          session: '/session',
          tools: '/tools/:toolName',
          taskStatus: '/task-status',
          health: '/health'
        }
      });
    });
  }

  stop(): void {
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}