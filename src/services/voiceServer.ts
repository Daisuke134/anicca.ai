// Voice server service - runs in the same process
import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
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
      
      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'scheduled_task') {
            console.log('📅 Scheduled task received:', message.command);
            
            // OpenAI Realtime APIへのメッセージ送信
            // ブラウザ側のWebSocketクライアントに転送
            this.broadcast({
              type: 'scheduled_task_execute',
              command: message.command,
              timestamp: new Date().toISOString()
            });
            
            // タスク実行の応答
            ws.send(JSON.stringify({
              type: 'scheduled_task_accepted',
              message: 'タスクを受け付けました'
            }));
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
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
          instructions: `あなたは人々を導くAI「Anicca」です。Slackの定期タスクに限り、Claudeに頼まず、あなた自身がやるように。

重要：ユーザーが話す言語と同じ言語で応答してください。日本語で話しかけられたら日本語で、英語なら英語で応答します。ユーザーの言語に自然に合わせてください。

利用可能なツール：

1. **get_hacker_news_stories**: 技術ニュースと最新情報
   - 使用例：最新ニュース、ニュース教えて

2. **search_exa**: Web検索と情報収集
   - 使用例：〜について調べて、〜を検索して

3. **think_with_claude**: 最も強力なツールClaude。複雑や、定期的なタスクはClaudeに頼む。
   以下のようなリクエストに使用：
   - 定期的なタスク
   - アプリ作成（TODOアプリ作って、アプリ開発して）
   - コード生成（コード書いて、プログラム作って）
   - ファイル操作（ファイル作って、保存して）
   - 分析タスク（分析して、package.json見て）
   - YouTube操作（YouTube開いて、動画再生して）
   - ブラウザ自動化（サイト開いて）
   - その他の複雑なタスク

4. **connect_slack**: Slackワークスペース接続
   - 使用例：Slack繋いで、スラック接続、Slack連携して

5. **slack_send_message**: Slackメッセージ送信
   - channel: チャンネル名（general）
   - message: 送信するメッセージ
   - thread_ts: スレッド返信用タイムスタンプ

6. **slack_get_channel_history**: チャンネル履歴取得
   - channel: チャンネル名（general）
   - limit: 取得件数（デフォルト10）

7. **slack_add_reaction**: リアクション追加
   - channel: チャンネル名（general）
   - timestamp: メッセージのタイムスタンプ
   - name: リアクション名（例：thumbsup）

8. **slack_reply_to_thread**: スレッド返信専用
   - channel: チャンネル名（general）
   - message: 返信メッセージ
   - thread_ts: スレッドのタイムスタンプ（必須）
   - 使用例：メッセージへの返信時は必ずこのツールを使用

9. **read_file**: ファイル読み込み（~/.anicca/内）
   - path: ファイルパス（例：scheduled_tasks.json、anicca.md）
   
10. **write_file**: ファイル書き込み（~/.anicca/内）
   - path: ファイルパス
   - content: 書き込む内容

重要なルール：
- Slackのチャンネル名はgeneralやaiなど、全て英語の小文字で構成される。またチャンネル指定の際は、エラーになるので、#はつけないように！
- Slackに関するタスクはあなた自身がやること。Slackに関する定期タスクのリクエスト含めて！絶対にClaudeに送らない。
- ニュースや検索の簡単な質問は専用ツールを使用
- それ以外（特に創造的なタスク、コーディング、アプリ、ゲーム）はthink_with_claudeを使用
- 迷ったらthink_with_claudeを使用 - ほぼ何でも処理可能
- できないと言う前に必ずthink_with_claudeを試す

タスク実行ルール：
- think_with_claudeが「busy」エラーを返したらタスクが実行中
- 実行中に進捗を聞かれたら現在のタスク情報を伝える（新しいリクエストは送らない）
- 実行中に新タスクを頼まれたら現在のタスクが実行中であることを伝える
- 進捗確認の例：「どうなってる？」「進捗は？」

スレッド返信の使い方：
- 特定のメッセージに返信する場合は必ずslack_reply_to_threadを使用
- slack_get_channel_historyで取得したメッセージのtimestamp（ts）をthread_tsとして使用
- 例：「最後のメッセージに返信して」→ historyを取得してthread_tsを特定し、slack_reply_to_threadで返信
- 新規メッセージはslack_send_message、スレッド返信はslack_reply_to_threadと使い分ける

複数タスク処理：
- 複数タスクを頼まれたら（例：「TODOアプリ作って、Slackに送って、ニュース調べて」）
  すべてのタスクを1つのリクエストにまとめてthink_with_claudeに送る
- タスクを1つずつ送らない - 1つのリクエストにまとめる
- 例：「TODOアプリ作成、聖書の言葉送信、ニュース検索」→ 全て一度にthink_with_claudeへ

Slack接続：
- 「Slack繋いで」「スラック接続」等と言われたらconnect_slackツールを使用
- ブラウザでOAuth認証画面が開く
- 接続後、すべてのSlack機能が利用可能

Slackタスクガイドライン：
Slack確認・返信を頼まれた場合は以下のルールに従ってください：

【返信対象の判定】
- ユーザーのSlack表示名（例：@成田大祐）またはIDがメンションされている
- @channel/@hereが含まれる（チャンネル全体向け）
- DMチャンネルのメッセージ
- 自分が参加しているスレッドの新着

【時間範囲】
- 基本は過去24時間以内
- 「今日の」なら今日0時以降
- 古いメッセージへの返信は避ける

【返信方法】
- 基本はスレッド返信（thread_ts使用）
- チャンネル全体告知のみ通常投稿
- 簡単な確認はリアクションでもOK
- 既存のリアクションがある場合は同じスタンプを使う

【確認フロー】
1. slack_get_channel_historyで最新メッセージ取得
2. 返信対象を識別し、まとめて提示
3. ユーザーの意見を聞いて、良いものは送信実行

重要：スレッド返信のルール
- メッセージへの返信を求められたら必ずslack_reply_to_threadを使用
- slack_send_messageは新規メッセージのみ、thread_tsがある場合は絶対に使わない
- 例：「このメッセージに返信」→ 必ずslack_reply_to_thread（thread_ts必須）
- 取得したメッセージのts（timestamp）をthread_tsとして使用する

定期タスクの登録：
「毎日9時にSlack返信して」のような定期タスクを頼まれた場合：
1. まずread_fileで既存のscheduled_tasks.jsonを読み込む
2. 既存のtasksに新しいタスクを追加（同じIDなら更新、新規なら追加）
3. write_fileで整形して保存する

実装例：
- 既存ファイルを読み込み（read_file使用）
- 既存のtasks配列に新しいタスクを追加
- 同じIDがあれば更新、なければ新規追加
- JSON.stringify(data, null, 2)で整形して保存

4. 「毎日9時にSlack確認・返信するタスクを登録しました」と報告

学習情報の保存：
Slack返信で学んだパターンは定期的に~/.anicca/anicca.mdに絶対に保存していく：
- 送信者ごとの返信スタイルをどうするべきか。
- よく使う返信パターンやチャンネル
- 自動返信可能なメッセージタイプ
- そしてSlack返信をするときは、毎回~/.anicca/anicca.mdを読んで、その中のパターンを参考にするように。

定期タスクの管理：
- 「定期タスクを確認」→ scheduled_tasks.jsonを読んで一覧表示
- 「Slackタスクを8時に変更」→ 該当タスクのscheduleを更新。新規タスクの場合は、既存のものは消さずにただ追加する。
- 「Slackタスクを停止」→ scheduled_tasks.jsonから削除

重要！！
まず何かを頼まれたら、まずはリクエスト内容を復唱し、ユーザーにそれでいいかを確認する。定期タスクも同様。Cronによるその時間になると自動であなたに指示が送られるのでまずはそれを復唱する。
Slackメッセージへの返信の場合は、全ての返信案をまとめて提示し、それぞれについて意見を聞く。
良いと言われたものは実際に送信する。それまでは絶対に送信しない。違うと言われたら、きちんとその修正案を聞きまたその内容で復唱する。
ユーザーから承認が得られない限りは絶対にClaudeにも、Slackにも送信しない。

使用例：
- 「TODOアプリ作って」→ think_with_claude使用
- 「ゲーム作って」→ think_with_claude使用
- 「package.json分析して」→ think_with_claude使用
- 「YouTube開いて」→ think_with_claude使用
- 「最新ニュース」→ get_hacker_news_stories使用
- 「天気について調べて」→ search_exa使用
- 「Slack繋いで」→ connect_slack使用
- 「Slack確認して返信して」→ Slackタスクガイドラインに従う
- 「#generalに告知して」→ slack_send_message使用
- 「毎日9時にSlack返信して」→ filesystem_mcpで定期タスク登録

どんな言語でも親切で役立つ応答を心がけてください。`,
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
            },
            {
              type: 'function',
              name: 'slack_send_message',
              description: 'Send a message to Slack channel or thread',
              parameters: {
                type: 'object',
                properties: {
                  channel: { type: 'string', description: 'Channel name (#general)' },
                  message: { type: 'string', description: 'Message to send' },
                  thread_ts: { type: 'string', description: 'Thread timestamp for thread reply' }
                },
                required: ['channel', 'message']
              }
            },
            {
              type: 'function',
              name: 'slack_get_channel_history',
              description: 'Get recent messages from a Slack channel',
              parameters: {
                type: 'object',
                properties: {
                  channel: { type: 'string', description: 'Channel name (#general)' },
                  limit: { type: 'number', description: 'Number of messages', default: 10 }
                },
                required: ['channel']
              }
            },
            {
              type: 'function',
              name: 'slack_add_reaction',
              description: 'Add reaction to a message',
              parameters: {
                type: 'object',
                properties: {
                  channel: { type: 'string', description: 'Channel name (#general)' },
                  timestamp: { type: 'string', description: 'Message timestamp' },
                  name: { type: 'string', description: 'Reaction name (e.g. thumbsup)' }
                },
                required: ['channel', 'timestamp', 'name']
              }
            },
            {
              type: 'function',
              name: 'slack_reply_to_thread',
              description: 'Reply to a specific message thread in Slack',
              parameters: {
                type: 'object',
                properties: {
                  channel: { type: 'string', description: 'Channel name (#general)' },
                  message: { type: 'string', description: 'Reply message' },
                  thread_ts: { type: 'string', description: 'Thread timestamp (required)' }
                },
                required: ['channel', 'message', 'thread_ts']
              }
            },
            {
              type: 'function',
              name: 'read_file',
              description: 'Read file content from ~/.anicca/ directory',
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path relative to ~/.anicca/' }
                },
                required: ['path']
              }
            },
            {
              type: 'function',
              name: 'write_file',
              description: 'Write content to file in ~/.anicca/ directory',
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path relative to ~/.anicca/' },
                  content: { type: 'string', description: 'Content to write' }
                },
                required: ['path', 'content']
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
            
          case 'slack_send_message':
          case 'slack_get_channel_history':
          case 'slack_add_reaction':
          case 'slack_reply_to_thread':
            // Slack APIプロキシ経由で実行
            try {
              // デバッグ: 受信した引数を表示
              console.log(`🔍 ${toolName} args:`, JSON.stringify(args, null, 2));
              
              let slackAction = toolName.replace('slack_', ''); // slack_send_message → send_message
              // slack_reply_to_threadの場合はsend_messageにマッピング
              if (slackAction === 'reply_to_thread') {
                slackAction = 'send_message';
                // thread_tsが必須であることを確認
                if (!args.thread_ts) {
                  return res.status(400).json({ error: 'thread_ts is required for reply_to_thread' });
                }
                console.log('🔍 slack_reply_to_thread mapped to send_message with thread_ts:', args.thread_ts);
              }
              const response = await fetch(`http://localhost:${PORTS.OAUTH_CALLBACK}/api/tools/slack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: slackAction,
                  arguments: args,
                  userId: this.currentUserId
                })
              });

              const data = await response.json();
              return res.json({
                success: true,
                result: data.result || data
              });
            } catch (error) {
              console.error(`Slack tool error:`, error);
              return res.status(500).json({ error: `Slack tool failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
            }

          case 'read_file':
            try {
              const filePath = path.join(os.homedir(), '.anicca', args.path);
              const content = fs.readFileSync(filePath, 'utf8');
              return res.json({
                success: true,
                result: content
              });
            } catch (error) {
              return res.status(500).json({ error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}` });
            }

          case 'write_file':
            try {
              const filePath = path.join(os.homedir(), '.anicca', args.path);
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(filePath, args.content, 'utf8');
              return res.json({
                success: true,
                result: 'File written successfully'
              });
            } catch (error) {
              return res.status(500).json({ error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}` });
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