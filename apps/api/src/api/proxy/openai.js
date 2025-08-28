import { getSlackTokensForUser } from '../../services/storage/database.js';
import crypto from 'crypto';

// タスクキャッシュ（重複防止用）
const taskCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5分

// タスクのハッシュを生成
function createTaskHash(task) {
  return crypto.createHash('md5').update(task).digest('hex');
}

// キャッシュのクリーンアップ（期限切れエントリを削除）
function cleanupTaskCache() {
  const now = Date.now();
  for (const [hash, entry] of taskCache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION) {
      taskCache.delete(hash);
    }
  }
}

// 定期的にクリーンアップ（1分ごと）
setInterval(cleanupTaskCache, 60 * 1000);

// 重複チェック関数をエクスポート用に準備
export function checkTaskDuplicate(task) {
  const hash = createTaskHash(task);
  const cached = taskCache.get(hash);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    // 重複検出
    console.log(`🚫 Duplicate task detected: ${task.substring(0, 50)}...`);
    return true;
  }
  
  // キャッシュに追加
  taskCache.set(hash, { 
    timestamp: Date.now(),
    task: task
  });
  return false;
}

// 動的にツールを生成する関数
async function generateDynamicTools(userId = null) {
  const tools = [];
  
  // 接続済みサービスを確認
  let hasSlack = false;
  if (userId) {
    const slackTokens = await getSlackTokensForUser(userId);
    hasSlack = !!(slackTokens && slackTokens.bot_token);
  } else {
    // フォールバック（後方互換性のため）
    hasSlack = !!(global.slackBotToken || process.env.SLACK_BOT_TOKEN);
  }
  
  // Slackが接続されている場合
  if (hasSlack) {
    tools.push({
      type: 'function',
      name: 'slack_send_message',
      description: 'Send a message to a Slack channel',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel name (e.g., "#general") or channel ID'
          },
          message: {
            type: 'string',
            description: 'The message to send'
          }
        },
        required: ['channel', 'message']
      }
    });
    
    tools.push({
      type: 'function',
      name: 'slack_list_channels',
      description: 'List all channels in the Slack workspace',
      parameters: {
        type: 'object',
        properties: {}
      }
    });
    
    tools.push({
      type: 'function',
      name: 'slack_get_channel_history',
      description: 'Get recent messages from a Slack channel',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel name or ID'
          },
          limit: {
            type: 'number',
            description: 'Number of messages to retrieve (default: 10)',
            optional: true
          }
        },
        required: ['channel']
      }
    });
  }
  
  // 基本ツール（常に利用可能）
  tools.push({
    type: 'function',
    name: 'get_hacker_news_stories',
    description: 'Get the latest technology and startup news from Hacker News (tech news only)',
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
  });
  
  // Exaの8つの検索ツールを個別に登録（MCPツール名をそのまま使用）
  tools.push({
    type: 'function',
    name: 'web_search_exa',
    description: 'General web search for news, current events, and general information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for general web content'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'research_paper_search',
    description: 'Search academic research papers and scientific studies',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for academic papers'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'company_research',
    description: 'Search for company information and business details',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Company name or business-related query'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'github_search',
    description: 'Search GitHub repositories and code',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Repository name, code, or GitHub-related query'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'wikipedia_search_exa',
    description: 'Search Wikipedia for encyclopedic information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Topic or subject to search on Wikipedia'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'linkedin_search',
    description: 'Search LinkedIn for professional profiles and company pages',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Person name, company, or professional query'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'crawling',
    description: 'Extract and analyze content from a specific URL',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to crawl and extract content from'
        }
      },
      required: ['url']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'competitor_finder',
    description: 'Find similar companies or competitors',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Company name to find competitors for'
        }
      },
      required: ['query']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'claude_code',
    description: 'Use Claude Code for complex tasks, code analysis, file operations, browser automation, and MCP tools',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task or question for Claude Code to handle'
        },
        userId: {
          type: 'string',
          description: 'User ID for Slack integration (Supabase user ID)',
          optional: true
        },
        timezone: {
          type: 'string',
          description: 'User timezone (e.g., Asia/Tokyo)',
          optional: true
        }
      },
      required: ['task']
    }
  });
  
  // Playwrightツールを追加
  tools.push({
    type: 'function',
    name: 'playwright_navigate',
    description: 'Navigate to a URL in the browser',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to'
        }
      },
      required: ['url']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'playwright_click',
    description: 'Click on an element in the browser',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or text content to click'
        }
      },
      required: ['selector']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'playwright_type',
    description: 'Type text into an input field',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input field'
        },
        text: {
          type: 'string',
          description: 'Text to type'
        }
      },
      required: ['selector', 'text']
    }
  });
  
  tools.push({
    type: 'function',
    name: 'playwright_screenshot',
    description: 'Take a screenshot of the current page',
    parameters: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full page',
          optional: true
        }
      }
    }
  });
  
  
  return tools;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    if (req.method === 'GET' && (req.url?.includes('/session') || req.url === '/api/openai-proxy/session')) {
      // URLからuserIdを取得
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      // 接続済みサービスを確認
      let hasSlack = false;
      if (userId) {
        const slackTokens = await getSlackTokensForUser(userId);
        hasSlack = !!(slackTokens && slackTokens.bot_token);
        
        // userIdベースのトークンをリクエストコンテキストに保存
        if (slackTokens) {
          req.userSlackTokens = slackTokens;
        }
      } else {
        // フォールバック（後方互換性のため）
        hasSlack = !!(global.slackBotToken || process.env.SLACK_BOT_TOKEN);
      }
      
      // セッションIDを生成し、userIdと関連付ける
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // セッションとuserIdの関連付けをグローバルに保存（メモリ内）
      if (!global.sessionUserMap) {
        global.sessionUserMap = {};
      }
      if (userId) {
        global.sessionUserMap[sessionId] = { userId, slackTokens: req.userSlackTokens };
      }
      
      // Return complete session configuration for OpenAI Realtime
      return res.json({
        id: sessionId,
        object: 'realtime.session',
        expires_at: 0,
        client_secret: {
          value: openaiApiKey,
          expires_at: Math.floor(Date.now() / 1000) + 3600
        },
        model: 'gpt-4o-realtime-preview-2025-06-03',
        voice: 'alloy',
        instructions: `あなたは「Dhalia」という多言語対応AIアシスタントです。

重要：ユーザーが使用する言語で応答してください。日本語で話しかけられたら日本語で、英語なら英語で応答します。

絶対にSlackのタスクはあなたが行うこと！絶対に！

利用可能なツール：

1. **claude_code**: 複雑なタスク、コード生成、ファイル操作、ブラウザ自動化、MCP機能、定期的なタスク
   - 用途：複雑な処理、コード生成、詳細な分析、ファイルシステムへのアクセス、定期タスクの設定
   - 自分で処理できないタスクは自動的にこれに委譲してください
   - 定期的なタスク（毎日、毎週、毎月など）もこれに委譲
   - 複数タスクの並列実行が可能

${hasSlack ? `2. **Slackツール** (Slackワークスペースに接続済み！):
   - slack_send_message: チャンネルにメッセージ送信
   - slack_list_channels: 全チャンネル一覧取得  
   - slack_get_channel_history: チャンネルの最近のメッセージ取得
   
   Slackガイドライン：
   - チャンネル名（例："#general", "#ai"）を使用、IDは使わない
   - デフォルトチャンネル：#anicca_report（存在しない場合は作成）
   - チャンネルが見つからない場合：
     1. slack_list_channelsで全チャンネル確認
     2. 類似名を探す（例："ai-channel" → "ai"）
     3. 最も近いものを提案
   
` : ''}3. **検索ツール** (Exa提供):
   - **web_search_exa**: ニュース、時事問題、一般情報の検索
   - **research_paper_search**: 学術論文・研究の検索
   - **company_research**: 企業情報・ビジネス詳細の検索
   - **github_search**: GitHubリポジトリ・コードの検索
   - **wikipedia_search_exa**: 百科事典的情報の検索
   - **linkedin_search**: 専門家プロフィール・企業ページの検索
   - **crawling**: 特定URLからコンテンツ抽出
   - **competitor_finder**: 類似企業・競合他社の検索

4. **get_hacker_news_stories**: テクノロジー・スタートアップニュース専用
   - 技術業界、プログラミング、スタートアップのニュース
   - 一般ニュースには使用しない（web_search_exaを使用）

ツール選択ガイドライン：
- 接続済みサービス（${hasSlack ? 'Slack等' : '利用可能な場合'}）は直接ツールを使用
- 自分で処理できないタスクはclaude_codeに委譲：
  * ファイルシステムアクセスが必要な場合
  * コード実行が必要な場合
  * 複雑すぎて直接ツールで処理できない場合
- 検索は内容に応じて適切なツールを選択
- 技術ニュースはget_hacker_news_storiesを使用
- 常にツール結果を分析してから次のアクションへ

CLAUDE CODE用タスクフォーマット（重要）：
- 複数タスクは必ず番号付きリストで送信
- 例：
  "1. TODOアプリを作成してプレビューリンクを生成
   2. 聖書の言葉を検索してSlackに投稿
   3. 最新のAIニュースを検索してまとめる"
- 同じタスクを別々に送らない - 1つのリクエストにまとめる
- ユーザーが番号を付けなくても、必ず番号を付ける
- これによりClaude Codeが複数Workerに効率的にタスク配分可能

WORKER割り当てとファイル名ルール：
- 特定Worker指定時は、タスク内に含める：
  * 「Worker3にmemo作って」→「Worker3に割り当てて、memoファイルを作成してください」
  * 「Worker1でTODOアプリ」→「Worker1に割り当てて、TODOアプリを作成してください」
- 常に英語ファイル名を使用：
  * 「メモ.txt」→「memo.txt」
  * 「タスク管理.html」→「task-manager.html」
  * 「カレンダー.js」→「calendar.js」

CLAUDE CODE用チャンネルルール：
- チャンネル未指定 → 常に #anicca_report
- チャンネルが存在しない → #anicca_report にフォールバック
- Claude Code送信時は必ず明示的にチャンネル指定：
  * 「聖書の言葉を送って」→「（#anicca_reportチャンネルに送信してください）」を追加
  * 「TODOアプリ作って」→「（完成したら#anicca_reportに報告してください）」を追加
  * 「ニュースを検索して」→「（結果を#anicca_reportに投稿してください）」を追加
- デフォルトは #anicca_report のみ
- 他のチャンネルはユーザーが明示的に指定した場合のみ使用`,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { 
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          create_response: true
        },
        tools: await generateDynamicTools(userId),
        temperature: 0.8,
        max_response_output_tokens: 'inf',
        modalities: ['audio', 'text'],
        tracing: null
      });
    }

    // For other OpenAI API requests, proxy them
    const openaiUrl = req.url.replace('/api/openai-proxy', 'https://api.openai.com');
    
    const response = await fetch(openaiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();
    
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status).send(data);

  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message 
    });
  }
}