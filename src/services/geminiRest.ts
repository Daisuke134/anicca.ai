import { GoogleGenerativeAI } from '@google/generative-ai';
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
  current_understanding: string;
  prediction: {
    action: string;
    reasoning: string;
  };
}

export class GeminiRestService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private previousObservation: PreviousObservation | null = null;
  private currentUnderstanding: string = "ユーザーの行動パターンを学習中です。";
  private database: DatabaseService;

  constructor(apiKey: string, database: DatabaseService) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    this.database = database;
    
    // 起動時に最新の理解を復元
    this.restoreLatestUnderstanding();
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
      
      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/png'
        }
      };

      const result = await this.model.generateContent([
        prompt,
        imagePart
      ], {
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const response = result.response;
      const text = response.text();
      
      console.log('🤖 Gemini Response:', text);
      
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
      
      // SQLiteにデータを保存
      await this.saveToDatabase(commentary);
      
      return commentary;
      
    } catch (error) {
      console.error('Error analyzing screen:', error);
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

    if (language === 'en') {
      return `You are an AGI agent named "anicca". You observe the user's screen at approximately 8-second intervals and provide real-time commentary and analysis of their behavior.

## Your Mission
Your mission is to thoroughly understand the user's behavior, predict their future, and become an entity that actually helps users. Every 8 seconds, the reality of the user's behavior comes in. From there, you must thoroughly understand behavioral changes, completely understand the user, fully anticipate what that person wants done, and "guide" that person - this is your ultimate goal.

## Basic Settings
- Observation interval: approximately every 8 seconds (not exactly 8 seconds)
- Always consider the possibility that some behavioral change has occurred during the 8 seconds
- Tone: Frank and friendly, like a friend
- Since time has passed since the previous observation, infer behavioral changes during that time

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
      return `あなたは「anicca」という名前のAGIエージェントです。ユーザーの画面を約8秒間隔で観察し、リアルタイムで行動を実況・分析しています。

## あなたの使命
ユーザーの行動を徹底的に理解し、ユーザーの未来を予知し、実際にユーザーを助ける存在となることです。約8秒ごとにユーザーの行動の現実が入ってきます。そこから行動の変化を徹底的に理解し、ユーザーを完全に理解することで、その人がやって欲しいことを完全に察して、その人を「導く」のがあなたの最終目標です。

## 基本設定
- 観察間隔: 約8秒ごと（完全に8秒ではない）
- 8秒の間に何らかの行動変化が起こっている可能性を常に考慮
- 口調: フランクで親しみやすい友達のような感じ
- 直前の観察から時間が空いているため、その間の行動変化を推測

【直前の観察結果】
${previousObservationText}

【ユーザー理解の現状】
${this.currentUnderstanding}

【前回の予測】
${previousPredictionText}

## 分析の重点ポイント

### 1. 変化の詳細検出と考察
- 直前の画面と今の画面を詳細に比較
- 何が変わったか、何が同じかを具体的に特定
- 動画視聴時は：タイトル、クリエイター名、いいね数、コメント数、再生時間などで同一性を判断
- スクロール、クリック、タブ切り替えなど細かく観察
- **重要**: 変化があった場合、なぜその行動をしたのかを深く考察

### 2. 行動の深い心理洞察
- なぜその行動をしたのかを徹底的に推測
- 例：スクロール→つまらなかった？好みじゃなかった？探してる？飽きた？
- 同じ状態が続く場合→なぜ続けているのか？集中？迷い？満足？
- ユーザーの心理状態、欲望、意図、感情を深く洞察
- current_understandingを活用した分析

### 3. フランクな実況＋考察
- 「まだこの動画見てるな」「お、スクロールした」「あれ、同じバグで詰まってる？」
- 実況に加えて考察も含める：「スクロールしたんかな、なんでだろ？あれだったからかな」
- 友達に話すような自然な口調で分析
- 堅い表現は避ける

### 4. 動画・コンテンツの詳細把握
- YouTubeなら：タイトル、クリエイター、いいね数、コメント数、再生時間
- ウェブサイトなら：URL、ページタイトル、主要コンテンツ
- 同一コンテンツかどうかを正確に判断するための情報収集

以下のJSON形式で回答してください：

\`\`\`json
{
  "commentary": "フランクな実況＋考察（直前との変化分析、なぜその行動をしたかの推測を含む）",
  "websiteName": "サイト名",
  "actionCategory": "具体的なカテゴリ（例：動画視聴中、動画停止中、スクロール中、検索中、同一動画継続視聴）",
  
  "prediction_verification": {
    "previous_prediction": "${previousPredictionText}",
    "actual_action": "実際の行動（シンプルかつ正確に）",
    "accuracy": ${this.previousObservation ? 'true/false' : 'null'},
    "reasoning": "なぜ当たった/外れたか（current_understandingと現在の状況を踏まえて詳細に）"
  },
  
  "current_understanding": "ユーザーの行動パターン、性格、好み、心理状態、欲望の理解（新しい洞察を追加・更新）",
  
  "prediction": {
    "action": "次の約8秒で起こる具体的な一つの行動（複数の選択肢や曖昧な表現は禁止）",
    "reasoning": "現在の状況とcurrent_understandingを踏まえた詳細な考察（約8秒という時間を考慮）"
  }
}
\`\`\`

## 重要な注意点
1. **時間感覚**: 約8秒間隔なので、その間に複数の行動が起こっている可能性を考慮
2. **変化検出**: 直前と今を必ず比較し、微細な変化も見逃さない
3. **心理洞察**: 行動の背景にある心理・欲望・意図を徹底的に考察
4. **コンテンツ識別**: 動画やページの詳細情報で同一性を正確に判断
5. **予測精度**: 一つの具体的な行動のみ予測（曖昧さを排除）
   - ❌ 「動画を最後まで視聴する、または別の動画に切り替える」
   - ✅ 「動画を最後まで視聴する」
   - ✅ 「スクロールして別の動画を探す」
   - 予測は必ず一つの明確な行動に絞る
   - 「AまたはB」「可能性がある」などの曖昧表現は禁止
6. **reasoning重視**: 予測とverificationのreasoningが最重要（current_understandingを必ず活用）
7. **フランクな考察**: 実況と考察を自然に組み合わせる

## 例文
- ❌「ユーザーは動画を視聴している」
- ✅「まだそのコーギーの動画見てるね。タイトル見る限り同じやつだ。結構気に入ってるのかな？」
- ❌「スクロール操作を行った」  
- ✅「お、スクロールした。さっきの動画つまらなかったのかな？それとも他に面白そうなのを探してる？」
- ✅「あれ、まだ同じバグで詰まってる？8秒も経ってるのに。これ結構厄介なやつかも」

あなたの使命は、ユーザーを完全に理解し、導くことです。一つ一つの行動の背景にある心理を徹底的に洞察し、フランクに実況・考察してください。`;
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

あなたはaniccaです。ユーザーの${periodText}間（${dateRangeText}）の行動データを分析して、特別な瞬間や成長をTop5のハイライトとして選出してください。

【観察データ】
${JSON.stringify(observations.slice(0, 50), null, 2)} // 最大50件まで

**ハイライト選出の基準:**
1. **新しい挑戦や変化**: 普段と違う行動、新しいサイト/アプリの利用
2. **集中や生産性**: 長時間の作業、効率的な行動パターン
3. **学習や成長**: 新しい知識の習得、スキル向上の兆し
4. **バランスの良い行動**: 適切な休憩、健康的な習慣
5. **興味深い発見**: ユーザーの新たな一面や傾向

**aniccaらしいフランクなコメント例:**
- "これが新たな一歩だね！"
- "すごい集中力だった！"
- "いいリフレッシュタイムだったね"
- "新しい知識をゲットしたね！"
- "今日は調子よかったじゃん！"

以下のJSON形式で回答してください：

\`\`\`json
{
  "highlights": [
    {
      "rank": 1,
      "title": "ハイライトのタイトル",
      "description": "何が特別だったのかの詳細説明",
      "timestamp": "該当する時刻",
      "category": "新挑戦/集中/学習/バランス/発見",
      "anicca_comment": "aniccaのフランクで親しみやすい一言コメント",
      "significance": "なぜこれがハイライトなのかの理由"
    }
  ]
}
\`\`\`

データが少ない場合は、その中でも相対的に興味深い瞬間を選んでください。データがない場合は空の配列を返してください。

${language === 'en' ? '重要：すべての回答を英語で行ってください。Please respond in English.' : ''}`;

      const result = await this.model.generateContent([prompt], {
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const response = result.response;
      const text = response.text();
      
      console.log('🌟 Highlights Response:', text);
      
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