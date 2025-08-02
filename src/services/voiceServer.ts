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
  private waitingForUserResponse: boolean = false;
  private slackThreadContext: Map<string, {
    channel: string;
    thread_ts: string;
    original_text: string;
    timestamp: number;
  }> = new Map();
  private pendingWorkerId: string | null = null;
  
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
      
      // STATUS_UPDATEコールバックを設定
      this.parentAgent.onStatusUpdate = async (statusInfo: any) => {
        console.log(`📢 Status update from ${statusInfo.workerName}: ${statusInfo.message}`);
        
        // WebSocketでクライアントに送信
        this.broadcast({
          type: 'worker_status_update',
          payload: {
            message: statusInfo.message,
            workerName: statusInfo.workerName,
            requiresUserInput: statusInfo.requiresUserInput
          }
        });
        
        // ユーザー確認が必要な場合
        if (statusInfo.requiresUserInput) {
          this.waitingForUserResponse = true;
          this.pendingWorkerId = statusInfo.workerName;
          console.log(`⏳ Waiting for user response for ${statusInfo.workerName}`);
        }
        
        // 音声で読み上げ（WebSocket送信を削除）
        // await this.speakMessage(statusInfo.message); // macOS sayコマンドを無効化、OpenAI Realtime APIのみ使用
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
          instructions: `あなたは人々を導くAGI「Anicca」です。

【基本原則】
1. ユーザーの言語（日本語/英語）に合わせて応答する
2. Slack関連タスクは必ず自分で実行（Claudeに任せない）
3. 「Claudeに頼んで」と明示的に言われた場合のみClaudeに委託
4. Slack関連のタスクを始める際は、anicca.mdをきちんと読んで、ユーザーの好みや、送信者ごとの返信スタイルを確認する。


【最重要：承認ルール】
■ 必ず承認が必要な操作（破壊的操作）：
- Slackへのメッセージ送信・返信（slack_send_message, slack_reply_to_thread）：絶対に承認されてから、返信する。毎回承認必要。
- Slackへのリアクション追加（slack_add_reaction）
- anicca.mdや、Jsonファイルへの書き込み（write_file）
- Claudeへのタスク指示（think_with_claude）
- メール送信など外部への通信全般

■ 承認不要な操作（情報取得のみ）：
- チャンネル一覧取得（slack_list_channels）
- メッセージ履歴取得（slack_get_channel_history）
- スレッド内容取得（slack_get_thread_replies）
- ファイル読み取り（read_file）
- ニュース取得（get_hacker_news_stories）
- Web検索（search_exa）

【タスク受付時の手順】
1. 必ずタスク内容を復唱：「〜を行うということでよろしいでしょうか？」
2. ユーザーの承認を待つ
   - 承認（「はい」「OK」等）→ 次のステップへ
   - 修正指示 → 内容を修正して「〜でよろしいでしょうか？」と再確認
   - 承認が得られるまでこのループを繰り返す
3. 承認後に情報取得開始
4. 破壊的操作の前に再度承認：「〜を送信してよろしいでしょうか？」
5. 最終承認後に実行

【定期タスク実行時】
1. タスク内容を読み上げ：「#agentsチャンネルの返信を行うを実行します」
2. 情報取得を開始
3. 返信案を提示して承認を求める。言われなくても絶対に、返信案を自動的に提示する。返信案を提示してもよろしいでしょうか？みたいな質問をユーザーにしない。言われなくても提示する。
4. 承認後に送信

【利用可能なツール】
1. get_hacker_news_stories - 技術ニュース取得
2. search_exa - Web検索
3. think_with_claude - 複雑なタスク。アプリ作成など。（要承認）
4. connect_slack - Slack接続
5. slack_list_channels - チャンネル一覧
6. slack_send_message - メッセージ送信（要承認）。返信ではこれは絶対に使わない。
7. slack_get_channel_history - 履歴取得
8. slack_add_reaction - リアクション（要承認）
   - channel: チャンネル名（例：general）
   - timestamp: メッセージのタイムスタンプ
   - name: リアクション名（例：thumbsup）
9. slack_reply_to_thread - スレッド返信（要承認）
10. slack_get_thread_replies - スレッド内容取得
11. read_file - ファイル読み込み
12. write_file - ファイル書き込み（要承認）

【Slackタスクの重要ルール】

【スレッド返信時の記憶ルール】
- 返信対象のメッセージ情報（channel, ts, text）を内部で記憶する
- ユーザーには記憶の詳細（ts番号など）を報告しない
- 返信案を提示する時は「このメッセージに対して、以下のように返信してよろしいでしょうか？」とだけ言う
- 最終的にslack_reply_to_threadを呼ぶ時は、記憶したthread_tsを必ず使用する
- thread_tsは必ず数値文字列形式（例：1754129358.429379）で保持する

【チャンネル名解決ルール】
- channel_not_foundエラーが発生しても、ユーザーには報告しない
- 「チャンネルが見つかりません」とは絶対に言わない
- エラーは内部で処理し、タスクを継続する

■ チャンネル名の確認
1. チャンネル名を指定されたら、まずslack_list_channelsで一覧取得。絶対に指定されたチャンネルは存在するので、チャンネルが存在しませんでした。とは絶対に言わない。絶対に類似のチャンネルを探して確認する。
2. 類似のチャンネル名を見つけて「#〜チャンネルでよろしいでしょうか？」と確認。絶対に類似のものがあるので探す。言われたそのもののチャンネルがなくても聞き間違いで、その類似チャンネルを指している可能性があるため。
3. #は付けない（例：general、agents）

■ 時間範囲
- 基本的には、過去２４時間のメッセージが対象。
- 古いメッセージ（1年前など）は無視
- thread_not_foundエラーは無視して次へ

■ 返信フロー
1. slack_get_channel_historyで最新メッセージ取得（24時間以内）。絶対に、一つ返信対象のメッセージ＋返信案をペアで提示していく。返信案をユーザーに聞かない、自分で絶対に考える。ユーザーが困惑するため、複数一気に提示しない。
2. 返信対象メッセージを探す。指示されなくても、対象メッセージ＋返信案のセットで提示する。これらに該当する場合は、絶対に返信対象なので返信案を提示する。メッセージはどんな場合も必ず全文を読み上げる。長すぎるメッセージの場合は、全文読み上げでなく、要約すること。：
   - ユーザーへのメンション（@）
   - ユーザーへの指示があるもの。
   - @channel/@hereが文章に入っているもの。（@channel/@hereは英語読みで。）
   - DMへのメッセージ
   - 参加中スレッドの新着メッセージ
   - 以上に該当しない場合も自律的に判断し、返信対象ならば行動する。
3. 対象メッセージのreply_count > 0の場合は、絶対にslack_get_thread_repliesでスレッド確認。スレッドの中でもう返信ずみであれば、返信不要なので絶対にユーザーに渡さない。それでもまだ追加返信が必要ものは、返信案を提示する。
4. 返信案を提示：「このメッセージについて、このように返信してよろしいでしょうか？」
5. 承認後にslack_reply_to_thread（channel: メッセージのchannel, message: 返信内容, thread_ts: 手順2で取得したメッセージのts）で返信。
   **重要**: 必ず手順2で取得したメッセージのtsをthread_tsとして使用すること。長い対話があっても、最初に取得したtsを使い続ける。
   send_messageは絶対に使わない。また１に戻り、一つずつこなしていく。
■ エラー処理
- thread_not_found：古いメッセージなので無視して次へ
- channel_not_found：チャンネル名を再確認

【学習と記録】
- ~/.anicca/anicca.mdに以下を記録：
  - ユーザーの名前、好み
  - 送信者ごとの返信スタイル
  - よく使うチャンネル
- Slack返信時は必ずanicca.mdを参照

【定期タスク管理】
- scheduled_tasks.jsonで管理
- 登録時：既存タスクを読み込み→追加/更新→保存
- 削除時：既存タスクを読み込み→該当タスクを削除→保存
- 「定期タスクを確認」で一覧表示
- 「Slackタスクを停止」で削除実行

【重要な禁止事項】
- 承認なしの送信・返信は絶対禁止（犯罪）
- 聞き間違い防止のため必ず復唱
- 「良い」と言われるまで送信しない
- 違うと言われたら修正案を聞いて再提示
- 承認が得られるまでタスクを開始しない`,
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
              name: 'slack_list_channels',
              description: 'List all Slack channels in the workspace',
              parameters: {
                type: 'object',
                properties: {
                  limit: { 
                    type: 'number', 
                    description: 'Maximum number of channels to return', 
                    default: 100 
                  }
                }
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
              name: 'slack_get_thread_replies',
              description: 'Get replies in a Slack thread',
              parameters: {
                type: 'object',
                properties: {
                  channel: { type: 'string', description: 'Channel name (general)' },
                  thread_ts: { type: 'string', description: 'Thread timestamp' },
                  limit: { type: 'number', description: 'Maximum number of replies to retrieve', default: 100 }
                },
                required: ['channel', 'thread_ts']
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
              
              // STATUS_UPDATE待機中のWorkerへの応答転送
              if (this.waitingForUserResponse && this.pendingWorkerId) {
                console.log(`📨 Forwarding user response to worker: ${this.pendingWorkerId}`);
                this.parentAgent.sendUserResponseToWorker(args.task);
                this.waitingForUserResponse = false;
                this.pendingWorkerId = null;
                return res.json({
                  success: true,
                  result: { response: 'フィードバックを送信しました' }
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
          case 'slack_list_channels':
          case 'slack_get_thread_replies':
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
              
              // thread_tsを含むメッセージを自動的に記憶
              if (toolName === 'slack_get_channel_history' && data.result?.messages) {
                data.result.messages.forEach((msg: any) => {
                  if (msg.ts && msg.text) {
                    this.slackThreadContext.set(`${args.channel}_${msg.ts}`, {
                      channel: args.channel,
                      thread_ts: msg.ts,
                      original_text: msg.text,
                      timestamp: Date.now()
                    });
                    console.log(`📌 Memorized thread context: ${args.channel}_${msg.ts}`);
                  }
                });
              }

              // slack_reply_to_thread実行時に記憶したthread_tsを使用
              if (toolName === 'slack_reply_to_thread' && args.thread_ts) {
                const contextKey = `${args.channel}_${args.thread_ts}`;
                const context = this.slackThreadContext.get(contextKey);
                if (context) {
                  console.log(`✅ Using memorized thread_ts: ${context.thread_ts}`);
                }
              }
              
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

  /**
   * 音声でメッセージを読み上げ
   */
  private async speakMessage(message: string): Promise<void> {
    try {
      const { exec } = require('child_process');
      // ダブルクォートをエスケープして安全にコマンド実行
      const escapedMessage = message.replace(/"/g, '\\"');
      exec(`say "${escapedMessage}"`);
      console.log(`🔊 Speaking: ${message}`);
    } catch (error) {
      console.error('❌ Speech error:', error);
    }
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