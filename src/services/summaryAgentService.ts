import { Notification } from 'electron';
import path from 'path';
import { app } from 'electron';

export class SummaryAgentService {
  private proxyUrl: string;
  private modelName: string = 'gemini-2.0-flash';

  constructor() {
    this.proxyUrl = 'https://anicca-proxy-ten.vercel.app/api/gemini';
  }

  /**
   * 検索結果を要約してユーザーに通知
   * @param searchResults Exaからの検索結果
   * @param searchQuery 元の検索クエリ
   * @returns 生成した通知メッセージ
   */
  async summarizeAndNotify(searchResults: any[], searchQuery: string): Promise<string> {
    try {
      // 検索結果がない場合は何もしない
      if (!searchResults || searchResults.length === 0) {
        console.log('📭 No search results to summarize');
        return '';
      }

      // 複数の検索結果からテキストを収集
      const contentTexts: string[] = [];
      for (let i = 0; i < Math.min(3, searchResults.length); i++) {
        const result = searchResults[i];
        const text = (result as any).text || result.snippet || '';
        if (text) {
          contentTexts.push(`【結果${i + 1}】${result.title || ''}\n${text}`);
        }
      }
      
      if (contentTexts.length === 0) {
        console.log('📭 No text content in search results');
        return '';
      }

      // 要約プロンプト（複数結果対応）
      const prompt = this.buildSummaryPrompt(contentTexts.join('\n\n'), searchQuery);

      // Gemini APIで要約
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: `/models/${this.modelName}:generateContent`,
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
        throw new Error(`Failed to summarize: ${response.status}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error('No summary generated');
      }

      // JSONパース
      const jsonText = text.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
      const summary = JSON.parse(jsonText);

      // 通知を表示
      if (summary.notification) {
        this.showNotification(summary.notification);
        console.log('🔔 Summary notification shown:', summary.notification);
      }

      return summary.notification || '';

    } catch (error) {
      console.error('❌ Error in summary agent:', error);
      return '';
    }
  }

  private buildSummaryPrompt(contentText: string, searchQuery: string): string {
    return `あなたは要約エージェントです。ユーザーの検索結果を要約して、価値ある情報を届ける役割です。

【検索クエリ】
${searchQuery}

【検索結果の内容】
${contentText.substring(0, 3000)} // 複数結果対応で最大3000文字

【タスク】
上記の検索結果（最大3件）から、ユーザーにとって最も価値のある情報を統合・抽出し、60文字以内で要約してください。
複数の結果がある場合は、最も具体的で実用的な情報を優先してください。

【要約の原則】
- その場で価値が完結する具体的な情報のみ
- 追加で調べる必要がない内容
- 今すぐ役立つ実用的な情報

【良い要約の例】
- "Cursorは学生なら完全無料！GitHub Student Packに含まれてるよ"
- "そのエラー、awaitを付け忘れてるのが原因だよ"
- "Ponanzaは開発リソース不足でOSSに追い抜かれたんだって"

【悪い要約の例】
- "興味深い情報が見つかったよ" → 具体性なし
- "詳しくはサイトを確認して" → 追加アクション必要
- "〜について書かれています" → 要約になっていない

以下のJSON形式で回答してください：

\`\`\`json
{
  "notification": "60文字以内の要約（本当に価値がある場合のみ。なければ空文字列）"
}
\`\`\``;
  }

  private showNotification(message: string) {
    if (!Notification.isSupported()) {
      console.error('❌ Notifications are not supported on this system');
      return;
    }
    
    const iconPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'assets', 'icon.png')
      : path.join(__dirname, '../../assets/icon.png');
    
    const notification = new Notification({
      title: '🤖 ANICCA',
      body: message,
      icon: iconPath,
      silent: false,
      timeoutType: 'default'
    });
    
    notification.on('click', () => {
      console.log('🔔 Summary notification clicked');
    });
    
    notification.show();
  }
}