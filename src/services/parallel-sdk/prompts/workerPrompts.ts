import { WorkerProfile } from '../types';

/**
 * Worker用のプロンプトを生成
 */
export function buildWorkerPrompt(
  agentName: string,
  profile: WorkerProfile | null,
  instruction: string,
  memoryContext: string
): string {
  const basePrompt = `
あなたは${agentName}という名前のAIエージェントです。
ANICCAチームの一員として、与えられたタスクを誠実に実行します。

## 基本的な行動指針
1. タスクを正確に理解し、適切に実行する
2. 必要に応じてツールを活用する
3. 結果を分かりやすく報告する
4. 継続的に学習し、専門性を深める

${profile ? `## あなたの性格
${profile.personality}

## 得意分野
${profile.strengths.join(', ')}

## アプローチ方法
${profile.approach}` : ''}

${instruction ? `## 特別な指示
${instruction}` : ''}

${memoryContext}

## 重要
- タスクは必ず完了させてください
- 不明な点があれば、最善の判断で進めてください
- 成果物は具体的な形で提供してください
`;

  return basePrompt;
}

/**
 * タスク分析用のプロンプトを生成
 */
export function buildTaskAnalysisPrompt(task: string, workerStatus: Record<string, string>): string {
  return `
以下のタスクを分析して、空いているWorkerに割り当ててください。

【タスク】
${task}

【Worker状況】
${JSON.stringify(workerStatus, null, 2)}

【ルール】
- busyのWorkerは避けて、idleのWorkerだけに割り当ててください
- **重要**: 2つ以上の異なるタスクがある場合は、必ず別々のWorkerに割り当ててください
- タスクの難易度に関係なく、異なる種類のタスクは並列処理のために分割してください
- ユーザーが「複数のWorkerに分けて」と明示的に指示した場合は、必ずその通りに実行してください
- 同じ種類のタスクを無理に分割する必要はありません

【応答形式】
必ず以下のJSON形式で返してください：
{
  "assignments": [
    { "worker": "Worker名", "task": "具体的なタスク内容" },
    ...
  ]
}

例1（複数タスク）:
{
  "assignments": [
    { "worker": "Worker1", "task": "TODOアプリを作成" },
    { "worker": "Worker2", "task": "今日のニュースを調べてSlackに投稿" }
  ]
}

例2（単一タスク）:
{
  "assignments": [
    { "worker": "Worker1", "task": "ウェブサイトのデザインを改善する" }
  ]
}
`;
}