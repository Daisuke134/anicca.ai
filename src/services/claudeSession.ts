import { ClaudeExecutorService } from './claudeExecutorService';
import * as fs from 'fs';
import * as path from 'path';

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface SessionData {
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
  conversationCount: number;
}

/**
 * Claude SDKセッション管理クラス
 * 
 * 1つのセッションで継続的な会話を管理
 * コンテキストを保持して自然な対話を実現
 */
export class ClaudeSession {
  private executorService: ClaudeExecutorService;
  private conversationHistory: ConversationEntry[] = [];
  private sessionStartTime: number;
  private isActive: boolean = true;
  private sessionId: string = '';
  private sessionFile: string;

  constructor(executorService: ClaudeExecutorService) {
    this.executorService = executorService;
    this.sessionStartTime = Date.now();
    this.sessionFile = path.join(process.env.HOME || '', '.anicca', 'session.json');
    
    // セッションを読み込むか新規作成
    this.loadOrCreateSession();
    
    // 新しいセッション開始時に実行状態をリセット
    if (this.executorService.resetExecutionState) {
      this.executorService.resetExecutionState();
    }
  }
  
  /**
   * セッションIDを生成
   */
  private generateSessionId(): string {
    // 永続的なセッションIDを使用
    return 'ANICCA-PERSISTENT-001';
  }
  
  /**
   * セッションを読み込むか新規作成
   */
  private loadOrCreateSession(): void {
    try {
      // ディレクトリが存在することを確認
      const configDir = path.dirname(this.sessionFile);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 既存のセッションを読み込み
      if (fs.existsSync(this.sessionFile)) {
        const sessionData: SessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        this.sessionId = sessionData.sessionId;
        this.sessionStartTime = sessionData.createdAt;
        console.log(`
♻️ Resuming Claude Session`);
        console.log(`📋 Session ID: ${this.sessionId}`);
        console.log(`🕐 Created at: ${new Date(this.sessionStartTime).toLocaleString('ja-JP')}`);
        console.log(`📊 Conversation count: ${sessionData.conversationCount || 0}`);
        console.log('-'.repeat(50));
        
        // 最終使用時刻を更新
        this.saveSession();
      } else {
        // 新規セッション作成
        this.sessionId = this.generateSessionId();
        console.log(`
🎯 New Persistent Claude Session Created`);
        console.log(`📋 Session ID: ${this.sessionId}`);
        console.log(`🕐 Started at: ${new Date(this.sessionStartTime).toLocaleString('ja-JP')}`);
        console.log('-'.repeat(50));
        
        // セッション情報を保存
        this.saveSession();
      }
    } catch (error) {
      console.error('❌ Failed to load session:', error);
      // エラー時は新規セッションとして扱う
      this.sessionId = this.generateSessionId();
    }
  }
  
  /**
   * セッション情報を保存
   */
  private saveSession(): void {
    try {
      const sessionData: SessionData = {
        sessionId: this.sessionId,
        createdAt: this.sessionStartTime,
        lastUsedAt: Date.now(),
        conversationCount: Math.floor(this.conversationHistory.length / 2)
      };
      
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  }

  /**
   * メッセージを送信して応答を取得
   */
  async sendMessage(userMessage: string): Promise<string> {
    console.log(`\n👤 User: "${userMessage}"`);
    
    // 会話履歴に追加
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });
    
    // コンテキスト付きのプロンプトを構築
    const contextualPrompt = this.buildContextualPrompt(userMessage);
    
    const startTime = Date.now();
    
    try {
      // ExecutorServiceの実行状態を確認
      const state = this.executorService.getCurrentState();
      
      if (state.isExecuting) {
        console.log('⏳ Waiting for previous task to complete...');
        // 前のタスクが完了するまで最大10秒待機
        const maxWait = 10000;
        const waitStart = Date.now();
        while (this.executorService.getCurrentState().isExecuting) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (Date.now() - waitStart > maxWait) {
            console.log('❌ Timeout! Force resetting execution state...');
            if (this.executorService.resetExecutionState) {
              this.executorService.resetExecutionState();
            }
            break;
          }
        }
      }
      
      // ExecutorServiceを使用して実行
      const result = await this.executorService.executeAction({
        type: 'general',
        reasoning: 'Voice conversation request',
        parameters: {
          query: contextualPrompt
        }
      });
      
      const endTime = Date.now();
      console.log(`⏱️ Response time: ${endTime - startTime}ms`);
      
      if (result.success && result.result) {
        // 応答を会話履歴に追加
        this.conversationHistory.push({
          role: 'assistant',
          content: result.result,
          timestamp: Date.now()
        });
        
        // 応答を整形（通知や実行結果を自然な会話に）
        const cleanResponse = this.formatResponse(result.result);
        console.log(`🤖 Claude: "${cleanResponse}"`);
        
        // セッション情報を保存
        this.saveSession();
        
        return cleanResponse;
      } else if (result.error === 'Another action is being executed') {
        // キューに入った場合は少し待ってリトライ
        console.log('📋 Action was queued, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.sendMessage(userMessage); // リトライ
      } else {
        throw new Error(result.error || 'No response');
      }
      
    } catch (error) {
      console.error('❌ Session error:', error);
      const errorMessage = 'すみません、エラーが発生しました。もう一度お願いします。';
      
      this.conversationHistory.push({
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now()
      });
      
      return errorMessage;
    }
  }
  
  /**
   * コンテキスト付きプロンプトを構築
   */
  private buildContextualPrompt(userMessage: string): string {
    // 最新の5つの会話を含める
    const recentHistory = this.conversationHistory.slice(-5);
    
    let prompt = `あなたは音声対話アシスタントです。ユーザーと自然な会話をしてください。

【重要】
- 簡潔に、1-2文で応答してください
- 音声で読み上げることを想定した自然な日本語で
- 実行結果は要約して伝えてください
- 「通知を送りました」などの技術的な説明は避けて、結果を直接伝えてください

`;
    
    if (recentHistory.length > 0) {
      prompt += '【これまでの会話】\n';
      recentHistory.forEach(msg => {
        const role = msg.role === 'user' ? 'ユーザー' : 'あなた';
        prompt += `${role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }
    
    prompt += `【今回のユーザーの発言】\n${userMessage}\n\n簡潔に応答してください。`;
    
    return prompt;
  }
  
  /**
   * 応答を音声用にフォーマット
   */
  private formatResponse(response: string): string {
    // 技術的な詳細を除去して自然な会話に
    let formatted = response
      .replace(/通知を送りました[：:]\s*/g, '')
      .replace(/✅\s*/g, '')
      .replace(/Task completed/gi, '完了しました')
      .replace(/\n\n+/g, '。')
      .trim();
    
    // 長すぎる場合は最初の2文まで
    const sentences = formatted.split(/。|！|？/);
    if (sentences.length > 2) {
      formatted = sentences.slice(0, 2).join('。') + '。';
    }
    
    return formatted;
  }
  
  /**
   * セッションを終了
   */
  end(): void {
    this.isActive = false;
    const duration = Date.now() - this.sessionStartTime;
    console.log(`\n📊 Session paused (will resume next time)`);
    console.log(`📋 Session ID: ${this.sessionId}`);
    console.log(`⏱️  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`💬 Total exchanges: ${Math.floor(this.conversationHistory.length / 2)}`);
    console.log(`🕐 Paused at: ${new Date().toLocaleString('ja-JP')}`);
    
    // セッション情報を保存
    this.saveSession();
  }
  
  /**
   * 会話をリセット（セッションは維持）
   */
  reset(): void {
    this.conversationHistory = [];
    console.log(`🔄 Conversation history cleared (Session: ${this.sessionId})`);
  }
  
  /**
   * 現在のセッション情報を取得
   */
  getSessionInfo(): { sessionId: string; startTime: number; exchanges: number; isActive: boolean } {
    return {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      exchanges: Math.floor(this.conversationHistory.length / 2),
      isActive: this.isActive
    };
  }
}