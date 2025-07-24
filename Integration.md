# 定期タスク統合プロンプト設計

## 統合プロンプトの全体像

### analyzeAndAssignTasksの新しいプロンプト

```javascript
const prompt = `
${scheduledTaskPrompt}

以下のタスクを分析して、適切に処理してください。

【タスク】
${taskInfo.task}

【Worker状況】
${JSON.stringify(taskInfo.workers, null, 2)}

【処理パターン】

1. 定期タスク登録（「毎日」「毎週」「毎朝」「毎月」「〜ごとに」「毎時」を含む場合）：
   - タスクから頻度情報を抽出し、実際のタスク内容と分離
   - 例：「毎日9時にSlackチェックして」→ 頻度:"daily", 時刻:"09:00", タスク:"Slackチェック"
   - 例：「5分ごとに聖書の一節を送信」→ 頻度:"every_Xm", 間隔:5, タスク:"聖書の一節を送信"
   - idleのWorkerに割り当て
   - Supabaseに直接登録（以下のコードを実行）：
     await this.supabase.from('scheduled_tasks').insert({
       user_id: '${taskInfo.userId || process.env.CURRENT_USER_ID}',
       instruction: [頻度を除いたタスク内容],
       frequency: [daily/weekly/hourly/every_Xm/every_Xh/monthly],
       time: [HH:MM形式、該当する場合],
       interval_minutes: [分単位の間隔、該当する場合],
       interval_hours: [時間単位の間隔、該当する場合],
       assigned_to: [割り当てたWorker名],
       task_type: 'post_message',
       next_run: [計算した次回実行時刻のISO文字列]
     })
   - CLAUDE.mdに記録：Writeツールで「Worker1: 毎日9時 - Slackチェック」
   - 応答タイプ: "scheduled_register"

2. 定期タスク削除（「定期タスクやめて」「〜の定期タスク削除」を含む場合）：
   - 削除対象を特定（「さっきの」なら最新、内容で検索）
   - Supabaseから該当タスクを取得：
     const { data } = await this.supabase.from('scheduled_tasks')
       .select('*').eq('user_id', '${taskInfo.userId}').eq('status', 'active')
   - 該当タスクを無効化：
     await this.supabase.from('scheduled_tasks')
       .update({ status: 'inactive' }).eq('id', [特定したID])
   - CLAUDE.mdから削除：Editツールで該当行を削除
   - 応答タイプ: "scheduled_delete"

3. 定期タスク確認（「定期タスクある？」「どんな定期タスク」を含む場合）：
   - CLAUDE.mdを読んで一覧を返す
   - 応答タイプ: "scheduled_list"

4. 通常タスク（上記以外）：
   - busyのWorkerは避けて、idleのWorkerに割り当て
   - 複数の異なるタスクは別々のWorkerに
   - 応答タイプ: "normal"

【応答形式】
{
  "type": "scheduled_register" | "scheduled_delete" | "scheduled_list" | "normal",
  "assignments": [
    { "worker": "Worker名", "task": "タスク内容（頻度情報を除く）" }
  ],
  "message": "ユーザーへの応答（例：定期タスクを登録しました）"
}

${desktopAddition}
`;
```

### 修正内容

1. **executeTaskメソッド内**（約210-220行目）
   - `checkScheduledTaskDeletion`の呼び出しを削除
   - `checkAndRegisterScheduledTask`の呼び出しを削除
   - `analyzeAndAssignTasks`の結果で全て処理

2. **削除するメソッド**
   - `checkScheduledTaskDeletion`（1059-1116行）
   - `deleteScheduledTask`（1121-1183行）
   - `checkAndRegisterScheduledTask`（754-855行）
   - `calculateInitialNextRun`（860-892行）
   - `notifyScheduledTaskRegistered`（897-938行）

3. **analyzeAndAssignTasksの処理追加**
   ```javascript
   const result = await this.analyzeAndAssignTasks({...});
   
   if (result.type === 'scheduled_register') {
     // 登録済みなので通常タスクは実行しない
     return { success: true, output: result.message };
   } else if (result.type === 'scheduled_delete') {
     // 削除済み
     return { success: true, output: result.message };
   }
   // 通常タスクは既存通り処理
   ```

これで全てが1つのプロンプトで完結します。