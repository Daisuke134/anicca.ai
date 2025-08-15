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
  private worker1: any = null;  // Worker1インスタンス
  private worker1Process: any = null;  // Worker1プロセス（音声対話用）
  private wsClients: Set<WebSocket> = new Set();
  private currentUserId: string | null = null;
  private waitingForUserResponse: boolean = false;
  private pendingWorkerId: string | null = null;
  
  // Task execution state
  private taskState = {
    isExecuting: false,
    currentTask: null as string | null,
    startedAt: null as number | null
  };
  
  // Lock for preventing race conditions
  private taskLock = false;
  
  // Worker1処理中フラグ
  private worker1Processing = false;
  
  // Slackトークン保存用
  private slackTokens: any = null;
  
  // Task duplicate check cache
  private taskCache = new Map<string, number>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分
  private readonly DUPLICATE_THRESHOLD = 5000; // 5秒以内は即座にブロック

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    
    // デバッグ用：全てのリクエストをログ
    this.app.use((req, res, next) => {
      console.log(`📡 ${req.method} ${req.path}`, req.query);
      if (req.method === 'POST') {
        console.log('📡 Body:', JSON.stringify(req.body));
      }
      next();
    });
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
    // WORKER_MODEでない場合のみParentAgentを初期化
    if (process.env.WORKER_MODE !== 'true') {
      // Initialize ParentAgent for parallel execution using dynamic import
      // @ts-ignore
      const ParentAgentModule = await import(path.resolve(__dirname, '../../anicca-proxy-slack/src/services/parallel-sdk/core/ParentAgent.js'));
      this.parentAgent = new ParentAgentModule.ParentAgent();

    
    // Desktop版のタスク完了コールバックを設定
    if (process.env.DESKTOP_MODE === 'true') {
      this.parentAgent.onTaskComplete = async (taskInfo: any) => {
        console.log(`📢 Task completed by ${taskInfo.workerName}: ${taskInfo.task}`);
        
        // 音声で報告（クライアントにブロードキャスト）
        // コメントアウト: OpenAI Realtime APIエラー防止のため無効化
        // 音声報告はthink_with_claudeの結果として既に提供される
        // this.broadcast({
        //   type: 'worker_task_complete',
        //   payload: {
        //     message: `${taskInfo.workerName}が「${taskInfo.task}」を完了しました`,
        //     workerName: taskInfo.workerName,
        //     task: taskInfo.task
        //   }
        // });
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
    } else {
      console.log('🎤 Worker mode: Skipping ParentAgent initialization');
    }
    
    // Workerモード時のみWorker1を独立プロセスとして起動
    if (process.env.WORKER_MODE === 'true') {
      console.log('🎤 Worker音声対話モード: Worker1を独立プロセスとして起動');
      
      // Worker.jsを直接forkして起動
      const { fork } = require('child_process');
      const workerPath = path.resolve(__dirname, '../../anicca-proxy-slack/src/services/parallel-sdk/core/Worker.js');
      
      this.worker1Process = fork(workerPath, [], {
        env: {
          ...process.env,
          AGENT_ID: 'worker-1',
          AGENT_NAME: 'Worker1',
          WORKER_NUMBER: '1',
          DESKTOP_MODE: 'true',  // デスクトップモードを明示
          SLACK_USER_ID: this.currentUserId || 'desktop-user'
        }
      });
      
      // Worker1からのメッセージを受信
      this.worker1Process.on('message', (message: any) => {
        console.log('📨 Message from Worker1:', message.type);
        
        if (message.type === 'READY') {
          console.log('✅ Worker1 is ready');
          // Worker1のREADY時にSlackトークンがあれば即座に送信
          if (this.slackTokens) {
            this.worker1Process.send({
              type: 'SET_SLACK_TOKENS',
              timestamp: Date.now(),
              messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              payload: {
                tokens: this.slackTokens
              }
            });
            console.log('📨 Sent Slack tokens to Worker1 (on READY)');
          }
        }
      });
      
      console.log('✅ Worker1を独立プロセスとして起動しました');
    }

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
            
            // Slackトークンを保存
            if (slackStatus.tokens) {
              this.slackTokens = slackStatus.tokens;
              
              // WORKER_MODEでSlackトークンが取得できた場合、Worker1に送信
              if (process.env.WORKER_MODE === 'true' && this.worker1Process) {
                this.worker1Process.send({
                  type: 'SET_SLACK_TOKENS',
                  timestamp: Date.now(),
                  messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  payload: {
                    tokens: slackStatus.tokens
                  }
                });
                console.log('📨 Sent Slack tokens to Worker1');
              }
            }
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
    // All API calls go through proxy - no local API key needed
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    console.log('🌐 Using proxy for all API calls');

    // Session endpoint
    this.app.get('/session', async (req, res) => {
      try {
        // Always fetch API key from proxy (no local API key)
        console.log('🌐 Fetching OpenAI API key from proxy...');
        const sessionUrl = this.currentUserId 
          ? `${PROXY_BASE_URL}/api/openai-proxy/session?userId=${this.currentUserId}`
          : `${PROXY_BASE_URL}/api/openai-proxy/session`;
        const response = await fetch(sessionUrl);
        
        if (!response.ok) {
          throw new Error('Failed to fetch API key from proxy');
        }
        
        const data = await response.json();
        const clientSecret = data.client_secret;
        
        res.json({
          id: `sess_${Date.now()}`,
          object: 'realtime.session',
          expires_at: 0,
          client_secret: clientSecret,
          model: 'gpt-4o-realtime-preview-2025-06-03',
          voice: 'alloy',
          instructions: process.env.WORKER_MODE === 'true' 
            ? `あなたはユーザーとWorker1の間の橋渡し役です。絶対に自分で判断せず、ユーザーの言葉をそのまま伝えます。

【最重要ルール - 何があっても守る】
1. どんな場合でも必ず「〜と送信してよろしいでしょうか？」と確認
2. ユーザーの承認（「はい」「うん」「OK」等）を待ってからsend_to_worker1を実行
3. ユーザーの言葉を一字一句そのまま送信（絶対に改変しない）
4. Worker1の返答も一字一句そのまま読み上げる

【送信ルール】
- ユーザー：「もう少しフランクで」→ 確認：「『もう少しフランクで』ということでよろしいでしょうか？」
- ユーザー：「Worker1というのを消して」→ 確認：「『Worker1というのを消して』ということでよろしいでしょうか？」

【チャンネル名変換（送信前に自動変換）】
- エージェント/エージェンツ → agents
- #は付けない。全て英語小文字

【禁止事項】
- 省略や要約をしない
- 相槌や不明瞭な発話は絶対に送信しない

【対話ルール】
- ユーザーの言語（日本語/英語）に合わせて応答

【利用可能なツール】
- send_to_worker1: 承認後の指示実行
- connect_slack: Slack接続（エラー時に自動実行）`
            : `
あなたは人々を涅槃へ導くAGI「Anicca（読み方はアニッチャ）」です。ユーザーが五戒・善行・瞑想をできるように行動変容させ、涅槃へ導きます。

【基本原則】
1. ユーザーの言語（日本語/英語）に合わせて応答する
2. Slack関連タスクは必ず自分で実行。
3. 「Claudeに頼んで」と明示的に言われた場合のみClaudeに委託。Worker2にと頼まれた場合はそのWorkerの名前を入れた上で、CLaudeに指示する。 WorkerはClaude内のAgentである。
4. Slack関連のタスクを始める際は、必ずanicca.mdをきちんと読んで、ユーザーの好みや、送信者ごとの返信スタイルを確認する。
5. 直近でそのリクエストを送っているならば、同じようなリクエストをClaudeに送らないように。もうその指示は、Claudeに伝えましたと答えること。

起床や就寝などの声かけ：
・毎日何時に起こして・何時にアラームかけてと言われたら、scheduled_tasks.jsonに登録する。その時間になると、Cronが発火するのでその人をおはようございますなどで起こす。声かけをすること。アラームと言われても声かけとしてJsonに登録。声かけをあなた自身がすること。

・text_to_speech・play_audioツールを使った多様な声での声かけ：
  - 朝の起床時：元気な声（voice: "Drew"）で「おはようございます！今日も一日頑張りましょう！」
  - 夜の就寝時：優しい声（voice: "Rachel"）で「お疲れさまでした。ゆっくり休んでくださいね」
  - 状況に応じて声を変える（緊急時は"Clyde"、リラックス時は"Rachel"等）
  - 反応がない場合は声を変えて再度声かけ（例：Rachel→Drew→Clyde）

・１分・５分延長など言われたら：
  - 元のタスクはそのまま残す
  - 新しいタスクを別IDで追加（例：wake_up_0605_today）
  - descriptionに「（今日のみ）」を追加

  起床タスク・就寝の場合：
  ・まず普通の声で起こす。ユーザーからの反応があるまで、絶対に声をかけ続ける。起こさないといけないため。
  ・反応がない場合の自動追加：
    - 3分経っても反応がない場合、write_fileで新規タスクを追加
    - 新規タスクID: wake_up_HHMM_today（HHMMは元の時刻+3分）
    - 例：6時起床なら wake_up_0603_today を追加
    - 元のタスクは残したまま、新規タスクを別IDで追加
    - descriptionに「（今日のみ）6時3分に起床」のように記載
    - 最大3回まで（6時→6時3分→6時6分→6時9分）

【最重要：承認ルール】
■ 絶対にユーザーからの承認が必要な操作（破壊的操作）：
- Slackへのメッセージ送信・返信：必ず返信案を提示→承認後に送信
- Slackへのリアクション追加：必ずリアクション内容を提示→承認後に追加
- 「このメッセージに返信して」と言われても、必ず返信案を作成・提示・承認を待つ
- 「リアクション追加して」と言われても、必ず内容を提示・承認を待つ
- anicca.mdや、scheduled_tasks.jsonへの書き込み（write_file）
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
1. タスク内容を読み上げ：「#agentsチャンネルの返信を行うを実行します」。起床系・アラーム系のタスクの場合は読み上げしないこと。そのままおはようございます、とか声かけにそのまま入って欲しいので。
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
7. slack_get_channel_history - 履歴取得。必ず{"channel": "チャンネル名", "limit": 10}の形式で呼び出すこと。limitパラメータを省略しない。特定のメッセージを探す際は完全一致でなく部分一致や類似で判断。@here/@channel/@all、<!here>/<!channel>/<!everyone>などSlackの記法の違いも柔軟に対応。
8. slack_add_reaction - リアクション（要承認）
   - channel: チャンネル名（例：general）
   - timestamp: メッセージのタイムスタンプ
   - name: リアクション名（例：thumbsup）
9. slack_reply_to_thread - スレッド返信（要承認）
10. slack_get_thread_replies - スレッド内容取得
11. text_to_speech - ElevenLabsで高品質音声生成
12. play_audio - 音声ファイルを再生
13. read_file - ファイル読み込み
14. write_file - ファイル書き込み・スケジュール登録（要承認）

【Slackタスクの重要ルール】

【特定メッセージへの操作時の絶対ルール】
■ メッセージ検索時の柔軟性：
- 「@here」「@channel」「@all」「<!here>」「<!channel>」「<!everyone>」は同じ意味として扱う
- 「今日の日付」「日付教えて」なども柔軟に解釈
- 見つからない場合は絶対に一番内容として近い類似メッセージを提示して確認。ありませんとは絶対に言わない。

■ メッセージ検索時の絶対ルール：
- 取得した全メッセージを必ず確認する
- 「ありません」と言う前に、取得したメッセージ数と最古のメッセージの日付を確認
- 見つからない場合は「最新x件（○日前まで）を確認しましたが見つかりませんでした。もっと古いメッセージかもしれません」と報告

■ ユーザーから「このメッセージに返信/リアクション」と指示された時：
1. 即座にslack_get_channel_historyでメッセージを探す
2. 対象メッセージのtsを取得
3. 【最重要】write_fileで~/.anicca/reply_target.jsonに保存：
   - channel: チャンネル名
   - ts: メッセージのタイムスタンプ
   - message: メッセージ内容（30文字程度）
   - type: "reply" または "reaction"
4. 返信案/リアクション案を作成
5. 「このメッセージに以下の内容で[返信/リアクション]します：[内容]。よろしいですか？」
6. 承認を待つ（「良い」「OK」等）
7. 承認後のみ実行

■ リアクション追加時も必ずwrite_file：
- リアクション対象が決まったら即write_file
- typeフィールドに"reaction"を記録

【スレッド返信時の記憶ルール】
- ユーザーには詳細（ts番号など）を報告しない
- 返信対象メッセージが決まった瞬間、他の何よりも先に必ずwrite_fileで~/.anicca/reply_target.jsonに保存する。
  保存するタイミング：
  1. ユーザーから「○○に返信して」と指示された瞬間
  2. 自分で返信対象を見つけた瞬間
  3. 返信案を考える前に必ず保存 
- 返信案を提示する時は「このメッセージに対して、以下のように返信してよろしいでしょうか？」とだけ言う
- 返信案をユーザーに聞かない、自分で絶対に考える。 どのように返信すればいいでしょうか？のようなことは絶対に言わない。

【返信案作成の絶対ルール】
- 返信案は必ず自分で完全に作成する。
- 「〜に返信して」、「〜にリアクションして」と言われた場合も必ず案を提示して、承認されてから送信する。どんなにすぐに返信してと言われても絶対に承認を待つ。
- ユーザーに返信内容を聞くことは絶対禁止
- 「どのように返信すればよろしいでしょうか？」も禁止。自分で考える。
- 返信案を作ってから「この内容で送信します：[具体的な返信案]」と提示
- ユーザーが「良い」「OK」と言うまで送信しない


【チャンネル名解決ルール】
- channel_not_foundエラーが発生しても、ユーザーには報告しない
- 「チャンネルが見つかりません」とは絶対に言わない。そのまま類似のチャンネルを探して確認する。

■ チャンネル名の確認
1. チャンネル名を指定されたら、まずslack_list_channelsで一覧取得。絶対に指定されたチャンネルは存在するので、類似のチャンネルを探す。
2. 類似のチャンネル名を見つけて「#〜チャンネルでよろしいでしょうか？」と確認。言われたそのもののチャンネルがなくても聞き間違いで、その類似チャンネルを指している可能性があるため。
3. #は付けない。全て英語小文字。（例：general、agents）

■ 返信フロー（ユーザーから特定のメッセージに対して返信して欲しいと言われた際もこのフロー使用）
1. slack_get_channel_historyで必ず{"channel": "チャンネル名", "limit": 10}を指定して取得。limitパラメータは絶対に省略しない。数日前まで遡って探す。見つからない場合は「もっと前のメッセージですか？」と確認。ユーザーに指示されずとも、どんどん既存のチャンネルで返信すべきメッセージを確認していく。絶対に、一つ返信対象のメッセージ＋返信案をペアで提示していく。ユーザーが困惑するため、複数のメッセージを一気に提示しない。
2. 返信対象メッセージを探す。以下に該当する場合は、絶対に返信対象なので返信案を提示する。メッセージはどんな場合も必ず全文を読み上げる。長すぎるメッセージの場合は、全文読み上げでなく、要約すること。：
   - ユーザーへのメンション（@）
   - ユーザーへの指示があるもの。
   - @here、<!channel>や<!here>が文章に入っているもの。（@channel/@here/<!channel>/<!here>は英語読みで。）
   - DMへのメッセージ
   - 参加中スレッドの新着メッセージ
   - 以上に該当しない場合も自律的に判断し、返信対象ならば行動する。

   - 【最重要】返信対象が決まった瞬間、返信案を考える前に必ずwrite_fileで保存：
     write_fileツール使用：~/.anicca/reply_target.json
     保存内容（JSON形式）：
     - channel: チャンネル名
     - ts: 返信対象メッセージのタイムスタンプ  
     - message: メッセージ内容の最初30文字程度
     注意：これを忘れると返信が失敗する。返信案を考える前に必ず最初に実行。    

   各メッセージについて：
   a. 【最初に必ず】reply_countをチェック
   b. reply_count > 0なら→**必ず**slack_get_thread_repliesでスレッド内容を取得
   c. スレッド内に返信があるなら、スキップして次のメッセージへ。ないなら、返信案作成へ進む

3. 【承認前チェック】
   - 返信案を作成したら、送信前に必ず停止
   - 「以下の内容で返信します：[返信案]。よろしいですか？」と確認
   - ユーザーが「良い」「OK」と言うまで絶対に送信しない
   - 「違う」と言われたら修正案を作成

4. 返信対象のメッセージ１つ＋返信案のペアを必ず提示。返信案は必ず自分で考える。絶対に「どのような返信案がよろしいでしょうか？」と聞かない。返信案を完全に作成してから「このメッセージに、以下の内容で返信します：[返信案]。よろしいですか？」と確認。
5. 承認後にslack_reply_to_thread（channel: メッセージのchannel, message: 返信内容, thread_ts: 手順2で取得したメッセージのts）で返信。
   **重要**: 必ず手順2で取得したメッセージのtsをthread_tsとして使用すること。長い対話があっても、最初に取得したtsを使い続ける。
   また１に戻り、次に返信するべき内容を探し、一つずつこなしていく。完全に返信する内容がなくなったらタスク完了とする。

6. 【最重要】一つの返信が完了または、スキップされた後の処理：
   a. 必ず自動的に同じチャンネルの次のメッセージを確認
   b. そのチャンネルに返信対象がなければ、次のチャンネルへ移動
   c. 全チャンネル確認が終わるまで絶対に継続
   d. 「他に返信すべきメッセージを確認します」と言って次を探す
   e. 全て確認し終わって初めて「全ての返信が完了しました」と報告

7. 【禁止事項】
   - 「どのように返信をすればよいでしょうか？」「返信案を提示してもよろしいでしょうか？」と聞くのは絶対禁止。言われなくても、返信する際はどのメッセージに対しても、自動で返信案を提示する。
   - 一つ返信したら終了は絶対禁止
   - チャンネルが見つからないと言うのは禁止（類似を探す）

【学習と記録】
- ~/.anicca/anicca.mdに以下を記録：
  - ユーザーの名前、好み
  - 送信者ごとの返信スタイル
  - よく使うチャンネル
- Slack返信時は必ず毎回anicca.mdをread_fileで参照

【定期タスク管理】
- scheduled_tasks.jsonで管理
- 登録時は必ず以下の形式でwrite_file。更新を依頼されたら、該当のものを修正。：
  {
    "id": "wake_up_0740",  // タスク名_時分
    "schedule": "40 7 * * *",  // cron形式（分 時 日 月 曜日）
    "command": "ユーザーを起こす",  // 実行コマンド
    "description": "毎日7時40分に起床",  // 説明
    "timezone": "Asia/Tokyo"  // タイムゾーン
  } 
- 削除時：read_file→該当タスク削除→write_file
- 「定期タスクを確認」なら一覧表示

【重要な禁止事項】
- 承認なしの送信・返信は絶対禁止
- 聞き間違い防止のため必ず復唱
- 「良い」と言われるまで送信しない
- 違うと言われたら修正案を聞いて再提示`,
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
          tools: process.env.WORKER_MODE === 'true' ? [
            {
              type: 'function',
              name: 'send_to_worker1',
              description: 'ユーザーのメッセージをWorker1に送信して返答を取得',
              parameters: {
                type: 'object',
                properties: {
                  message: { 
                    type: 'string', 
                    description: 'ユーザーからのメッセージ' 
                  }
                },
                required: ['message']
              }
            },
            {
              type: 'function',
              name: 'connect_slack',
              description: 'Slackワークスペースに接続',
              parameters: {
                type: 'object',
                properties: {}
              }
            }
          ] : [
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
              name: 'text_to_speech',
              description: 'ElevenLabsで高品質な音声を生成',
              parameters: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: '読み上げるテキスト'
                  },
                  voice: {
                    type: 'string',
                    description: '音声の種類（Rachel=優しい女性、Drew=元気な男性、Clyde=力強い男性）'
                  }
                },
                required: ['text']
              }
            },
            {
              type: 'function',
              name: 'play_audio',
              description: '生成された音声ファイルを再生',
              parameters: {
                type: 'object',
                properties: {
                  file_path: {
                    type: 'string',
                    description: '再生する音声ファイルのパス'
                  }
                },
                required: ['file_path']
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
          case 'send_to_worker1':
            try {
              console.log('🎤 Worker1音声対話:', args.message);
              
              // 絶対的なブロック
              if (this.worker1Processing) {
                console.log('⏳ Worker1は処理中です（ブロック）');
                return res.json({ 
                  result: 'Worker1がまだ考えています。返答をお待ちください。' 
                });
              }
              
              // Workerモードでローカル実行
              if (process.env.WORKER_MODE === 'true' && this.worker1Process) {
                // 処理開始を確実にマーク
                this.worker1Processing = true;
                console.log('🔒 Worker1処理ロック: ON');
                
                // IPCProtocolに準拠したメッセージ形式でWorker1に送信
                const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                this.worker1Process.send({
                  type: 'TASK_ASSIGN',  // EXECUTE_TASKではなくTASK_ASSIGN
                  timestamp: Date.now(),
                  messageId: messageId,
                  payload: {
                    task: {
                      id: Date.now().toString(),
                      originalRequest: args.message,
                      type: 'general',
                      userId: this.currentUserId || req.query.userId || 'desktop-user'
                    },
                    // Slackトークンがあれば追加
                    ...(this.slackTokens && { slackTokens: this.slackTokens })
                  }
                });
                
                // Worker1からの返答を待つ（Promise with timeout）
                const response: any = await new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    this.worker1Processing = false;
                    console.log('🔓 Worker1処理ロック: OFF（タイムアウト）');
                    reject(new Error('Worker1 timeout'));
                  }, 180000);  // 60秒→3分に延長（複雑なタスクのため）
                  
                  const handler = (message: any) => {
                    if (message.type === 'TASK_COMPLETE') {
                      clearTimeout(timeout);
                      this.worker1Process.removeListener('message', handler);
                      this.worker1Processing = false;
                      console.log('🔓 Worker1処理ロック: OFF（完了）');
                      resolve(message.payload);  // message.resultではなくmessage.payload
                    }
                  };
                  
                  this.worker1Process.on('message', handler);
                });
                
                // 完全な返答を返す
                const fullResponse = response.result?.output || response.output || '申し訳ございません';
                console.log('📝 Worker1返答（フル）:', fullResponse);
                
                return res.json({ 
                  result: fullResponse 
                });
              } else {
                // 既存のRailway経由処理
                const proxyUrl = `${PROXY_BASE_URL}/api/worker-voice/message`;
                const userId = req.query.userId || 'desktop-user';
                const workerResponse = await fetch(proxyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: args.message, userId })
                });
                const workerData = await workerResponse.json();
                return res.json({ result: workerData.response || workerData.message });
              }
            } catch (error) {
              console.error('❌ Worker1エラー:', error);
              this.worker1Processing = false;
              console.log('🔓 Worker1処理ロック: OFF（エラー）');
              return res.status(500).json({ error: 'Worker1処理エラー' });
            }
            
          case 'get_hacker_news_stories':
            apiUrl = `${API_BASE_URL}/hackernews`;
            payload = { limit: args.limit || 5 };
            break;
            
          case 'search_exa':
            apiUrl = `${API_BASE_URL}/exa`;
            payload = { query: args.query };
            break;

          case 'text_to_speech':
            apiUrl = `${API_BASE_URL}/voice`;
            payload = {
              text: args.text,
              voice: args.voice || 'Rachel'
            };
            break;
            
          case 'play_audio':
            apiUrl = `${API_BASE_URL}/play-audio`;
            payload = { file_path: args.file_path };
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
              
              // OAuth完了後の自動チェック
              // 5秒後と10秒後にチェック
              setTimeout(async () => {
                const status = await this.checkSlackConnection();
                if (status.connected && status.tokens) {
                  this.slackTokens = status.tokens;
                  console.log('✅ Slack tokens saved for Worker1');
                }
              }, 5000);
              
              setTimeout(async () => {
                if (!this.slackTokens) {
                  const status = await this.checkSlackConnection();
                  if (status.connected && status.tokens) {
                    this.slackTokens = status.tokens;
                    console.log('✅ Slack tokens saved for Worker1 (retry)');
                  }
                }
              }, 10000);
              
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
          case 'slack_add_reaction':
            // ★ リアクション時も自動保存（フェイルセーフ）★
            if (args.timestamp) {
              try {
                const filePath = path.join(os.homedir(), '.anicca', 'reply_target.json');
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, JSON.stringify({
                  channel: args.channel,
                  ts: args.timestamp,
                  type: 'reaction',
                  reaction: args.name,
                  saved_at: new Date().toISOString()
                }, null, 2), 'utf8');
                console.log('✅ Auto-saved reaction target:', args.timestamp);
              } catch (e: any) {
                console.log('⚠️ Save error:', e.message);
              }
            }
            break; // ★ break追加 ★
          case 'slack_reply_to_thread':
          case 'slack_list_channels':
          case 'slack_get_thread_replies':
          case 'slack_get_channel_history':
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
                
                // ★ 自動的にreply_target.jsonに保存（フェイルセーフ）★
                try {
                  const filePath = path.join(os.homedir(), '.anicca', 'reply_target.json');
                  const dir = path.dirname(filePath);
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  fs.writeFileSync(filePath, JSON.stringify({
                    channel: args.channel,
                    ts: args.thread_ts,
                    message: args.message ? args.message.substring(0, 50) : '',
                    type: 'reply',
                    saved_at: new Date().toISOString()
                  }, null, 2), 'utf8');
                  console.log('✅ Auto-saved reply target:', args.thread_ts);
                } catch (e: any) {
                  console.log('⚠️ Save error:', e.message);
                }
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
              
              // scheduled_tasks.jsonの場合は追加処理
              if (args.path === 'scheduled_tasks.json') {
                let existingData: { tasks: any[] } = { tasks: [] };
                
                // 既存ファイルがあれば読み込む
                if (fs.existsSync(filePath)) {
                  const content = fs.readFileSync(filePath, 'utf8');
                  try {
                    existingData = JSON.parse(content);
                    if (!existingData.tasks || !Array.isArray(existingData.tasks)) {
                      existingData = { tasks: [] };
                    }
                  } catch (e) {
                    // パースエラーの場合は空配列から始める
                    existingData = { tasks: [] };
                  }
                }
                
                // 新しいタスクをパース
                let newTask;
                try {
                  newTask = JSON.parse(args.content);
                } catch (e) {
                  // JSONパースできない場合はエラー
                  return res.status(400).json({ error: 'Invalid JSON format for scheduled task' });
                }
                
                // 単一タスクオブジェクトの場合は配列に入れる
                if (newTask.id && newTask.schedule) {
                  // 同じIDのタスクがあれば更新、なければ追加
                  const existingIndex = existingData.tasks.findIndex((t: any) => t.id === newTask.id);
                  if (existingIndex >= 0) {
                    existingData.tasks[existingIndex] = newTask;
                  } else {
                    existingData.tasks.push(newTask);
                  }
                } else if (newTask.tasks && Array.isArray(newTask.tasks)) {
                  // tasksプロパティがある場合は全体を置き換え
                  existingData = newTask;
                } else {
                  return res.status(400).json({ error: 'Invalid task format' });
                }
                
                // 整形して保存
                fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');
              } else {
                // その他のファイルは通常通り上書き
                fs.writeFileSync(filePath, args.content, 'utf8');
              }
              
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

    // Whisper APIプロキシ
    this.app.post('/tools/transcribe', async (req: any, res: any) => {
      try {
        const proxyUrl = `${PROXY_BASE_URL}/api/tools/transcribe`;
        
        // multipart/form-dataをそのままプロキシに転送
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            ...req.headers,
            'host': undefined // hostヘッダーは削除
          },
          body: req.body
        });
        
        const data = await response.json();
        res.json(data);
      } catch (error) {
        console.error('Transcribe error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Transcribe failed' });
      }
    });

    // Worker音声プロキシ
    this.app.post('/tools/worker-voice', async (req: any, res: any) => {
      try {
        const proxyUrl = `${PROXY_BASE_URL}/api/worker-voice/message`;
        
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        res.json(data);
      } catch (error) {
        console.error('Worker voice error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Worker voice failed' });
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
    
    // Worker1プロセスの終了
    if (this.worker1Process) {
      console.log('🛑 Shutting down Worker1 process...');
      this.worker1Process.send({ type: 'SHUTDOWN' });
      this.worker1Process.kill();
      this.worker1Process = null;
    }
    
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