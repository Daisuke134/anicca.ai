# Commander Agent 100% Nudge Generation 仕様書

## 概要

Commander Agentが必要なスロット数分のNudgeを100%生成することを強制する。

---

## 問題（As-Is）

### 現象

| ユーザー | 結果 | 問題 |
|---------|------|------|
| User A | 0 nudges / 0 slots | Agentが何も生成しない |
| User B | 3 enabled / 6 slots | 必要数の半分しか生成しない |

### 原因

| 問題箇所 | ファイル:行 | 詳細 |
|---------|------------|------|
| スキーマに長さ制約なし | `commander.js:48` | `appNudges: z.array(AppNudgeSchema)` が空配列を許可 |
| プロンプトは指示のみ | `commander.js:149` | 「全行に対して生成せよ」と言うが強制されない |
| 空配列時に全disabled | `commander.js:382-396` | Agent出力が空だと全スロットがdisabledフォールバック |

### 問題のコード

```javascript
// commander.js:48 - スキーマ定義
const AgentRawOutputSchema = z.object({
  rootCauseHypothesis: z.string(),
  overallStrategy: z.string(),
  frequencyReasoning: z.string(),
  appNudges: z.array(AppNudgeSchema),  // ❌ 長さ制約なし
  tiktokPosts: z.array(TiktokPostSchema).length(2),  // ✅ 2件強制
  xPosts: z.array(XPostSchema).length(2),  // ✅ 2件強制
});
```

```javascript
// commander.js:382-396 - フォールバック処理
const filledNudges = slotTable.map(slot => {
  const nudge = nudgeLookup.get(slot.slotIndex);
  if (nudge) {
    return { ...nudge };
  }
  // Missing slot: fill with disabled rule-based fallback
  return {
    slotIndex: slot.slotIndex,
    hook: 'Keep moving forward',
    content: 'Start with a small step.',
    tone: 'gentle',
    enabled: false,  // ❌ デフォルトで disabled
    reasoning: 'LLM did not generate content for this slot; auto-disabled.',
  };
});
```

---

## 解決策（To-Be）

### 設計原則

| 責務 | 担当 | 変更可否 |
|------|------|---------|
| **時間スロット決定** | システム（scheduleMap + trimSlots） | Agent変更不可 |
| **コンテンツ決定** | Commander Agent | 100%生成必須 |
| **ON/OFF決定** | Commander Agent | `enabled: true/false`で制御 |

**重要**: Agentは「通知しない」と判断しても、コンテンツ自体は必ず生成する。`enabled: false`で無効化する。

---

### 実装変更

#### 1. 後処理検証の追加

**ファイル**: `apps/api/src/agents/commander.js`

```javascript
// runCommanderAgent関数に追加
export async function runCommanderAgent({ 
  grounding, 
  model = 'gpt-4o', 
  maxRetries = 2,
  expectedSlotCount = null  // ✅ NEW: 期待するスロット数
}) {
  // ... existing code ...
  
  const result = await run(commanderAgent, userPrompt);
  validateSlotUniqueness(result.finalOutput);
  
  // ✅ NEW: 100%生成検証
  if (expectedSlotCount !== null) {
    const actualCount = result.finalOutput.appNudges.length;
    if (actualCount !== expectedSlotCount) {
      throw new Error(
        `Commander Agent must generate exactly ${expectedSlotCount} nudges, ` +
        `but generated ${actualCount}. Agent must fill ALL slots.`
      );
    }
  }
  
  return result.finalOutput;
}
```

#### 2. generateNudges.js での呼び出し修正

**ファイル**: `apps/api/src/jobs/generateNudges.js`

```javascript
// collectAllGrounding後
const { grounding, slotTable } = await collectAllGrounding(
  query, user.user_id, problems, preferredLanguage, appVersion
);

// runCommanderAgent呼び出し時にexpectedSlotCountを渡す
const agentOutput = await runCommanderAgent({ 
  grounding,
  expectedSlotCount: slotTable.length  // ✅ スロット数を渡す
});
```

#### 3. プロンプト強化（オプション）

**ファイル**: `apps/api/src/agents/commander.js`

```
既存:
> あなたは **全行に対して** コンテンツを生成する義務がある。行をスキップするな。

追加:
> **重要**: appNudges配列の長さは必ずスロットテーブルの行数と一致すること。
> 不足している場合はシステムエラーとなり、処理が失敗する。
> スロットをOFFにしたい場合は enabled=false を設定し、hook/content/tone/reasoning は必ず埋めること。
```

#### 4. フォールバック処理の改善

**ファイル**: `apps/api/src/agents/commander.js`

```javascript
// commander.js:382-396 - フォールバック処理
const filledNudges = slotTable.map(slot => {
  const nudge = nudgeLookup.get(slot.slotIndex);
  if (nudge) {
    return { ...nudge };
  }
  // Missing slot: fill with ENABLED rule-based fallback
  return {
    slotIndex: slot.slotIndex,
    hook: preferredLanguage === 'ja' ? '今日も前に進もう' : 'Keep moving forward',
    content: preferredLanguage === 'ja' ? '小さな一歩から始めよう。' : 'Start with a small step.',
    tone: 'gentle',
    enabled: true,  // ✅ デフォルトで enabled に変更
    reasoning: 'LLM did not generate content for this slot; using rule-based fallback.',
  };
});
```

---

## テスト計画

### ユニットテスト

| テスト | 期待結果 |
|-------|---------|
| `runCommanderAgent` に `expectedSlotCount=5` で4件返却 | エラーをthrow |
| `runCommanderAgent` に `expectedSlotCount=5` で5件返却 | 成功 |
| `runCommanderAgent` に `expectedSlotCount=null` | 検証スキップ（後方互換） |

### 統合テスト

| テスト | 期待結果 |
|-------|---------|
| generateNudges実行 | 全ユーザーでnudge数 = slotTable.length |
| Agent出力が不足時 | リトライ後にフォールバック適用 |

---

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/src/agents/commander.js` | 後処理検証追加、フォールバック改善、プロンプト強化 |
| `apps/api/src/jobs/generateNudges.js` | `expectedSlotCount`パラメータ追加 |
| `apps/api/src/agents/__tests__/commander.test.js` | 新規テスト追加 |

---

## リスク

| リスク | 対策 |
|-------|------|
| Agent出力不足時のリトライ増加 | `maxRetries`をデフォルト2のまま維持、超過時はフォールバック |
| LLMコスト増加 | リトライ回数を監視、異常増加時はプロンプト調整 |

---

## デプロイ

1. Backend変更のみ（iOS変更なし）
2. dev → Staging テスト
3. main → Production デプロイ
4. Cronログで「0 nudges」が発生しないことを確認

---

*Last updated: 2026-02-02*
