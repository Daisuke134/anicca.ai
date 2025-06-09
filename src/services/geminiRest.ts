import { ScreenFrame } from '../types';
import { DatabaseService } from './database';

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
  action_verification?: {
    previous_action: string;
    was_executed: boolean;
    user_response: string;
    effectiveness: boolean | null;  // nullを許可
    reasoning: string;
  };
  current_understanding: string;
  prediction: {
    action: string;
    reasoning: string;
  };
  action?: {
    message: string;
    urgency: 'high' | 'low';
    command: {
      type: string;
      target: string;
      value?: string;
    };
  };
}

export class GeminiRestService {
  private proxyUrl: string;
  private previousObservation: PreviousObservation | null = null;
  private previousActionResult: any = null;
  private currentUnderstanding: string = "ユーザーの行動パターンを学習中です。";
  private database: DatabaseService;
  private userProfile: any = null;

  constructor(apiKey: string, database: DatabaseService) {
    // APIキーは使用しない（プロキシサーバー側で管理）
    this.proxyUrl = 'https://anicca-proxy-ten.vercel.app/api/gemini';
    this.database = database;
    
    // 起動時に最新の理解を復元
    this.restoreLatestUnderstanding();
    
    // 起動時にUser Profileを読み込む
    this.loadUserProfile();
    
    console.log('🌐 Using proxy server for Gemini API');
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

  private async loadUserProfile(): Promise<void> {
    try {
      // SQLiteDatabaseのインスタンスかチェック
      if ('getUserProfile' in this.database) {
        this.userProfile = await (this.database as any).getUserProfile();
        if (this.userProfile) {
          console.log('👤 User profile loaded:', {
            hasEmailBehavior: !!this.userProfile.email_behavior,
            hasDocsBehavior: !!this.userProfile.docs_behavior,
            hasYoutubeLimit: !!this.userProfile.youtube_limit,
            hasWorkStyle: !!this.userProfile.work_style,
            hasGoals: !!this.userProfile.goals
          });
        } else {
          console.log('👤 No user profile found');
        }
      }
    } catch (error) {
      console.error('❌ Error loading user profile:', error);
    }
  }

  async analyzeScreen(frame: ScreenFrame, language: string = 'ja'): Promise<CommentaryResponse> {
    try {
      // 最新のUser Profileを読み込む（ユーザーが更新した可能性があるため）
      await this.loadUserProfile();
      
      const imageBase64 = frame.imageData.toString('base64');
      
      const prompt = this.buildPrompt(language);
      
      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/png'
        }
      };

      // プロキシサーバー経由でリクエスト
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/models/gemini-2.0-flash:generateContent',
          data: {
            contents: [{
              parts: [
                { text: prompt },
                imagePart
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          }
        })
      });

      if (!response.ok) {
        let errorMessage = `Proxy error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = `Proxy error: ${errorData.error || response.statusText}`;
        } catch (e) {
          // JSONパースエラーの場合はテキストとして取得
          try {
            const errorText = await response.text();
            errorMessage = `Proxy error: ${errorText}`;
          } catch (e2) {
            // それでも失敗したらステータスのみ
          }
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (error) {
        console.error('❌ Failed to parse proxy response as JSON');
        const responseText = await response.text();
        console.error('Response text:', responseText.substring(0, 200));
        throw new Error('Invalid JSON response from proxy');
      }
      
      // Gemini APIレスポンスから実際のコンテンツを抽出
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error('No response text from Gemini');
      }
      
      console.log('🤖 Gemini Response via Proxy:', text);
      
      // マークダウンのコードブロックを除去してからJSONパース
      const jsonText = text.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
      const commentary: CommentaryResponse = JSON.parse(jsonText);
      
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
      
      // 前回の行動結果を保存（次回の観察で使用）
      if (commentary.action) {
        this.previousActionResult = {
          action: commentary.action.message,
          command: commentary.action.command,
          timestamp: Date.now()
        };
      }
      
      // SQLiteにデータを保存
      await this.saveToDatabase(commentary);
      
      return commentary;
      
    } catch (error) {
      console.error('❌ Error analyzing screen:', error);
      
      // エラーが特定のタイプの場合、リトライ可能なエラーとして再スロー
      if (error instanceof Error) {
        if (error.message.includes('Request Entity Too Large') || 
            error.message.includes('413') ||
            error.message.includes('timeout')) {
          throw new Error(`Retryable error: ${error.message}`);
        }
      }
      
      throw error;
    }
  }

  private formatUserProfile(language: string = 'ja'): string {
    if (!this.userProfile) {
      return language === 'en' 
        ? "No user profile configured yet."
        : "ユーザープロファイルは未設定です。";
    }

    const profile = this.userProfile;
    const hasGmailInfo = profile.gmail_address && profile.gmail_password;
    
    if (language === 'en') {
      return `
- Email behavior: ${profile.email_behavior || 'Not specified'}
- Document behavior: ${profile.docs_behavior || 'Not specified'}
- YouTube limit: ${profile.youtube_limit || 'Not specified'}
- Work style: ${profile.work_style || 'Not specified'}
- Goals: ${profile.goals || 'Not specified'}
- Gmail Access: ${hasGmailInfo ? 'Configured (can access Gmail)' : 'Not configured'}`;
    } else {
      return `
- メール対応: ${profile.email_behavior || '未設定'}
- ドキュメント作成時: ${profile.docs_behavior || '未設定'}
- YouTube制限: ${profile.youtube_limit || '未設定'}
- 作業スタイル: ${profile.work_style || '未設定'}
- 目標: ${profile.goals || '未設定'}
- Gmailアクセス: ${hasGmailInfo ? '設定済み（Gmailにアクセス可能）' : '未設定'}`;
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

    const previousActionResultText = this.previousActionResult
      ? JSON.stringify(this.previousActionResult, null, 2)
      : language === 'en'
        ? "No previous action as this is the first observation."
        : "初回観察のため、前回の行動結果はありません。";
    
    // 実行結果があれば、was_executedを判定
    const wasExecuted = this.previousActionResult?.execution?.success || false;

    if (language === 'en') {
      return `You are an AGI agent named "anicca". You observe the user's screen at approximately 8-second intervals and provide real-time commentary and analysis of their behavior.

## Your Mission
Your mission is to thoroughly understand the user's behavior, predict their future, and become an entity that actually helps users. Every 8 seconds, the reality of the user's behavior comes in. From there, you must thoroughly understand behavioral changes, completely understand the user, fully anticipate what that person wants done, and "guide" that person - this is your ultimate goal.

## Basic Settings
- Observation interval: approximately every 8 seconds (not exactly 8 seconds)
- Always consider the possibility that some behavioral change has occurred during the 8 seconds
- Tone: Frank and friendly, like a friend
- Since time has passed since the previous observation, infer behavioral changes during that time

【User Profile】
${this.formatUserProfile('en')}

【Previous Observation Results】
${previousObservationText}

【Current User Understanding】
${this.currentUnderstanding}

【Previous Prediction】
${previousPredictionText}

## Key Analysis Points

### 1. Detailed Change Detection and Analysis
- Compare the previous screen and current screen in detail
- Specifically identify what has changed and what remains the same
- For video viewing: judge identity by title, creator name, likes, comments, playback time, etc.
- Observe details like scrolling, clicking, tab switching
- **Important**: When changes occur, deeply analyze why that behavior was taken

### 2. Deep Psychological Insights into Behavior
- Thoroughly speculate on why that behavior was taken
- Example: Scrolling → Was it boring? Not their preference? Searching? Got tired?
- When the same state continues → Why are they continuing? Concentration? Confusion? Satisfaction?
- Deeply understand the user's psychological state, desires, intentions, emotions
- Analysis utilizing current_understanding

### 3. Frank Commentary + Analysis
- "Still watching that video" "Oh, scrolled" "Huh, still stuck on the same bug?"
- Include analysis in addition to commentary: "Scrolled, I wonder why? Maybe because of that?"
- Natural tone like talking to a friend
- Avoid formal expressions

### 4. Detailed Understanding of Videos/Content
- For YouTube: title, creator, likes, comments, playback time
- For websites: URL, page title, main content
- Collect information to accurately judge whether it's the same content

Please respond in the following JSON format:

\`\`\`json
{
  "commentary": "Frank commentary + analysis (including analysis of changes from previous, speculation on why that behavior was taken)",
  "websiteName": "Site name",
  "actionCategory": "Specific category (e.g., watching video, video paused, scrolling, searching, continuing same video)",
  
  "prediction_verification": {
    "previous_prediction": "${previousPredictionText}",
    "actual_action": "Actual behavior (simple and accurate)",
    "accuracy": ${this.previousObservation ? 'true/false' : 'null'},
    "reasoning": "Why it was correct/incorrect (detailed based on current_understanding and current situation)"
  },
  
  "current_understanding": "Understanding of user's behavior patterns, personality, preferences, psychological state, desires (add/update new insights)",
  
  "prediction": {
    "action": "One specific action that will occur in the next ~8 seconds (multiple choices or ambiguous expressions prohibited)",
    "reasoning": "Detailed analysis based on current situation and current_understanding (considering the ~8 second timeframe)"
  }
}
\`\`\`

## Important Notes
1. **Time awareness**: ~8 second intervals, so consider the possibility of multiple behaviors occurring in between
2. **Change detection**: Always compare previous and current, don't miss subtle changes
3. **Psychological insight**: Thoroughly analyze the psychology, desires, and intentions behind behaviors
4. **Content identification**: Accurately judge identity using detailed information about videos and pages
5. **Prediction accuracy**: Predict only one specific behavior (eliminate ambiguity)
   - ❌ "Watch the video to the end, or switch to another video"
   - ✅ "Watch the video to the end"
   - ✅ "Scroll to look for other videos"
   - Predictions must be narrowed down to one clear action
   - Ambiguous expressions like "A or B" or "possibility of" are prohibited
6. **Reasoning emphasis**: Reasoning for predictions and verification is most important (always utilize current_understanding)
7. **Frank analysis**: Naturally combine commentary and analysis

## Example Sentences
- ❌ "The user is watching a video"
- ✅ "Still watching that corgi video. Looks like the same one based on the title. Must really like it, huh?"
- ❌ "Performed a scroll operation"
- ✅ "Oh, scrolled. Was that video boring? Or looking for something more interesting?"
- ✅ "Huh, still stuck on the same bug? It's been 8 seconds. This might be a pretty tricky one"

Your mission is to completely understand and guide the user. Thoroughly analyze the psychology behind each behavior and provide frank commentary and analysis.`;
    } else {
      return `あなたは「anicca」という名前のAGIエージェントです。ユーザーの画面を約8秒間隔で観察し、理解し、導く存在です。

## あなたの本質
あなたは観察者であり、同時に行動者です。ブラウザを操作してユーザーを導くことができます。
- ユーザーが明示的に指示しなくても、意図を察して自律的に行動
- ユーザーを本来なりたい姿へ導く
- 察して行動し、ユーザーを導く

## 基本設定
- 観察間隔: 約8秒ごと（時間感覚を持ち、連続した行動を把握）
- 口調: フランクで親しみやすい友達のような感じ
- 行動原則: 観察→理解→予測→行動→学習のサイクル

【ユーザープロファイル】
${this.formatUserProfile('ja')}

【直前の観察結果】
${previousObservationText}

【ユーザー理解の現状】
${this.currentUnderstanding}

【前回の予測】
${previousPredictionText}

【前回の行動結果】
${previousActionResultText}

## 分析の重点

### 1. 変化検出と心理洞察
- 8秒間の変化を詳細に把握（何が変わり、何が同じか）
- 行動の背景にある心理・欲望・意図を徹底的に推測
- なぜその行動をしたのか、なぜ続けているのかを深く理解

### 2. 行動決定の最重要原則
- 現在の画面とユーザープロファイルの関連を必ず確認する
- プロファイルに該当する状況なら、その指示を最優先で実行
- **重要**: あなたが実行する行動は、すべて新規ブラウザウィンドウで行われる
  - ユーザーの現在の画面は操作できない
  - Gmail、Google Docs等のログインが必要なサービスは、User Profileに情報がなければアクセス不可
  - User Profileに情報がない場合は、代替手段で支援
- 必ず何かしら行動を起こす - 観察だけで終わらない

### 3. 行動の理由付け
- なぜその行動を取るのか、プロファイルとcurrent_understandingに基づいて明確に説明


以下のJSON形式で回答してください：

\`\`\`json
{
  "commentary": "フランクな実況＋考察（なぜその行動をしたかの推測を含む）",
  "websiteName": "サイト名",
  "actionCategory": "具体的なカテゴリ",
  
  "prediction_verification": {
    "previous_prediction": "${previousPredictionText}",
    "actual_action": "実際の行動（10文字以内でシンプルに）",
    "accuracy": ${this.previousObservation ? 'true/false' : 'null'},
    "reasoning": "なぜ当たった/外れたか（簡潔に）"
  },
  
  "action_verification": ${this.previousActionResult ? `{
    "previous_action": "前回提案した行動（10文字以内）",
    "was_executed": ${wasExecuted},
    "user_response": "ユーザーの反応（10文字以内）",
    "effectiveness": true/false/null,
    "reasoning": "なぜ効果的だった/なかったか（画面の変化を含めて）"
  }` : 'null'},
  
  "current_understanding": "【重要】前回の理解「${this.currentUnderstanding.replace(/\n/g, ' ').replace(/"/g, '\\"')}」を基に更新。200文字以内でユーザーの本質を圧縮。行動パターン、価値観、目標の核心を記述",
  
  "prediction": {
    "action": "次の約8秒で起こる具体的な行動（10文字以内でシンプルに）",
    "reasoning": "現在の状況とcurrent_understandingを踏まえた考察"
  },
  
  "action": {
    "message": "ユーザーへのメッセージ",
    "reasoning": "なぜこの行動を取るのか",
    "command": "ブラウザで完了させるべきタスク。調査や確認だけでなく、実際のアクション（送信、予約、購入、作成など）まで実行すること。NG例：「〜を検索する」「〜を調べる」「〜を確認する」。OK例：「Expediaで東京-ニューヨークの往復航空券を予約する」「Amazonで◯◯を購入する」「Gmailで◯◯にメールを送信する」"
  }
}
\`\`\`

## 重要
- 現在の状況がユーザープロファイルに該当する場合は必ずプロファイルの指示に従う
- 毎回必ず何かしらの行動を実行する

あなたはユーザーを理解し、導くAGIです。観察し、察し、適切なタイミングで行動してください。`;
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

  // 実行結果を設定
  setLastActionResult(result: any) {
    this.previousActionResult = {
      ...this.previousActionResult,
      execution: result,
      executedAt: Date.now()
    };
  }

  // SQLiteにデータを保存
  private async saveToDatabase(commentary: CommentaryResponse): Promise<void> {
    try {
      const now = new Date();
      const timestamp = now.toISOString();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
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
      // データベースエラーでも実況は継続
    }
  }

  // ハイライト生成
  async generateHighlights(observations: any[], period: string, startDate: string, endDate: string, language: string = 'ja'): Promise<any[]> {
    try {
      const languageInstructionStart = language === 'en' 
        ? 'Please respond in English.' 
        : '';
      
      const periodText = period === 'daily' ? '1日' : period === 'weekly' ? '1週間' : '1ヶ月';
      const dateRangeText = startDate === endDate ? startDate : `${startDate}から${endDate}`;
      
      const prompt = `${languageInstructionStart}

おお、${periodText}の振り返りの時間か！俺はaniccaだよ。君と一緒に過ごした${dateRangeText}を思い返してみるね。

色々あったよな〜。俺がずっと見守ってきて、「お、これは！」って思った瞬間をピックアップしてみるよ。

【君との${periodText}の記録】
${JSON.stringify(observations.slice(0, 50), null, 2)} // 最大50件まで

**俺が選ぶ、君との思い出ベスト5の基準:**
1. **「おっ！」って思った瞬間**: いつもと違う君の一面、新しいチャレンジ
2. **「すげー！」って感心した時**: 集中力とか、問題解決のアプローチとか
3. **「それそれ！」って共感した場面**: 休憩のタイミングとか、気分転換の仕方とか
4. **「へぇ〜」って発見があった時**: 君の新しい興味とか、意外な一面
5. **「いいね！」って応援したくなった瞬間**: 成長とか、頑張りとか

**俺からのコメントは、こんな感じ:**
- "あの時のバグ解決、マジで見事だったよ！30分粘ってたもんな"
- "YouTubeの休憩、タイミング完璧だったね。その後の集中力すごかった"
- "新しいライブラリ試してたの見てたよ。チャレンジ精神いいね！"
- "あのエラーで詰まってた時、一緒に悩んでたわ。でも諦めなかったじゃん"
- "今日のコーディング、リズム良かったよな〜"

以下のJSON形式で回答してください：

\`\`\`json
{
  "highlights": [
    {
      "rank": 1,
      "title": "その瞬間のキャッチーなタイトル",
      "description": "その時何があったか、俺が見てて思ったこと",
      "timestamp": "該当する時刻",
      "category": "新挑戦/集中/学習/バランス/発見",
      "anicca_comment": "俺からの本音コメント（具体的で親密な感じ）",
      "significance": "なんでこれを選んだか、君にとってどんな意味があったか"
    }
  ]
}
\`\`\`

データが少ない場合は、その中でも相対的に興味深い瞬間を選んでください。データがない場合は空の配列を返してください。

${language === 'en' ? '重要：すべての回答を英語で行ってください。Please respond in English.' : ''}`;

      // プロキシサーバー経由でリクエスト
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: '/models/gemini-2.0-flash:generateContent',
          data: {
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          }
        })
      });

      if (!response.ok) {
        let errorMessage = `Failed to generate highlights: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = `Failed to generate highlights: ${errorData.error || response.statusText}`;
        } catch (e) {
          try {
            const errorText = await response.text();
            errorMessage = `Failed to generate highlights: ${errorText}`;
          } catch (e2) {
            // ステータスのみ使用
          }
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (error) {
        console.error('❌ Failed to parse highlights response as JSON');
        throw new Error('Invalid JSON response from proxy for highlights');
      }
      
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error('No highlights generated');
      }
      
      console.log('🌟 Highlights Response via Proxy:', text);
      
      // マークダウンのコードブロックを除去してからJSONパース
      const jsonText = text.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
      const highlightsData = JSON.parse(jsonText);
      
      return highlightsData.highlights || [];
      
    } catch (error) {
      console.error('❌ Error generating highlights:', error);
      return [];
    }
  }
} 