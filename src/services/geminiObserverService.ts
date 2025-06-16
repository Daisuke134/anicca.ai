import { ScreenFrame } from '../types';
import { DatabaseInterface } from './interfaces';
// 観察専用サービスのため、実行関連のimportは削除
import sharp from 'sharp';

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
  current_understanding: string;
  action?: {
    request: string | null;
    reasoning: string;
    type?: string;
    command?: string;
  };
}

/**
 * GeminiObserverService - 画面観察専用サービス
 * 
 * 役割:
 * - 8秒ごとに画面をキャプチャして分析
 * - ユーザーの行動を理解し、次の行動を予測
 * - 必要なアクションを提案（実行はしない）
 * 
 * アクション実行はClaudeExecutorServiceが担当
 */
export class GeminiObserverService {
  private proxyUrl: string;
  private previousObservation: PreviousObservation | null = null;
  private previousActionResult: any = null;
  private currentUnderstanding: string = "ユーザーの行動パターンを学習中です。";
  private database: DatabaseInterface;
  private userProfile: any = null;
  private modelName: string = 'gemini-2.0-flash'; // デフォルトモデル
  // 観察専用サービスのため、実行関連のサービスは削除
  
  // Claude SDKとの協調動作のためのpendingAction管理
  private pendingAction: {
    request: string;
    sentAt: number;
    status: 'pending' | 'completed' | 'failed';
  } | null = null;

  constructor(apiKey: string, database: DatabaseInterface) {
    // APIキーは使用しない（プロキシサーバー側で管理）
    this.proxyUrl = 'https://anicca-proxy-ten.vercel.app/api/gemini';
    this.database = database;
    
    // 起動時に最新の理解を復元
    this.restoreLatestUnderstanding();
    
    // 起動時にUser Profileを読み込む
    this.loadUserProfile();
    
    // モデル設定を読み込む
    this.loadModelSetting();
    
    console.log('🌐 Using proxy server for Gemini API');
  }

  // 観察専用サービスのため、実行関連のメソッドは削除

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

  private async loadModelSetting(): Promise<void> {
    try {
      // SQLiteDatabaseのインスタンスかチェック
      if ('getSetting' in this.database) {
        const savedModel = await (this.database as any).getSetting('geminiModel');
        if (savedModel) {
          this.modelName = savedModel;
          console.log('🤖 Gemini model loaded from settings:', this.modelName);
        } else {
          console.log('🤖 Using default Gemini model:', this.modelName);
          // デフォルトモデルを保存
          await (this.database as any).setSetting('geminiModel', this.modelName);
        }
      }
    } catch (error) {
      console.error('❌ Error loading model setting:', error);
    }
  }

  async analyzeScreen(frame: ScreenFrame, language: 'ja' | 'en' = 'ja'): Promise<CommentaryResponse> {
    try {
      // 最新のUser Profileを読み込む（ユーザーが更新した可能性があるため）
      await this.loadUserProfile();
      
      // 画像を圧縮（413エラー対策）
      let imageBuffer = frame.imageData;
      let imageBase64: string;
      let mimeType = 'image/png';
      
      // 元の画像サイズをチェック
      const originalSizeKB = imageBuffer.length / 1024;
      const originalSizeMB = originalSizeKB / 1024;
      
      // 3.0MB以上の場合は圧縮（Base64エンコードで約1.33倍になるため）
      if (originalSizeMB > 3.0) {
        console.log(`🗜️ Compressing large image (${originalSizeMB.toFixed(2)}MB > 3.0MB)...`);
        
        try {
          let quality = 95;
          let compressedBuffer = imageBuffer;
          let previousSizeMB = originalSizeMB;
          
          // 段階的に品質を下げながら圧縮
          const qualityLevels = [95, 90, 85, 80];
          
          for (const currentQuality of qualityLevels) {
            quality = currentQuality;
            console.log(`🗜️ Trying JPEG compression at ${quality}% quality...`);
            
            compressedBuffer = await sharp(imageBuffer)
              .jpeg({ quality })
              .toBuffer();
            
            const compressedSizeMB = compressedBuffer.length / 1024 / 1024;
            const base64SizeMB = (compressedBuffer.length * 1.33) / 1024 / 1024; // 推定Base64サイズ
            const compressionRatio = ((previousSizeMB - compressedSizeMB) / previousSizeMB * 100).toFixed(1);
            
            console.log(`📦 Compressed: ${previousSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB (${compressionRatio}% reduction)`);
            console.log(`📈 Estimated Base64 size: ${base64SizeMB.toFixed(2)}MB`);
            
            imageBuffer = compressedBuffer;
            mimeType = 'image/jpeg';
            previousSizeMB = compressedSizeMB;
            
            // Base64エンコード後が4.0MB未満になりそうなら終了
            if (base64SizeMB < 4.0) {
              console.log(`✅ Target size achieved with ${quality}% quality`);
              break;
            }
          }
          
          // それでも大きい場合は解像度を制限（最終手段）
          const finalCompressedSizeMB = imageBuffer.length / 1024 / 1024;
          const finalBase64SizeMB = (imageBuffer.length * 1.33) / 1024 / 1024;
          
          if (finalBase64SizeMB > 4.0) {
            console.log(`⚠️ Still too large after quality reduction. Applying resolution limit...`);
            
            const resizedBuffer = await sharp(imageBuffer)
              .resize({ width: 2560, withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();
            
            const resizedSizeMB = resizedBuffer.length / 1024 / 1024;
            const resizedBase64SizeMB = (resizedBuffer.length * 1.33) / 1024 / 1024;
            
            console.log(`🖼️ Resolution limited: ${finalCompressedSizeMB.toFixed(2)}MB → ${resizedSizeMB.toFixed(2)}MB`);
            console.log(`📈 Final estimated Base64 size: ${resizedBase64SizeMB.toFixed(2)}MB`);
            
            imageBuffer = resizedBuffer;
          }
        } catch (error) {
          console.error('❌ Error compressing image:', error);
          console.log('⚠️ Falling back to original image');
          // 圧縮に失敗した場合は元の画像を使用
        }
      }
      
      // Base64エンコード
      imageBase64 = imageBuffer.toString('base64');
      
      // 最終的な画像サイズをログ出力
      const finalSizeKB = imageBase64.length / 1024;
      const finalSizeMB = finalSizeKB / 1024;
      
      console.log(`📊 Base64 encoded size: ${finalSizeKB.toFixed(0)}KB (${finalSizeMB.toFixed(2)}MB)`);
      
      // 4.5MBに近い場合は警告
      if (finalSizeMB > 4.0) {
        console.warn(`⚠️ Large base64 size: ${finalSizeKB.toFixed(0)}KB - approaching 4.5MB limit`);
      }
      
      const prompt = this.buildPrompt(language);
      
      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      };

      // プロキシサーバー経由でリクエスト
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: `/models/${this.modelName}:generateContent`,
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
        // 413エラーの場合はユーザーフレンドリーなメッセージ
        if (response.status === 413) {
          throw new Error(`画像サイズが大きすぎます。高解像度ディスプレイをお使いの場合は、画面解像度を下げてみてください。`);
        }
        throw new Error(errorMessage);
      }

      let result: any;
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
        prediction: {
          action: "",
          reasoning: ""
        },
        timestamp: Date.now()
      };
      
      // ユーザー理解を更新
      this.currentUnderstanding = commentary.current_understanding;
      
      // アクションの提案があればログに記録するのみ（実行はClaudeExecutorServiceが担当）
      if (commentary.action) {
        console.log(`🎯 Action suggested: ${commentary.action.type} - ${commentary.action.reasoning}`);
        if (commentary.action.command) {
          console.log(`📝 Command: ${commentary.action.command}`);
        }
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

  private buildPrompt(language: 'ja' | 'en' = 'ja'): string {
    const previousObservationText = this.previousObservation 
      ? JSON.stringify(this.previousObservation, null, 2)
      : language === 'en' 
        ? "No previous observation results as this is the first observation."
        : "初回観察のため、直前の観察結果はありません。";


    const previousActionResultText = this.previousActionResult
      ? this.formatActionResult(this.previousActionResult, language)
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
  
  
  "current_understanding": "Understanding of user's behavior patterns, personality, preferences, psychological state, desires (add/update new insights)"
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

## Available Tools
- web_search_exa: Advanced web search functionality

【IMPORTANT】During the testing phase, use this actively.
Automatically execute searches when:
- User appears to be searching for information
- Error messages are displayed (search for solutions)
- Technical content is displayed (search for supplementary information)
- You determine this information would help the user

When search is needed, include in response:
{
  "needs_search": true,
  "command": "short English keywords (max 5 words, e.g., 'Gemini API timeout fix')",
  "search_reason": "why this information would help the user"
}

IMPORTANT: Search queries must be:
- In English only
- Maximum 5 words
- Simple keywords, not full sentences
- Technical terms preferred

Good examples:
- "Gemini API 400 error"
- "Vercel timeout solution"
- "TypeScript strict mode"
- "npm install error fix"

Bad examples:
- "How can I fix the Gemini API timeout error in my Vercel deployment?"
- Long Japanese sentences
- Questions with special characters

Your mission is to completely understand and guide the user. Thoroughly analyze the psychology behind each behavior and provide frank commentary and analysis.`;
    } else {
      return `あなたは「anicca」という名前のAGIエージェントです。ユーザーの画面を約8秒間隔で観察し、理解し、導くために行動する存在です。

## 基本設定
- 観察間隔: 約8秒ごと（時間感覚を持ち、連続した行動を把握）
- 口調: フランクで親しみやすい友達のような感じ
- あなたは相棒のClaudeに指示して、ユーザーのためバックグラウンドで自律的な行動ができます

【分析の重点】
1. 変化の検出：前回と今回の画面を比較し、何が変わったか詳細に把握
2. 継続性の理解：同じ行動をどれくらい続けているか（例：YouTubeを今見始めたのか、30秒見続けているのか）
3. 心理洞察：なぜその行動をしたのか、なぜ続けているのかを深く推測

【直前の観察結果】
${previousObservationText}

【前回の行動結果】
${previousActionResultText}
${this.previousActionResult?.error === 'Another action is being executed' ? '⚠️ 注意: 前回のアクションはまだ実行中です。新しいアクションは提案しないでください。' : ''}
${this.previousActionResult?.skipped ? '⚠️ 注意: 前回のアクションはスキップされました。実行が落ち着くまで待機してください。' : ''}

【現在実行中のタスク】
${this.pendingAction && this.pendingAction.status === 'pending' ? 
  `⚠️ 現在Claudeに依頼中のタスク:
  "${this.pendingAction.request}"
  ステータス: 実行中
  
  重要: 同じ内容を再度依頼しないでください。結果を待ってください。` : 
  'なし（新しいアクションを提案可能）'}

【ユーザー理解の現状】
${this.currentUnderstanding}

【ユーザープロファイル（長期的な参考情報）】
${this.formatUserProfile('ja')}

【行動の基本方針】
基本は静観（action: null）してください。
本当に困っている時や、明らかに助けが必要な時だけ行動してください。

以下のJSON形式で回答してください：

\`\`\`json
{
  "commentary": "フランクな実況＋考察（なぜその行動をしたかの推測を含む）",
  "websiteName": "サイト名",
  "actionCategory": "具体的なカテゴリ",
  
  "current_understanding": "【重要】前回の理解「${this.currentUnderstanding.replace(/\n/g, ' ').replace(/"/g, '\\"')}」を基に更新。200文字以内でユーザーの本質を圧縮。行動パターン、価値観、目標の核心を記述",
  
  "action": {
    "request": "Claudeへの具体的な依頼（自然な日本語で）",
    "reasoning": "なぜこの行動を取るべきか"
  } または {
    "request": null,
    "reasoning": "なぜ今は静観すべきか（必須）"
  }
}
\`\`\`

## Claudeへの依頼について

Claudeは非常に有能なコーディングエージェントです。プログラミング、検索、ファイル作成、コマンド実行など、PC上で可能なあらゆる作業を実行できます。

自由に創造的な指示を出してください。必ず以下を含めてください：
- 何をしてほしいか（具体的なタスク）
- 結果をどうユーザーに届けるか（通知、自動起動、表示など）

### 依頼の例

**エラーが表示されている時：**
"画面に表示されているTypeScriptのエラーについて調査して、解決方法を分かりやすくまとめて通知で教えて。"

制限はありません。ユーザーの状況を見て、最も役立つ支援を考えて指示してください。

### 重要な制約事項

**絶対にしてはいけないこと：**
- 画面に見えるディレクトリ名やファイル名を指定して「〇〇に作成して」と言わない
- ユーザーの既存のプロジェクトやファイルを変更しようとしない
- 「anicca-claude-sdk」「Downloads」「Desktop」など具体的な場所を指定しない

**理由：**
すべての作業は独立した安全な環境（/tmp/anicca-agent-workspace/）で行われます。
Claudeは適切な場所を自動的に選んで作業します。

**良い例：**
✅ "簡単なゲームを作って"
✅ "Electronアプリのサンプルを作成して"
✅ "便利なスクリプトを生成して"

**悪い例：**
❌ "anicca-claude-sdkディレクトリに作成して"
❌ "デスクトップにファイルを保存して"
❌ "現在のプロジェクトを修正して"

【行動決定の心得】
あなたは今この瞬間の画面を見て、ユーザーの現在の状況を理解しています。
プロファイルの長期目標より、今画面で起きていることへの対応を最優先してください。


**重要な制約事項：**
- 前回のアクションがまだ実行中の場合は、必ず action: null を返して静観する
- アクションがスキップされた場合（execution.skipped: true）も、action: null を返す
- 同じアクションを連続で提案しない（前回と同じ内容なら待機）
- Claudeは複雑なタスクには時間がかかることを理解し、辛抱強く待つ

前回からの変化を踏まえて、どうすればこの人を良い方向に導けるか深く考えてください。`;
    }
  }

  /**
   * アクション結果を読みやすい形式にフォーマット
   */
  private formatActionResult(result: any, language: 'ja' | 'en'): string {
    if (!result) return '';

    let formatted = '';
    
    if (language === 'ja') {
      if (result.success) {
        formatted = `成功:\n${result.result}`;
        if (result.generatedFiles?.length > 0) {
          formatted += `\n\n生成されたファイル: ${result.generatedFiles.join(', ')}`;
        }
      } else {
        formatted = `失敗: ${result.error}`;
        if (result.error === 'Another action is being executed') {
          formatted = '実行中: 前のアクションがまだ処理中です';
        } else if (result.subtype === 'error_max_turns') {
          formatted = 'エラー: タスクが複雑すぎて完了できませんでした（最大ターン数到達）';
        }
      }
    } else {
      if (result.success) {
        formatted = `Success:\n${result.result}`;
        if (result.generatedFiles?.length > 0) {
          formatted += `\n\nGenerated files: ${result.generatedFiles.join(', ')}`;
        }
      } else {
        formatted = `Failed: ${result.error}`;
        if (result.error === 'Another action is being executed') {
          formatted = 'Executing: Previous action is still being processed';
        } else if (result.subtype === 'error_max_turns') {
          formatted = 'Error: Task was too complex to complete (max turns reached)';
        }
      }
    }
    
    return formatted;
  }

  // デバッグ用：現在の状態を取得
  getCurrentState() {
    return {
      previousObservation: this.previousObservation,
      currentUnderstanding: this.currentUnderstanding,
      modelName: this.modelName
    };
  }

  // 状態をリセット
  reset() {
    this.previousObservation = null;
    this.currentUnderstanding = "ユーザーの行動パターンを学習中です。";
  }

  // モデルを切り替え
  async setModel(modelName: string): Promise<void> {
    this.modelName = modelName;
    if ('setSetting' in this.database) {
      await (this.database as any).setSetting('geminiModel', modelName);
    }
    console.log('🤖 Gemini model switched to:', modelName);
  }

  // 実行結果を設定
  setLastActionResult(result: any) {
    this.previousActionResult = {
      ...this.previousActionResult,
      execution: result,
      executedAt: Date.now()
    };
    
    // pendingActionのステータスを更新
    if (this.pendingAction && this.pendingAction.status === 'pending') {
      if (result.success) {
        this.pendingAction.status = 'completed';
        console.log('✅ Pending action completed:', this.pendingAction.request.substring(0, 50) + '...');
      } else if (result.error) {
        this.pendingAction.status = 'failed';
        console.log('❌ Pending action failed:', result.error);
      }
    }
  }
  
  // アクションを送信する際に呼ばれる
  setPendingAction(action: any) {
    if (action && action.request) {
      this.pendingAction = {
        request: action.request,
        sentAt: Date.now(),
        status: 'pending'
      };
      console.log('📋 New pending action set:', action.request.substring(0, 50) + '...');
    }
  }
  
  // pendingActionの状態を取得
  getPendingAction() {
    return this.pendingAction;
  }
  
  // pendingActionをクリア
  clearPendingAction() {
    this.pendingAction = null;
    console.log('🧹 Pending action cleared');
  }

  // 使用していないメソッドを削除（将来的に必要になったら再実装）
  /*
  private createAniccaStyleSummary(result: any): string {
    try {
      const title = result.title || '';
      const url = result.url || '';
      const snippet = (result.text || result.snippet || '').substring(0, 500);
      
      // エラーチェック
      if (!title && !snippet) {
        return '';
      }
      
      // スニペットから重要情報を抽出
      let extractedInfo = this.extractImportantInfo(snippet);
      
      // ANICCAらしいフランクな要約を生成
      let summary = '';
      
      // エラー解決系
      if (title.toLowerCase().includes('error') || title.includes('エラー') || 
          title.includes('解決') || title.includes('fix')) {
        if (extractedInfo.solution) {
          summary = `エラー解決法発見！${extractedInfo.solution}`;
        } else {
          summary = `${title.split('-')[0].trim()}の解決法見つけたよ！`;
        }
      }
      // チュートリアル・ガイド系
      else if (title.includes('How to') || title.includes('方法') || 
               title.includes('Guide') || title.includes('チュートリアル')) {
        if (extractedInfo.service) {
          summary = `${extractedInfo.service}使えば解決！`;
          if (extractedInfo.numbers) {
            summary += `${extractedInfo.numbers}が必要だって`;
          }
        } else {
          summary = `手順発見！${extractedInfo.mainPoint || title.substring(0, 30)}`;
        }
      }
      // アイコン・画像系
      else if (title.toLowerCase().includes('icon') || snippet.toLowerCase().includes('icon')) {
        if (extractedInfo.service) {
          summary = `アイコン作成は${extractedInfo.service}で！`;
          if (extractedInfo.numbers) {
            summary += `${extractedInfo.numbers}のPNGを用意してね`;
          }
        } else {
          summary = `アイコン設定の方法見つけたよ！`;
        }
      }
      // 公式ドキュメント系
      else if (url.includes('docs') || title.includes('Documentation')) {
        if (extractedInfo.command) {
          summary = `公式の方法：${extractedInfo.command}`;
        } else {
          summary = `公式ドキュメント発見！${extractedInfo.mainPoint || ''}`;
        }
      }
      // その他
      else {
        if (extractedInfo.mainPoint) {
          summary = extractedInfo.mainPoint;
        } else {
          summary = `${title.substring(0, 40)}が参考になるかも`;
        }
      }
      
      // 60文字以内に収める
      if (summary.length > 60) {
        summary = summary.substring(0, 57) + '...';
      }
      
      console.log(`🎯 Generated ANICCA-style summary: ${summary}`);
      return summary;
      
    } catch (error) {
      console.error('❌ Error creating summary:', error);
      return '';
    }
  }
  
  // スニペットから重要情報を抽出
  private extractImportantInfo(snippet: string): {
    service?: string;
    numbers?: string;
    command?: string;
    solution?: string;
    mainPoint?: string;
  } {
    const info: any = {};
    
    // サービス名を抽出（大文字で始まる固有名詞）
    const serviceMatch = snippet.match(/([A-Z][A-Z\s]+(?:ICONS?|TOOLS?|SERVICE|CONVERTER))/i);
    if (serviceMatch) {
      info.service = serviceMatch[1].trim();
    }
    
    // 重要な数値を抽出（解像度、サイズなど）
    const numberMatch = snippet.match(/(\d+x\d+|\d+[MBGBKBmbgbkb]+)/i);
    if (numberMatch) {
      info.numbers = numberMatch[1];
    }
    
    // コマンドを抽出
    const commandMatch = snippet.match(/(?:npm|yarn|pip|brew|apt|git)\s+[\w\-]+(?:\s+[\w\-]+)?/i);
    if (commandMatch) {
      info.command = commandMatch[0];
    }
    
    // 解決策のキーワードを探す
    const solutionMatch = snippet.match(/(?:解決策は|solution is|fix is|方法は)[\s:：]*(.*?)(?:[。\.]|$)/i);
    if (solutionMatch) {
      info.solution = solutionMatch[1].trim().substring(0, 40);
    }
    
    // メインポイントを抽出（最初の重要そうな文）
    const sentences = snippet.split(/[。\.\n]/);
    for (const sentence of sentences) {
      if (sentence.length > 20 && sentence.length < 60) {
        // 具体的な内容を含む文を優先
        if (sentence.match(/(?:する|できる|必要|使う|need|can|use|create)/i)) {
          info.mainPoint = sentence.trim();
          break;
        }
      }
    }
    
    return info;
  }
  */

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
        predictionData: "{}",
        verificationData: "{}",
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

      let result: any;
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