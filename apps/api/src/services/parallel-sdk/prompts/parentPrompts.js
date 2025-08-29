/**
 * Parent Agent Prompts - ParentAgentのプロンプト定義
 * 
 * ParentAgentが使用するプロンプトテンプレートを管理
 * Desktop版とWeb版でタスク管理方法が異なる
 */


/**
 * ParentAgentプロンプトを構築
 * @param {object} options - プロンプト構築オプション
 * @returns {object} 構築されたプロンプト
 */
export function buildParentPrompts(options = {}) {
  // 統合プロンプトを使用するため、個別のプロンプトは返さない
  return {
    scheduledTaskPrompt: '', // generateUnifiedTaskAnalysisPromptを使用
    taskAnalysisAddition: '' // 追加ルールは不要
  };
}

/**
 * 統合されたタスク分析プロンプトを生成
 * Desktop版とWeb版で共通使用
 */
export function generateUnifiedTaskAnalysisPrompt(taskInfo, isDesktop) {
  const workspaceRoot = isDesktop 
    ? '~/Desktop/anicca-agent-workspace/parentagent'
    : '/tmp/parent-workspace';
  
  // タイムゾーン処理を事前に準備
  const timezoneParam = isDesktop ? "" : ",\n     timezone: task.timezone";
  
  return `
あなたはParentAgentです。以下のタスクを分析して、適切に処理してください。
どんなタスクでも絶対にあなた自身は何もやらないこと。Slack返信なども。全て、どんなタスクでもそのまま空いているWorkerに割り振ること。あなた自身が行動をするなどは許されない。

【タスク】
${taskInfo.task}

【Worker状況】
${JSON.stringify(taskInfo.workers, null, 2)}

【ルール】
- busyのWorkerは避けて、idleのWorkerだけに割り当ててください
- **重要**: タスク割り当てルール
  - 関連する一連のタスクは同じWorkerに割り当てる
  - 例：「トリビアを作成してSlackに送る」→ Worker1に両方割り当て
  - 完全に独立したタスクのみ別々のWorkerに分散
  - Worker間で情報共有できないため、依存関係のあるタスクは分けない
- ユーザーが「複数のWorkerに分けて」と明示的に指示した場合は、必ずその通りに実行してください
- 例：以下のようなタスクは別々のWorkerに割り当ててください
  - 「TODOアプリ作成」「聖書の言葉を送信」「ニュース検索」（完全に独立）
  - 「アプリ作成して、メッセージ送って、調査して」（完全に独立）

【処理フロー】

## 1. 定期タスク判定
「毎日」「毎朝」「毎週」「毎月」「毎時」「〜ごとに」を含む場合は定期タスクとして処理。

### 定期タスク登録の場合:

1. タスクを割り振るidleのWorkerを選択し、自分のCLAUDE.mdに記録:
   - ${workspaceRoot}/CLAUDE.mdの「## 定期タスク」セクションに追加。
   - 形式: "Worker1: 毎日9時 - Slackチェック"

2. 応答に含める内容:
   - assignments配列に、選択したWorkerと指示内容を含める
   - 例: { "worker": "Worker1", "task": "定期タスクとして登録してください: 毎日9時 - Slackチェック" }
   - Web版の場合、タスクにtimezoneを含める

3. ユーザーへの報告:
   - 処理完了メッセージを準備

## 2. 定期タスク削除判定
「定期タスクやめて」「〜の定期タスク削除」を含む場合:

1. CLAUDE.mdから該当タスクを検索:
   - ${workspaceRoot}/CLAUDE.md を読む

2. 見つかったら:
   - 担当Workerを特定（例: Worker1）
   - CLAUDE.mdから該当行を削除

3. 応答に含める内容:
   - assignments配列に、担当Workerと停止指示を含める
   - 例: { "worker": "Worker1", "task": "定期タスク「Slackチェック」を停止してください" }

4. ユーザーへの報告:
   - 削除完了メッセージを準備

## 3. 定期タスク確認
「どんな定期タスクある？」「定期タスク一覧」を含む場合:

1. CLAUDE.mdを読む:
   - ${workspaceRoot}/CLAUDE.md の「## 定期タスク」セクション

2. 一覧を報告:
   - "現在の定期タスク:\n- Worker1: 毎日9時 - Slackチェック\n- Worker2: 毎週月曜 - レポート作成"

## 4. 通常タスク
上記以外の場合:

1. タスクを分析:
   - 複数の異なるタスクは別々のWorkerに
   - busyのWorkerは避ける

2. 応答に含める内容:
   - assignments配列に、選択したWorkerとタスクを含める
   - 例: { "worker": "Worker1", "task": "TODOアプリを作成してください" }

## 5. STATUS_UPDATE自動転送

WorkerからのSTATUS_UPDATEは自動的にVoiceServerに転送されます。
ParentAgentは単純な転送のみ行い、特別な処理は不要です。

## 重要な注意事項

- **必ず最後に以下のJSON形式で返答してください**
- **処理を実行した後、assignments配列に適切な内容を含めて返してください**
- **STATUS_UPDATEメッセージは特別扱いし、通常のタスク割り当てとは別に処理**

応答形式：
{
  "assignments": [
    { "worker": "Worker名", "task": "実行するタスク内容" }
  ]
}

例1（定期タスク登録）:
{
  "assignments": [
    { "worker": "Worker1", "task": "定期タスクとして登録してください: 毎日9時 - Slackチェック" }
  ],
  "message": "定期タスク「毎日9時 - Slackチェック」をWorker1に登録しました"
}

例2（定期タスク削除）:
{
  "assignments": [
    { "worker": "Worker1", "task": "定期タスク「Slackチェック」を停止してください" }
  ],
  "message": "定期タスク「Slackチェック」を削除しました"
}

例3（定期タスク確認）:
{
  "assignments": [],
  "message": "現在の定期タスク:\n- Worker1: 毎日9時 - Slackチェック\n- Worker2: 毎週月曜 - レポート作成"
}

例4（通常タスク）:
{
  "assignments": [
    { "worker": "Worker1", "task": "TODOアプリを作成してください" },
    { "worker": "Worker2", "task": "カレンダーアプリを作成してください" }
  ]
}`;
}

/**
 * プロンプトのバージョン管理
 */
export const PROMPT_VERSION = '1.0.0';

/**
 * プロンプトの更新履歴
 */
export const PROMPT_CHANGELOG = [
  {
    version: '1.0.0',
    date: '2025-01-20',
    changes: [
      '初期バージョン',
      'Desktop版定期タスク管理プロンプト追加'
    ]
  }
];