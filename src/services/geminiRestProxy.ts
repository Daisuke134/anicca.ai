import { ScreenFrame } from '../types';
import { DatabaseService } from './database';
import { ProxyClient, AnalyzeResponse } from './proxyClient';

interface PreviousObservation {
  commentary: string;
  websiteName: string;
  actionCategory: string;
  prediction: {
    action: string;
    reasoning: string;
  };
  timestamp: number;
}

interface CommentaryResponse {
  commentary: string;
  websiteName: string;
  actionCategory: string;
  prediction_verification: {
    previous_prediction: string;
    actual_action: string;
    accuracy: boolean;
    reasoning: string;
  };
  current_understanding: string;
  prediction: {
    action: string;
    reasoning: string;
  };
}

export class GeminiRestProxyService {
  private proxyClient: ProxyClient;
  private previousObservation: PreviousObservation | null = null;
  private currentUnderstanding: string = "ユーザーの行動パターンを学習中です。";
  private database: DatabaseService;

  constructor(database: DatabaseService) {
    // プロキシクライアントの設定
    const serverUrl = process.env.ANICCA_SERVER_URL || 'https://anicca-proxy.vercel.app';
    const clientKey = process.env.ANICCA_CLIENT_KEY || 'anicca-desktop-client-2024';
    
    // クライアントIDは一意に生成（本番環境ではデバイスIDなどを使用）
    const clientId = this.generateClientId();
    
    this.proxyClient = new ProxyClient({
      serverUrl,
      clientKey,
      clientId
    });
    
    this.database = database;
    
    // 起動時に最新の理解を復元
    this.restoreLatestUnderstanding();
  }

  private generateClientId(): string {
    // ElectronのメインプロセスではlocalStorageが使えないため、
    // OSのホスト名とランダム値を組み合わせて一意のIDを生成
    const os = require('os');
    const hostname = os.hostname();
    const randomId = Math.random().toString(36).substr(2, 9);
    return `${hostname}-${Date.now()}-${randomId}`;
  }

  private async restoreLatestUnderstanding(): Promise<void> {
    try {
      const latestUnderstanding = await this.database.getLatestUnderstanding();
      if (latestUnderstanding) {
        this.currentUnderstanding = latestUnderstanding;
        console.log('🧠 Latest understanding restored:', latestUnderstanding.substring(0, 100) + '...');
      } else {
        console.log('🧠 No previous understanding found, starting fresh');
      }
    } catch (error) {
      console.error('❌ Error restoring understanding:', error);
    }
  }

  async analyzeScreen(frame: ScreenFrame, language: string = 'ja'): Promise<CommentaryResponse> {
    try {
      const imageBase64 = frame.imageData.toString('base64');
      const prompt = this.buildPrompt(language);
      
      // プロキシサーバー経由でGemini APIを呼び出す
      const response = await this.proxyClient.analyzeFrame(
        imageBase64,
        language,
        prompt,
        this.currentUnderstanding
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to analyze frame');
      }

      console.log('🤖 Proxy Response:', response.data.commentary);
      console.log('📊 Usage remaining:', response.data.usage.remaining);
      
      // レスポンスをパース
      const commentary: CommentaryResponse = JSON.parse(response.data.commentary);
      
      // 次回のために現在の観察結果を保存
      this.previousObservation = {
        commentary: commentary.commentary,
        websiteName: commentary.websiteName,
        actionCategory: commentary.actionCategory,
        prediction: commentary.prediction,
        timestamp: Date.now()
      };
      
      // ユーザー理解を更新
      this.currentUnderstanding = commentary.current_understanding;
      
      // SQLiteにデータを保存
      await this.saveToDatabase(commentary);
      
      return commentary;
      
    } catch (error) {
      console.error('Error analyzing screen:', error);
      
      // エラーが429（レート制限）の場合は特別な処理
      if (error instanceof Error && error.message.includes('Daily limit reached')) {
        throw new Error('DAILY_LIMIT_REACHED');
      }
      
      throw error;
    }
  }

  private buildPrompt(language: string = 'ja'): string {
    const previousObservationText = this.previousObservation 
      ? JSON.stringify(this.previousObservation, null, 2)
      : language === 'en' 
        ? "No previous observation results as this is the first observation."
        : "初回観察のため、直前の観察結果はありません。";

    const previousPredictionText = this.previousObservation?.prediction?.action
      ? this.previousObservation.prediction.action
      : language === 'en'
        ? "No previous prediction as this is the first observation."
        : "初回観察のため、前回の予測はありません。";

    // プロンプトの内容は元のgeminiRest.tsと同じ
    if (language === 'en') {
      return `You are an AGI agent named "anicca". You observe the user's screen at approximately 8-second intervals and provide real-time commentary and analysis of their behavior...
[省略 - 元のプロンプトと同じ内容]`;
    } else {
      return `あなたは「anicca」という名前のAGIエージェントです。ユーザーの画面を約8秒間隔で観察し、リアルタイムで行動を実況・分析しています...
[省略 - 元のプロンプトと同じ内容]`;
    }
  }

  // デバッグ用：現在の状態を取得
  getCurrentState() {
    return {
      previousObservation: this.previousObservation,
      currentUnderstanding: this.currentUnderstanding
    };
  }

  // 状態をリセット
  reset() {
    this.previousObservation = null;
    this.currentUnderstanding = "ユーザーの行動パターンを学習中です。";
  }

  // SQLiteにデータを保存
  private async saveToDatabase(commentary: CommentaryResponse): Promise<void> {
    try {
      const now = new Date();
      const timestamp = now.toISOString();
      const date = now.toISOString().split('T')[0];
      const hour = now.getHours();

      await this.database.saveObservation({
        timestamp,
        date,
        hour,
        commentary: commentary.commentary,
        websiteName: commentary.websiteName,
        actionCategory: commentary.actionCategory,
        predictionData: JSON.stringify(commentary.prediction),
        verificationData: JSON.stringify(commentary.prediction_verification),
        currentUnderstanding: commentary.current_understanding
      });
    } catch (error) {
      console.error('❌ Error saving to database:', error);
    }
  }

  // ハイライト生成（プロキシ経由では未実装）
  async generateHighlights(observations: any[], period: string, startDate: string, endDate: string, language: string = 'ja'): Promise<any[]> {
    console.warn('⚠️ Highlights generation not implemented in proxy mode yet');
    // TODO: プロキシサーバーにハイライト生成エンドポイントを追加
    return [];
  }
}