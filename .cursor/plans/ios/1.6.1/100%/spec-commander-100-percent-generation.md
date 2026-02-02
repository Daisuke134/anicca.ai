# Commander Agent 100% Nudge Generation 仕様書

## 概要

Commander Agentが必要なスロット数分のNudgeを確実に生成する。
**JSON Schema の `minItems/maxItems` を使用してLLMレベルで配列長を強制し、`finish_reason`検査と再試行ロジックで信頼性を担保する。**

---

## 問題（As-Is）

### 現象

| ユーザー | 結果 | 問題 |
|---------|------|------|
| User A | 0 nudges / 0 slots | Agentが何も生成しない |
| User B | 3 enabled / 6 slots | 必要数の半分しか生成しない |

### 根本原因

LLMは「プロンプトでのお願い」を無視できる。スキーマに長さ制約がないため、LLMは好きな数だけ生成して終わる。

```
[現状のフロー]
プロンプト「15件生成せよ」→ LLM「8件で十分かな」→ 8件返却 → 7件欠損
```

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

---

## 解決策（To-Be）

### 核心: OpenAI Structured Outputs + 実行時検査 + 再試行

OpenAIの `strict: true` + `minItems/maxItems` を使用し、さらに`finish_reason`検査と再試行ロジックで信頼性を担保する。

```
[修正後のフロー]
JSON Schema「appNudges: minItems=15, maxItems=15」
  → LLM生成
  → finish_reason検査（refusal/length/content_filterをチェック）
  → 正常: スキーマ検証 → 成功
  → 異常: 再試行 or フォールバック
```

### 重要な制限事項

OpenAI Structured Outputsは以下の場合にスキーマ準拠が保証されない:
1. **refusal**: 安全上の理由でモデルが拒否
2. **finish_reason=length**: max_tokensに達して中断
3. **content_filter**: コンテンツフィルターで中断

**したがって、「100%の信頼性」ではなく「高い信頼性 + エッジケース対応」として設計する。**

### 設計原則

| 責務 | 担当 | 変更可否 |
|------|------|---------|
| **時間スロット決定** | システム（scheduleMap + trimSlots） | Agent変更不可 |
| **配列長強制** | JSON Schema（minItems/maxItems） | システムが動的設定 |
| **異常検出** | finish_reason + refusal検査 | 必須 |
| **コンテンツ決定** | Commander Agent | 生成必須 |
| **ON/OFF決定** | Commander Agent | `enabled: true/false`で制御 |

---

## 実装変更

### 1. 動的スキーマ生成（OpenAI互換）

**ファイル**: `apps/api/src/agents/commander.js`

```javascript
/**
 * スロット数に応じた動的スキーマを生成
 * OpenAIのStrictモード互換を確保
 * @param {number} slotCount - 必要なNudge数
 */
function createAgentOutputSchema(slotCount) {
  return z.object({
    rootCauseHypothesis: z.string(),
    overallStrategy: z.string(),
    frequencyReasoning: z.string(),
    appNudges: z.array(AppNudgeSchema).min(slotCount).max(slotCount),  // ✅ 長さ強制
    tiktokPosts: z.array(TiktokPostSchema).length(2),
    xPosts: z.array(XPostSchema).length(2),
  });
}

/**
 * ZodスキーマをOpenAI互換JSON Schemaに変換
 * OpenAIのサブセット制限に適合することを確認
 */
function toOpenAIJsonSchema(zodSchema, name) {
  const jsonSchema = zodToJsonSchema(zodSchema, { name });
  // additionalProperties: false を全オブジェクトに設定（OpenAI要件）
  return ensureAdditionalPropertiesFalse(jsonSchema);
}
```

### 2. OpenAI API呼び出し + finish_reason検査

**ファイル**: `apps/api/src/agents/commander.js`

```javascript
export async function runCommanderAgent({ 
  grounding, 
  model = 'gpt-4o-2024-08-06',
  slotCount,
  maxRetries = 2  // ✅ 再試行を維持
}) {
  const schema = createAgentOutputSchema(slotCount);
  const jsonSchema = toOpenAIJsonSchema(schema, 'commander_output');
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: buildMessages(grounding),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "commander_output",
            strict: true,
            schema: jsonSchema
          }
        }
      });
      
      const choice = response.choices[0];
      
      // ✅ finish_reason検査
      if (choice.finish_reason !== 'stop') {
        throw new Error(
          `Unexpected finish_reason: ${choice.finish_reason}. ` +
          `Expected 'stop' for complete structured output.`
        );
      }
      
      // ✅ refusal検査
      if (choice.message.refusal) {
        throw new Error(`Model refused: ${choice.message.refusal}`);
      }
      
      // ✅ スキーマ検証（Structured Outputsでも必須）
      const content = JSON.parse(choice.message.content);
      const output = schema.parse(content);
      
      // ✅ 配列長の最終確認
      if (output.appNudges.length !== slotCount) {
        throw new Error(
          `Expected ${slotCount} nudges, got ${output.appNudges.length}`
        );
      }
      
      return output;
      
    } catch (error) {
      lastError = error;
      console.warn(`Commander attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // 再試行前に少し待機
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  // 全再試行失敗 → エラーをthrow（呼び出し元でフォールバック処理）
  throw new Error(`Commander failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}
```

### 3. generateNudges.js でのフォールバック処理

**ファイル**: `apps/api/src/jobs/generateNudges.js`

```javascript
const { grounding, slotTable } = await collectAllGrounding(
  query, user.user_id, problems, preferredLanguage, appVersion
);

let agentOutput;
try {
  agentOutput = await runCommanderAgent({ 
    grounding,
    slotCount: slotTable.length
  });
} catch (error) {
  console.error('Commander failed, using rule-based fallback:', error.message);
  // ✅ フォールバック: ルールベースNudgeを使用
  agentOutput = generateRuleBasedFallback(slotTable, preferredLanguage);
}
```

### 4. ルールベースフォールバック

**ファイル**: `apps/api/src/agents/commander.js`

```javascript
/**
 * Commander失敗時のルールベースフォールバック
 * 全スロットをenabled=trueで埋める
 */
export function generateRuleBasedFallback(slotTable, preferredLanguage) {
  const isJa = preferredLanguage === 'ja';
  
  return {
    rootCauseHypothesis: 'Fallback mode - LLM generation failed',
    overallStrategy: 'Using rule-based content',
    frequencyReasoning: 'Maintaining scheduled frequency',
    appNudges: slotTable.map((slot, index) => ({
      slotIndex: slot.slotIndex,
      hook: isJa ? '今日も前に進もう' : 'Keep moving forward',
      content: isJa ? '小さな一歩から始めよう。' : 'Start with a small step.',
      tone: 'gentle',
      enabled: true,  // ✅ フォールバックはenabled
      reasoning: 'Rule-based fallback due to LLM failure',
    })),
    tiktokPosts: [],
    xPosts: [],
  };
}
```

---

## OpenAI Structured Outputs の制限事項

### サポートされるJSON Schemaサブセット

| サポート | 非サポート |
|---------|-----------|
| type, properties, required | allOf, not, if/then/else |
| items, minItems, maxItems | oneOf（一部制限あり） |
| enum, const | patternProperties |
| additionalProperties: false | 複雑な$ref |

### 必須要件

1. **additionalProperties: false** を全オブジェクトに設定
2. **required** に全プロパティを列挙
3. スキーマの最大5000プロパティ、最大10階層

---

## テスト計画

### ユニットテスト

| テスト | 期待結果 |
|-------|---------|
| `createAgentOutputSchema(5)` のJSONスキーマにminItems=5, maxItems=5が含まれる | Pass |
| 生成されたJSONスキーマがOpenAIサブセット制限に適合 | Pass |
| finish_reason='length'でエラーをthrow | Pass |
| refusal検出でエラーをthrow | Pass |
| 3回失敗後にフォールバックが呼ばれる | Pass |

### 統合テスト

| テスト | 期待結果 |
|-------|---------|
| 15スロットのユーザーでgenerateNudges実行 | 15件のnudge生成 or フォールバック |
| OpenAI APIモックでrefusal返却 | フォールバックに移行 |

### スキーマ適合テスト

```javascript
// OpenAI APIに実際にスキーマを送信して検証
it('schema is accepted by OpenAI', async () => {
  const schema = createAgentOutputSchema(5);
  const jsonSchema = toOpenAIJsonSchema(schema, 'test');
  
  // 空のプロンプトでスキーマだけ検証
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [{ role: 'user', content: 'Generate test output' }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'test', strict: true, schema: jsonSchema }
    },
    max_tokens: 10  // 最小限で検証
  });
  
  // エラーなく完了すればスキーマは有効
  expect(response.choices[0].finish_reason).toBeDefined();
});
```

---

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/src/agents/commander.js` | 動的スキーマ生成、finish_reason検査、再試行ロジック |
| `apps/api/src/jobs/generateNudges.js` | フォールバック呼び出し追加 |
| `apps/api/src/agents/__tests__/commander.test.js` | スキーマ検証テスト、finish_reasonテスト追加 |

---

## Before/After 比較

| 項目 | Before | After |
|------|--------|-------|
| 配列長制約 | なし（プロンプトのみ） | JSON Schema minItems/maxItems |
| 信頼性 | 40%以下 | 高い信頼性 + エッジケース対応 |
| finish_reason検査 | なし | 必須（refusal/length/content_filter検出） |
| 再試行 | maxRetries=2 | maxRetries=2（維持） |
| スキーマ検証 | なし | schema.parse必須 |
| フォールバック | enabled=false | enabled=true（安全フォールバック） |

---

## リスク

| リスク | 対策 |
|-------|------|
| OpenAIのサブセット制限でスキーマ拒否 | スキーマ適合テストで事前検証 |
| refusal/length中断 | finish_reason検査 + 再試行 + フォールバック |
| zod-to-json-schemaの非互換 | OpenAI SDKヘルパーまたは`openai-zod-to-json-schema`検討 |

---

## デプロイ

1. Backend変更のみ（iOS変更なし）
2. dev → Staging テスト
3. main → Production デプロイ
4. Cronログで「0 nudges」が発生しないことを確認

---

*Last updated: 2026-02-02*
