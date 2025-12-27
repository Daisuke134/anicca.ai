<!-- 5cdc4865-246e-421e-99a0-4fbf823d3a20 eb0884e5-1400-41c5-96e6-e15c81cdbd24 -->
# Behavior Tab Data Display Fix

## 問題の根本原因

### 1. 10 Years From Now - 常にフォールバック

**原因**: [`futureScenario.js`](apps/api/src/modules/simulation/futureScenario.js) が存在しない `/v1/responses` エンドポイントを呼んでいる

```javascript
// 現状（間違い）: 57行目
const resp = await fetch('https://api.openai.com/v1/responses', { ... })
```

### 2. Today's Insight - 常にフォールバック

**原因**: AI生成パイプラインが存在しない。[`pickTodayInsight()`](apps/api/src/modules/metrics/stateBuilder.js) は `daily_metrics.insights.todayInsight` を読むだけで、生成ロジックがない

### 3. 24h Timeline - 睡眠バーが表示されない

**原因**: [`contextSnapshot.js`](apps/api/src/modules/realtime/contextSnapshot.js) で `sleepStartAt` が `today_stats` にマッピングされていない

```javascript
// 現状: 146-147行目
sleepDurationMin: today.sleep_duration_min ?? null,
wakeAt: today.wake_at ?? null,
// sleepStartAt が欠落！
```

## 実装計画

### ステップ1: futureScenario.js の OpenAI API 修正

- `/v1/responses` → `/v1/chat/completions` に変更
- リクエストボディを Chat Completions API フォーマットに変換
- レスポンス解析を `data.choices[0].message.content` に変更

### ステップ2: contextSnapshot.js に sleepStartAt 追加

- `today_stats` オブジェクトに `sleepStartAt: today.sleep_start_at ?? null` を追加

### ステップ3: Today's Insight AI生成機能の追加

- 新規ファイル `apps/api/src/modules/insights/generateTodayInsight.js` を作成
- [`behavior.js`](apps/api/src/routes/mobile/behavior.js) で `pickTodayInsight()` がnullの場合にAI生成を呼び出す

## 技術的確認事項（ドキュメント調査結果）

### HealthKit

- **過去データ取得**: 可能。`HKSampleQuery` の `predicateForSamples(withStart:end:)` で任意の日付範囲を指定可能
- 現在の実装は当日のみ取得しているが、技術的制限ではない

### DeviceActivity (Screen Time)

- **過去データ取得**: 可能。`DeviceActivityFilter.SegmentInterval.daily(during: DateInterval)` で過去の日付範囲も指定可能
- サンドボックス制限でExtension内でのみデータ処理可能（App Groups経由で渡す現在の実装は正しい）

### ハイライト4つの値（固定）

| ハイライト | データソース |

|-----------|-------------|

| Wake | `daily_metrics.wake_at` (HealthKit) |

| SNS | `daily_metrics.sns_minutes_total` (Screen Time) |

| Steps | `daily_metrics.steps` (HealthKit) |

| Rumination | 計算式（SNS夜間使用等から算出）|

### To-dos

- [ ] futureScenario.js: OpenAI APIエンドポイントを /v1/chat/completions に修正
- [ ] contextSnapshot.js: today_stats に sleepStartAt を追加
- [ ] generateTodayInsight.js: AI生成モジュールを新規作成
- [ ] behavior.js: AI生成Insightを統合