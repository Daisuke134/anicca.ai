import { BaseWorker } from './BaseWorker';
import { getSlackTokensForUser } from '../../database';
import { previewManager } from '../utils/PreviewManager';
import * as fs from 'fs';
import * as path from 'path';
import { Task, ExecutionResult } from '../types';

/**
 * Worker - 汎用Workerエージェントの実装
 * 
 * BaseWorkerを継承し、実際のClaude接続とMCP設定を行う
 */
export class Worker extends BaseWorker {
  private workspaceRoot: string | null = null;
  
  constructor() {
    super();
  }
  
  /**
   * 初期化処理
   */
  async initialize(): Promise<void> {
    try {
      console.log(`🚀 ${this.agentName} is starting initialization...`);
      
      // Workerエージェントタイプを設定
      process.env.CLAUDE_AGENT_TYPE = 'worker';
      console.log('🏷️ Setting CLAUDE_AGENT_TYPE to "worker"');
      
      // Worker専用のワークスペースを設定
      this.workspaceRoot = path.join(process.env.HOME || '', 'Desktop', 'anicca-agent-workspace', `worker-${this.workerNumber}`);
      if (!fs.existsSync(this.workspaceRoot)) {
        fs.mkdirSync(this.workspaceRoot, { recursive: true });
      }
      console.log(`📁 Worker${this.workerNumber} workspace: ${this.workspaceRoot}`);
      
      // ClaudeExecutorServiceにWorker専用のworkspaceRootを設定
      if (this.executor && (this.executor as any).setWorkspaceRoot) {
        (this.executor as any).setWorkspaceRoot(this.workspaceRoot);
      }
      
      // getSlackTokensForUserは必要な時に直接呼べるようにしておく
      (this as any).getSlackTokensForUser = getSlackTokensForUser;
      
      console.log(`✅ ${this.agentName} initialization complete`);
      console.log(`📊 ClaudeExecutorService will handle all MCP connections`);
      
      // 準備完了を親に通知（IPCHandlerが自動的に行う）
      
    } catch (error) {
      console.error(`❌ ${this.agentName} initialization failed:`, error);
      process.exit(1);
    }
  }
  
  /**
   * カスタムタスク処理（必要に応じてオーバーライド）
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    // Worker専用のworkspaceRootを確認（既に初期化時に設定済みのはず）
    this.workspaceRoot = this.workspaceRoot || path.join(process.env.HOME || '', 'Desktop', 'anicca-agent-workspace', `worker-${this.workerNumber}`);
    
    // デバッグ: ユーザーID確認
    console.log(`🔍 [${this.agentName}] Task userId sources:`, {
      taskUserId: task.userId || 'not set',
      CURRENT_USER_ID: process.env.CURRENT_USER_ID || 'not set',
      SLACK_USER_ID: process.env.SLACK_USER_ID || 'not set',
      globalCurrentUserId: (global as any).currentUserId || 'not set'
    });
    
    // 特別な処理が必要な場合はここでオーバーライド
    // 例：アプリ作成後の追加処理など
    
    const result = await super.executeTask(task);
    
    // アプリ作成タスクの場合のみプレビューURL処理を実行
    const isAppCreationTask = task.originalRequest && /アプリ|ゲーム|サイト|ページ|ツール|ダッシュボード|作成|作って|作る/.test(task.originalRequest);
    
    if (!isAppCreationTask && result.success) {
      console.log(`📝 Skipping preview URL check (not an app creation task): ${task.originalRequest?.substring(0, 50)}...`);
    }
    
    // 成果物ベースでWebプロジェクトを検出してプレビュー公開
    if (result.success && isAppCreationTask) {
      try {
        console.log(`🔍 Checking for web projects in workspace: ${this.workspaceRoot}`);
        
        if (fs.existsSync(this.workspaceRoot)) {
          const dirs = fs.readdirSync(this.workspaceRoot);
          console.log(`📂 Workspace directories:`, dirs);
          
          // 各ディレクトリをチェックしてindex.htmlを探す
          for (const dir of dirs) {
            // CLAUDE.mdなどのファイルはスキップ
            if (dir.endsWith('.md') || dir.endsWith('.txt')) continue;
            
            const fullPath = path.join(this.workspaceRoot, dir);
            
            // ディレクトリでない場合はスキップ
            if (!fs.statSync(fullPath).isDirectory()) continue;
            
            const indexPath = path.join(fullPath, 'index.html');
            
            // index.htmlが存在すればWebプロジェクトとして公開
            if (fs.existsSync(indexPath)) {
              console.log(`🌐 Found web project with index.html: ${fullPath}`);
              const projectName = dir;
              
              // PreviewManagerで公開
              const previewInfo = await previewManager.publishApp(fullPath, {
                projectName,
                taskId: task.id,
                description: task.description,
                workerName: this.agentName,
                workerNumber: this.workerNumber,
                userId: process.env.CURRENT_USER_ID || task.userId
              });
              
              // 結果にプレビュー情報を追加
              result.previewUrl = previewInfo.previewUrl;
              result.appId = previewInfo.appId;
              result.metadata = {
                ...result.metadata,
                executedBy: result.metadata?.executedBy || this.agentName,
                preview: previewInfo
              };
              
              // デバッグ: 結果オブジェクトを確認
              console.log(`🌐 App published to preview: ${previewInfo.previewUrl}`);
              console.log(`📊 Result object preview URL: ${result.previewUrl}`);
              console.log(`📊 Result metadata preview: ${JSON.stringify(result.metadata?.preview, null, 2)}`);
              
              // プレビューURLをSlackに追加投稿
              try {
                const slackMessage = `[${this.agentName}] 🌐 アプリを見る: ${previewInfo.previewUrl}`;
                
                // ClaudeセッションでSlackに投稿
                const slackPrompt = `mcp__http__slack_send_messageツールを使って#anicca_reportチャンネルに以下を投稿してください:
${slackMessage}

これはアプリのプレビューURLです。投稿後は「投稿しました」とだけ返答してください。`;
                
                await this.session.sendMessage(slackPrompt);
                console.log(`📮 Preview URL posted to Slack`);
              } catch (error) {
                console.error(`Failed to post preview URL to Slack:`, error);
              }
              
              // 最初のWebプロジェクトのみ公開（複数ある場合）
              break;
            }
          }
        }
      } catch (error) {
        console.error('Failed to publish app to preview:', error);
      }
    }
    
    return result;
  }
  
  /**
   * リクエストからプロジェクト名を抽出
   * @private
   */
  private extractProjectName(request: string): string | null {
    if (!request) return null;
    
    // 「〜アプリ」「〜ゲーム」「〜ツール」などのパターンを抽出
    const patterns = [
      /(\S+)アプリ/,
      /(\S+)ゲーム/,
      /(\S+)ツール/,
      /(\S+)ダッシュボード/,
      /(\S+)システム/,
      /(\S+)サイト/,
      /(\S+)ページ/
    ];
    
    for (const pattern of patterns) {
      const match = request.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * Worker固有のクリーンアップ
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    
    // ClaudeExecutorServiceのクリーンアップ
    if (this.executor) {
      // 必要に応じてクリーンアップ処理
    }
  }
}

// メイン処理
async function main() {
  const worker = new Worker();
  
  // 初期化
  await worker.initialize();
  
  // IPCリスニングを開始
  worker.startListening();
  
  // グレースフルシャットダウン
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await worker.cleanup();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await worker.cleanup();
    process.exit(0);
  });
}

// エントリーポイント（直接実行された場合）
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}