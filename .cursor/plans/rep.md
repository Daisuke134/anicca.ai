# Anicca iOS / Backend 完全パッチドキュメント

このドキュメントは、Behaviorタブおよびローカライゼーションに関する問題を修正するための完全なパッチです。

---

## 目次

1. [問題1: 10 Years From Now が常にフォールバック表示](#問題1-10-years-from-now-が常にフォールバック表示)
2. [問題2: 10 Years From Now が2行表示される](#問題2-10-years-from-now-が2行表示される)
3. [問題3: 10 Years From Now カードの横幅が狭い](#問題3-10-years-from-now-カードの横幅が狭い)
4. [問題4: Today's Insight が常にフォールバック表示](#問題4-todays-insight-が常にフォールバック表示)
5. [問題5: 24h Timeline に睡眠バーが表示されない](#問題5-24h-timeline-に睡眠バーが表示されない)
6. [問題6: HealthKit 睡眠データが夜間睡眠を取得できない](#問題6-healthkit-睡眠データが夜間睡眠を取得できない)
7. [問題7: ハイライトのラベルが日本語でも英語表示](#問題7-ハイライトのラベルが日本語でも英語表示)
8. [問題8: ハイライトのステータス文言を削除し値のみ表示](#問題8-ハイライトのステータス文言を削除し値のみ表示)
9. [問題9: Ideal Traits/Problems がプロンプト内で英語のまま](#問題9-ideal-traitsproblems-がプロンプト内で英語のまま)
10. [問題10: LANGUAGE LOCK が常に English になる](#問題10-language-lock-が常に-english-になる)
11. [問題11: Feeling プロンプトが英語のみ](#問題11-feeling-プロンプトが英語のみ)
12. [問題12: デバッグログが不足](#問題12-デバッグログが不足)
13. [ファイル変更一覧](#ファイル変更一覧)
14. [適用手順](#適用手順)

---

## 問題1: 10 Years From Now が常にフォールバック表示

### 原因

`futureScenario.js` が存在しない OpenAI API エンドポイント `/v1/responses` を呼び出しているため、常に catch ブロックに入り fallback が返される。

正しいエンドポイントは `/v1/chat/completions`。

### パッチ

**ファイル**: `apps/api/src/modules/simulation/futureScenario.js`

```javascript
// ============================================
// 変更前 (55-78行目):
// ============================================
  try {
    // Minimal call (Responses API assumed). If this fails, we fallback.
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input,
        // Ask for JSON in text; parse best-effort below.
        text: { format: { type: 'json_object' } }
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const text = data.output_text || '';
    const parsed = JSON.parse(text);
    if (parsed?.ifContinue && parsed?.ifImprove) {
      return { ifContinue: String(parsed.ifContinue), ifImprove: String(parsed.ifImprove) };
    }
    return fallback(language);
  } catch {
    return fallback(language);
  }

// ============================================
// 変更後:
// ============================================
  try {
    // ★ 正しいエンドポイント: /v1/chat/completions
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: input,  // ★ 'input' → 'messages'
        response_format: { type: 'json_object' },  // ★ フォーマット指定
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';  // ★ レスポンス解析修正
    const parsed = JSON.parse(text);
    if (parsed?.ifContinue && parsed?.ifImprove) {
      return { ifContinue: String(parsed.ifContinue), ifImprove: String(parsed.ifImprove) };
    }
    return fallback(language);
  } catch {
    return fallback(language);
  }
```

---

## 問題2: 10 Years From Now が2行表示される

### 原因

フォールバック時に `ifContinue` と `ifImprove` の両方に同じメッセージが設定されるため、UIで両方表示される。

### パッチ

**ファイル**: `apps/api/src/modules/simulation/futureScenario.js`

```javascript
// ============================================
// 変更前 (3-14行目):
// ============================================
function fallback(language) {
  if (language === 'ja') {
    return {
      ifContinue: '十分なデータがありません',
      ifImprove: '十分なデータがありません'
    };
  }
  return {
    ifContinue: 'Not enough data available',
    ifImprove: 'Not enough data available'
  };
}

// ============================================
// 変更後:
// ============================================
function fallback(language) {
  if (language === 'ja') {
    return {
      ifContinue: '十分なデータがありません',
      ifImprove: ''  // ★ 空にして1行のみ表示
    };
  }
  return {
    ifContinue: 'Not enough data available',
    ifImprove: ''  // ★ 空にして1行のみ表示
  };
}
```

---

## 問題3: 10 Years From Now カードの横幅が狭い

### 原因

データなし時の `CardView` に `maxWidth: .infinity` が適用されていない。また、タイトルも表示されない。

### パッチ

**ファイル**: `aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift`

```swift
// ============================================
// 変更前 (10-18行目):
// ============================================
if isEmpty {
    CardView {
        Text(String(localized: "behavior_not_enough_data"))
            .font(AppTheme.Typography.subheadlineDynamic)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

// ============================================
// 変更後:
// ============================================
if isEmpty {
    CardView {
        VStack(alignment: .leading, spacing: 12) {
            // ★ タイトルを追加
            Text(String(localized: "behavior_title_future"))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
            Text(String(localized: "behavior_not_enough_data"))
                .font(AppTheme.Typography.subheadlineDynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }
    .frame(maxWidth: .infinity)  // ★ TimelineViewと同じ横幅
}
```

---

## 問題4: Today's Insight が常にフォールバック表示

### 原因

`pickTodayInsight()` は `daily_metrics.insights.todayInsight` を読むだけで、AI生成パイプラインが存在しない。

### パッチ

#### パッチ4-1: 新規ファイル作成

**ファイル**: `apps/api/src/modules/insights/generateTodayInsight.js` （新規作成）

```javascript
import { fetch } from 'undici';
import baseLogger from '../../utils/logger.js';

const logger = baseLogger.withContext('TodayInsight');

export async function generateTodayInsight({ todayStats, traits, language = 'en' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set, returning fallback');
    return null;
  }

  // データが不十分な場合はnullを返す（呼び出し元でフォールバック）
  const hasData = todayStats && (
    todayStats.wakeAt ||
    todayStats.steps > 0 ||
    todayStats.snsMinutesTotal > 0 ||
    todayStats.sleepDurationMin
  );
  
  if (!hasData) {
    return null;
  }

  const model = process.env.OPENAI_INSIGHT_MODEL || 'gpt-4o-mini';

  const systemPrompt = language === 'ja'
    ? `あなたは行動データに基づいて、今日1日の短い洞察（1-2文）を提供します。
       ポジティブで励ましの言葉を使い、医療的なアドバイスは避けてください。
       データに基づいた具体的な観察と、小さな改善提案を含めてください。`
    : `You provide brief insights (1-2 sentences) based on behavioral data.
       Use positive, encouraging language. Avoid medical advice.
       Include specific observations from the data and small improvement suggestions.`;

  const userContent = JSON.stringify({
    task: language === 'ja' 
      ? '今日の行動データに基づいて、短い洞察を1-2文で書いてください。'
      : 'Write a brief insight (1-2 sentences) based on today\'s behavioral data.',
    data: {
      sleepMinutes: todayStats.sleepDurationMin,
      wakeTime: todayStats.wakeAt,
      steps: todayStats.steps,
      snsMinutes: todayStats.snsMinutesTotal,
      sedentaryMinutes: todayStats.sedentaryMinutes
    },
    userTraits: {
      ideals: traits?.ideals || [],
      struggles: traits?.struggles || []
    }
  }, null, 2);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const insight = data.choices?.[0]?.message?.content?.trim();
    
    if (insight) {
      return insight;
    }
  } catch (e) {
    logger.error('Failed to generate today insight', e);
  }

  return null;
}
```

#### パッチ4-2: stateBuilder.js の修正

**ファイル**: `apps/api/src/modules/metrics/stateBuilder.js`

```javascript
// ============================================
// 変更前 (89-95行目):
// ============================================
export function pickTodayInsight({ todayStats, language = 'en' }) {
  const insight = todayStats?.insights?.todayInsight;
  if (typeof insight === 'string' && insight.trim()) return insight.trim();
  return language === 'ja'
    ? 'まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。'
    : 'Not enough behavior data yet. We can shape today gently from here.';
}

// ============================================
// 変更後:
// ============================================
export function pickTodayInsight({ todayStats, language = 'en' }) {
  const insight = todayStats?.insights?.todayInsight;
  if (typeof insight === 'string' && insight.trim()) {
    return insight.trim();
  }
  // ★ 保存済みがない場合はnullを返し、呼び出し元でAI生成を促す
  return null;
}

// ★ フォールバックメッセージを取得するユーティリティを追加
export function getInsightFallback(language = 'en') {
  return language === 'ja'
    ? 'まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。'
    : 'Not enough behavior data yet. We can shape today gently from here.';
}
```

#### パッチ4-3: behavior.js の修正

**ファイル**: `apps/api/src/routes/mobile/behavior.js`

```javascript
// ============================================
// 変更前 (1-44行目):
// ============================================
import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight } from '../../modules/metrics/stateBuilder.js';
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
import { PrismaClient } from '../../generated/prisma/index.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileBehavior');
const prisma = new PrismaClient();

// GET /api/mobile/behavior/summary
router.get('/summary', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await buildContextSnapshot({ userId, deviceId });
    const tz = snapshot?.timezone || 'UTC';
    const lang = snapshot?.language || 'en';
    const today = snapshot?.today_stats || null;

    const todayInsight = pickTodayInsight({ todayStats: today, language: lang });
    const highlights = buildHighlights({ todayStats: today, timezone: tz });
    const timeline = buildTimeline({ todayStats: today, timezone: tz });
    // ...

// ============================================
// 変更後:
// ============================================
import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight, getInsightFallback } from '../../modules/metrics/stateBuilder.js';  // ★ getInsightFallback 追加
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
import { generateTodayInsight } from '../../modules/insights/generateTodayInsight.js';  // ★ 追加
import { PrismaClient } from '../../generated/prisma/index.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileBehavior');
const prisma = new PrismaClient();

// GET /api/mobile/behavior/summary
router.get('/summary', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await buildContextSnapshot({ userId, deviceId });
    const tz = snapshot?.timezone || 'UTC';
    const lang = snapshot?.language || 'en';
    const today = snapshot?.today_stats || null;

    // ★ 保存済みinsightをチェック、なければAI生成
    let todayInsight = pickTodayInsight({ todayStats: today, language: lang });
    if (!todayInsight) {
      // AI生成を試みる
      todayInsight = await generateTodayInsight({
        todayStats: today,
        traits: snapshot?.traits,
        language: lang
      });
      // 生成に失敗した場合はフォールバック
      if (!todayInsight) {
        todayInsight = getInsightFallback(lang);
      }
    }

    const highlights = buildHighlights({ todayStats: today, timezone: tz, language: lang });  // ★ language 追加
    const timeline = buildTimeline({ todayStats: today, timezone: tz });
    // ...
```

---

## 問題5: 24h Timeline に睡眠バーが表示されない

### 原因

`contextSnapshot.js` の `today_stats` オブジェクトに `sleepStartAt` が含まれていない。

### パッチ

**ファイル**: `apps/api/src/modules/realtime/contextSnapshot.js`

```javascript
// ============================================
// 変更前 (144-155行目):
// ============================================
    today_stats: today
      ? {
          sleepDurationMin: today.sleep_duration_min ?? null,
          wakeAt: today.wake_at ?? null,
          snsMinutesTotal: today.sns_minutes_total ?? 0,
          steps: today.steps ?? 0,
          sedentaryMinutes: today.sedentary_minutes ?? 0,
          mindSummary: today.mind_summary ?? {},
          activitySummary: today.activity_summary ?? {},
          insights: today.insights ?? {}
        }
      : null,

// ============================================
// 変更後:
// ============================================
    today_stats: today
      ? {
          sleepDurationMin: today.sleep_duration_min ?? null,
          sleepStartAt: today.sleep_start_at ?? null,  // ★ 追加: Timeline用
          wakeAt: today.wake_at ?? null,
          snsMinutesTotal: today.sns_minutes_total ?? 0,
          steps: today.steps ?? 0,
          sedentaryMinutes: today.sedentary_minutes ?? 0,
          mindSummary: today.mind_summary ?? {},
          activitySummary: today.activity_summary ?? {},
          insights: today.insights ?? {}
        }
      : null,
```

---

## 問題6: HealthKit 睡眠データが夜間睡眠を取得できない

### 原因

`HealthKitManager.swift` が `.strictStartDate` オプションを使用しているため、昨夜22時〜今朝6時の睡眠データは「開始時刻が昨日」のため取得されない。

### パッチ

**ファイル**: `aniccaios/aniccaios/Services/HealthKitManager.swift`

```swift
// ============================================
// 変更前 (93-136行目):
// ============================================
    func fetchDailySummary() async -> DailySummary {
        var summary = DailySummary()
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        // Fetch sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
            let sleepSamples = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
                let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                    }
                }
                healthStore.execute(query)
            }
            
            if let samples = sleepSamples {
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                ]
                let totalSleepSeconds = samples
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                summary.sleepMinutes = Int(totalSleepSeconds / 60)
                
                // v3: 睡眠の開始/終了時刻を推定
                let asleepSamples = samples.filter { asleepValues.contains($0.value) }
                if !asleepSamples.isEmpty {
                    summary.sleepStartAt = asleepSamples.map { $0.startDate }.min()
                    summary.wakeAt = asleepSamples.map { $0.endDate }.max()
                }
            }
        }
        // ... 以下省略

// ============================================
// 変更後:
// ============================================
    func fetchDailySummary() async -> DailySummary {
        var summary = DailySummary()
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        // ★ 睡眠クエリ用: 前日18:00から取得（夜22時に寝て朝6時に起きるパターンを捕捉）
        let sleepQueryStart = calendar.date(byAdding: .hour, value: -6, to: startOfDay)!
        
        // Fetch sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            // ★ .strictStartDate を削除し、範囲と重なるすべてのサンプルを取得
            let predicate = HKQuery.predicateForSamples(withStart: sleepQueryStart, end: endOfDay, options: [])
            let sleepSamples = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
                let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                    }
                }
                healthStore.execute(query)
            }
            
            if let samples = sleepSamples {
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                ]
                
                // ★ 今日の起床時刻（=今日の日付で終了したサンプル）のみを対象にフィルタリング
                let todayAsleepSamples = samples.filter { sample in
                    asleepValues.contains(sample.value) && sample.endDate >= startOfDay
                }
                
                let totalSleepSeconds = todayAsleepSamples
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                summary.sleepMinutes = Int(totalSleepSeconds / 60)
                
                // v3: 睡眠の開始/終了時刻を推定
                if !todayAsleepSamples.isEmpty {
                    // 最も早い開始時刻を sleepStartAt（昨夜の就寝時刻）
                    summary.sleepStartAt = todayAsleepSamples.map { $0.startDate }.min()
                    // 最も遅い終了時刻を wakeAt（今朝の起床時刻）
                    summary.wakeAt = todayAsleepSamples.map { $0.endDate }.max()
                }
                
                logger.info("Sleep query: found \(samples.count) samples, \(todayAsleepSamples.count) for today, duration=\(summary.sleepMinutes ?? 0)min")
            }
        }
        // ... 以下は変更なし
```

---

## 問題7: ハイライトのラベルが日本語でも英語表示

### 原因

バックエンドの `stateBuilder.js` がラベルを英語固定で生成している。

### パッチ

#### パッチ7-1: stateBuilder.js の修正

**ファイル**: `apps/api/src/modules/metrics/stateBuilder.js`

```javascript
// ============================================
// 変更前 (8-43行目):
// ============================================
export function buildHighlights({ todayStats, timezone }) {
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
  const steps = Number(todayStats?.steps ?? 0);
  
  const activity = todayStats?.activitySummary || {};
  const ruminationProxy = calculateRuminationProxy({
    lateNightSnsMinutes: Number(activity?.lateNightSnsMinutes ?? 0),
    snsMinutes: snsMinutesTotal,
    totalScreenTime: Number(activity?.totalScreenTime ?? snsMinutesTotal),
    sleepWindowPhoneMinutes: Number(activity?.sleepWindowPhoneMinutes ?? 0),
    longestNoUseHours: Number(activity?.longestNoUseHours ?? 0)
  });

  const wakeLabel = wakeAt ? `Wake ${toLocalTimeHHMM(wakeAt, timezone)}` : 'Wake';
  const wakeStatus = wakeAt ? 'on_track' : 'warning';

  const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
  const screenLabel = snsMinutesTotal > 0 ? `SNS ${snsMinutesTotal}m` : 'SNS';

  const workoutStatus = steps >= 8000 ? 'on_track' : steps >= 3000 ? 'warning' : 'missed';
  const workoutLabel = steps > 0 ? `Steps ${steps}` : 'Workout';

  const ruminationStatus = ruminationProxy >= 0.7 ? 'warning' : ruminationProxy >= 0.4 ? 'ok' : 'ok';
  const ruminationLabel = `Rumination ${Math.round(ruminationProxy * 100)}%`;

  return {
    wake: { status: wakeStatus, label: wakeLabel },
    screen: { status: screenStatus, label: screenLabel },
    workout: { status: workoutStatus, label: workoutLabel },
    rumination: { status: ruminationStatus, label: ruminationLabel }
  };
}

// ============================================
// 変更後（language パラメータを追加）:
// ============================================
export function buildHighlights({ todayStats, timezone, language = 'en' }) {
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
  const steps = Number(todayStats?.steps ?? 0);
  
  const activity = todayStats?.activitySummary || {};
  const ruminationProxy = calculateRuminationProxy({
    lateNightSnsMinutes: Number(activity?.lateNightSnsMinutes ?? 0),
    snsMinutes: snsMinutesTotal,
    totalScreenTime: Number(activity?.totalScreenTime ?? snsMinutesTotal),
    sleepWindowPhoneMinutes: Number(activity?.sleepWindowPhoneMinutes ?? 0),
    longestNoUseHours: Number(activity?.longestNoUseHours ?? 0)
  });

  const isJa = language === 'ja';
  
  // ★ ラベルをローカライズ
  const wakeLabel = wakeAt 
    ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
    : (isJa ? '起床' : 'Wake');
  const wakeStatus = wakeAt ? 'on_track' : 'warning';

  const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
  const screenLabel = snsMinutesTotal > 0 
    ? (isJa ? `SNS ${snsMinutesTotal}分` : `SNS ${snsMinutesTotal}m`) 
    : 'SNS';

  const workoutStatus = steps >= 8000 ? 'on_track' : steps >= 3000 ? 'warning' : 'missed';
  const workoutLabel = steps > 0 
    ? (isJa ? `歩数 ${steps.toLocaleString()}` : `Steps ${steps.toLocaleString()}`) 
    : (isJa ? '運動' : 'Workout');

  const ruminationStatus = ruminationProxy >= 0.7 ? 'warning' : ruminationProxy >= 0.4 ? 'ok' : 'ok';
  const ruminationLabel = isJa 
    ? `反芻 ${Math.round(ruminationProxy * 100)}%`
    : `Rumination ${Math.round(ruminationProxy * 100)}%`;

  return {
    wake: { status: wakeStatus, label: wakeLabel },
    screen: { status: screenStatus, label: screenLabel },
    workout: { status: workoutStatus, label: workoutLabel },
    rumination: { status: ruminationStatus, label: ruminationLabel }
  };
}
```

#### パッチ7-2: realtime.js の修正

**ファイル**: `apps/api/src/routes/mobile/realtime.js`

```javascript
// ============================================
// 変更前 (該当箇所):
// ============================================
const highlights = buildHighlights({ todayStats: today, timezone: tz });

// ============================================
// 変更後:
// ============================================
const highlights = buildHighlights({ todayStats: today, timezone: tz, language: lang });
```

---

## 問題8: ハイライトのステータス文言を削除し値のみ表示

### 原因

「要注意」「前進中」「安定」などのステータスラベルが表示され、冗長。

### パッチ

**ファイル**: `aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift`

```swift
// ============================================
// 変更前 (29-72行目):
// ============================================
private func highlightMiniCard(title: String, apiStatus: String, valueLabel: String, streak: Int) -> some View {
    let ui = mapToUI(apiStatus)

    return ZStack(alignment: .topTrailing) {
        CardView(cornerRadius: 24) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(ui.icon)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(ui.iconColor)
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(ui.label)
                        .font(.system(size: 12))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    
                    if !valueLabel.isEmpty {
                        Text(valueLabel)
                            .font(.system(size: 11))
                            .foregroundStyle(AppTheme.Colors.tertiaryLabel)
                    }
                }
            }
        }

        HStack(spacing: 6) {
            Text("🌱").font(.system(size: 12))
            Text("\(streak)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(AppTheme.Colors.buttonUnselected.opacity(0.6))
        .clipShape(Capsule())
        .padding(10)
    }
}

// ============================================
// 変更後:
// ============================================
private func highlightMiniCard(title: String, apiStatus: String, valueLabel: String, streak: Int) -> some View {
    let ui = mapToUI(apiStatus)

    return ZStack(alignment: .topTrailing) {
        CardView(cornerRadius: 24) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(ui.icon)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(ui.iconColor)
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Spacer()
                }

                // ★ 変更: ステータスラベルを削除し、値を同じサイズで表示
                Text(valueLabel.isEmpty ? "-" : valueLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }

        HStack(spacing: 6) {
            Text("🌱").font(.system(size: 12))
            Text("\(streak)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(AppTheme.Colors.buttonUnselected.opacity(0.6))
        .clipShape(Capsule())
        .padding(10)
    }
}
```

---

## 問題9: Ideal Traits/Problems がプロンプト内で英語のまま

### 原因

`WakePromptBuilder.swift` でプレフィックスが英語固定。

### パッチ

**ファイル**: `aniccaios/aniccaios/WakePromptBuilder.swift`

```swift
// ============================================
// 変更前 (153-167行目):
// ============================================
// 理想の姿（全習慣で使用）
if !profile.idealTraits.isEmpty {
    let localizedTraits = profile.idealTraits.map { NSLocalizedString("ideal_trait_\($0)", comment: "") }
    replacements["IDEAL_TRAITS"] = "理想の姿として設定されている特性: " + localizedTraits.joined(separator: "、")
} else {
    replacements["IDEAL_TRAITS"] = ""
}

if !profile.problems.isEmpty {
    let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
    replacements["PROBLEMS"] = "今抱えている問題: " + localizedProblems.joined(separator: "、")
} else {
    replacements["PROBLEMS"] = ""
}

// ============================================
// 変更後:
// ============================================
// 理想の姿（全習慣で使用）- 言語設定に応じてプレフィックスをローカライズ
if !profile.idealTraits.isEmpty {
    let localizedTraits = profile.idealTraits.map { NSLocalizedString("ideal_trait_\($0)", comment: "") }
    let prefix = profile.preferredLanguage == .ja
        ? "理想の姿として設定されている特性: "
        : "Ideal self traits: "
    let separator = profile.preferredLanguage == .ja ? "、" : ", "
    replacements["IDEAL_TRAITS"] = prefix + localizedTraits.joined(separator: separator)
} else {
    replacements["IDEAL_TRAITS"] = ""
}

if !profile.problems.isEmpty {
    let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
    let prefix = profile.preferredLanguage == .ja
        ? "今抱えている問題: "
        : "Current struggles: "
    let separator = profile.preferredLanguage == .ja ? "、" : ", "
    replacements["PROBLEMS"] = prefix + localizedProblems.joined(separator: separator)
} else {
    replacements["PROBLEMS"] = ""
}
```

---

## 問題10: LANGUAGE LOCK が常に English になる

### 原因

`LanguagePreference.languageLine` が `NSLocalizedString` を使用し、アプリのバンドル言語に依存している。

### パッチ

**ファイル**: `aniccaios/aniccaios/Models/UserProfile.swift`

```swift
// ============================================
// 変更前 (3-22行目):
// ============================================
enum LanguagePreference: String, Codable {
    case ja
    case en
    
    var languageLine: String {
        switch self {
        case .ja:
            return NSLocalizedString("language_preference_ja", comment: "")
        case .en:
            return NSLocalizedString("language_preference_en", comment: "")
        }
    }
    
    static func detectDefault(locale: Locale = .current) -> Self {
        let preferred = Locale.preferredLanguages.first ?? locale.identifier
        if preferred.hasPrefix("ja") || locale.identifier.hasPrefix("ja") {
            return .ja
        }
        return .en
    }
}

// ============================================
// 変更後:
// ============================================
enum LanguagePreference: String, Codable {
    case ja
    case en
    
    /// プロンプト内のLANGUAGE LOCK用（ハードコーディングで確実に正しい言語名を返す）
    var languageLine: String {
        switch self {
        case .ja:
            return "日本語"
        case .en:
            return "English"
        }
    }
    
    /// UI表示用のローカライズされた言語名
    var displayName: String {
        switch self {
        case .ja:
            return NSLocalizedString("language_preference_ja", comment: "")
        case .en:
            return NSLocalizedString("language_preference_en", comment: "")
        }
    }
    
    static func detectDefault(locale: Locale = .current) -> Self {
        let preferred = Locale.preferredLanguages.first ?? locale.identifier
        if preferred.hasPrefix("ja") || locale.identifier.hasPrefix("ja") {
            return .ja
        }
        return .en
    }
}
```

---

## 問題11: Feeling プロンプトのラベルが英語のみ

### 原因

`[Feeling: irritation]` などのラベル部分が英語固定。

### パッチ

**ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`

言語に応じて `[Feeling: xxx]` を動的に置換する。`_ja.txt` ファイルは不要。

```swift
private enum RealtimePromptBuilder {
    static func buildFeelingInstructions(topic: FeelingTopic, profile: UserProfile) -> String {
        let openerName: String = {
            switch topic {
            case .selfLoathing: return "feeling_self_loathing"
            case .anxiety: return "feeling_anxiety"
            case .irritation: return "feeling_irritation"
            case .freeConversation: return "feeling_free_conversation"
            }
        }()
        
        // ★ 言語別のFeelingラベル
        let localizedFeelingLabel: String = {
            let isJa = profile.preferredLanguage == .ja
            switch topic {
            case .selfLoathing: return isJa ? "自己嫌悪" : "self_loathing"
            case .anxiety: return isJa ? "不安" : "anxiety"
            case .irritation: return isJa ? "怒り" : "irritation"
            case .freeConversation: return isJa ? "自由な対話" : "free_conversation"
            }
        }()
        
        // ファイルを読み込み（1つだけ）
        var opener = (load(name: openerName, ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        // ★ [Feeling: xxx] を動的に置換
        let englishLabel: String = {
            switch topic {
            case .selfLoathing: return "self_loathing"
            case .anxiety: return "anxiety"
            case .irritation: return "irritation"
            case .freeConversation: return "free_conversation"
            }
        }()
        opener = opener.replacingOccurrences(
            of: "[Feeling: \(englishLabel)]",
            with: "[Feeling: \(localizedFeelingLabel)]"
        )
        
        let commonTemplate = (load(name: "common", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let talkTemplate = (load(name: "talk_session", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        let mergedTemplate = "\(commonTemplate)\n\n\(talkTemplate)\n\n\(opener)"
        
        let rendered = renderTemplate(mergedTemplate, profile: profile)
        return rendered
    }
}
```

### 削除するファイル

- `feeling_self_loathing_ja.txt`
- `feeling_anxiety_ja.txt`
- `feeling_irritation_ja.txt`
- `feeling_free_conversation_ja.txt`

---

## 問題12: デバッグログが不足

### 原因

ハイライトやタイムラインが表示されない原因の特定が困難。

### パッチ

#### パッチ12-1: BehaviorView.swift にログ追加

**ファイル**: `aniccaios/aniccaios/Views/Behavior/BehaviorView.swift`

```swift
// ============================================
// load() 関数に追加 (102-125行目):
// ============================================
private func load() async {
    guard !isLoading else { return }
    isLoading = true
    errorText = nil
    
    // ★ デバッグログ追加
    logger.info("BehaviorView: Starting data load")
    logger.info("BehaviorView: screenTimeEnabled=\(appState.sensorAccess.screenTimeEnabled), sleepEnabled=\(appState.sensorAccess.sleepEnabled), stepsEnabled=\(appState.sensorAccess.stepsEnabled)")
    
    // v3.1: Screen Time データを更新するために DeviceActivityReport を表示
    if appState.sensorAccess.screenTimeEnabled {
        showScreenTimeReport = true
        logger.info("BehaviorView: Waiting for DeviceActivityReport...")
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1秒に延長
        showScreenTimeReport = false
    }
    
    // v3.1: 最新の HealthKit データを即座にバックエンドへ送信
    logger.info("BehaviorView: Running MetricsUploader...")
    await MetricsUploader.shared.runUploadIfDue(force: true)
    
    do {
        logger.info("BehaviorView: Fetching summary from backend...")
        let data = try await BehaviorSummaryService.shared.fetchSummary()
        
        // ★ デバッグログ追加
        logger.info("BehaviorView: Summary received - timeline segments: \(data.timeline.count)")
        logger.info("BehaviorView: Highlights - wake: \(data.highlights.wake.label), screen: \(data.highlights.screen.label), workout: \(data.highlights.workout.label), rumination: \(data.highlights.rumination.label)")
        
        summary = data
    } catch {
        logger.error("BehaviorView: Failed to load summary - \(error.localizedDescription)")
        errorText = String(localized: "behavior_error_failed_load")
    }
    isLoading = false
}
```

#### パッチ12-2: MetricsUploader.swift にログ追加

**ファイル**: `aniccaios/aniccaios/Services/MetricsUploader.swift`

```swift
// ============================================
// runUploadIfDue 関数の送信前に追加:
// ============================================

// ★ デバッグログ追加
logger.info("MetricsUploader: Payload keys: \(payload.keys.joined(separator: ", "))")
if let sleepStart = payload["sleep_start_at"] {
    logger.info("MetricsUploader: sleep_start_at = \(sleepStart)")
}
if let wakeAt = payload["wake_at"] {
    logger.info("MetricsUploader: wake_at = \(wakeAt)")
}
if let activitySummary = payload["activity_summary"] as? [String: Any] {
    logger.info("MetricsUploader: activity_summary keys: \(activitySummary.keys.joined(separator: ", "))")
    if let snsSessions = activitySummary["snsSessions"] as? [[String: Any]] {
        logger.info("MetricsUploader: snsSessions count: \(snsSessions.count)")
    }
}
```

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/src/modules/simulation/futureScenario.js` | OpenAI API エンドポイント修正、fallback の ifImprove を空に |
| `apps/api/src/modules/realtime/contextSnapshot.js` | sleepStartAt を today_stats に追加 |
| `apps/api/src/modules/insights/generateTodayInsight.js` | **新規作成**: AI Insight 生成関数 |
| `apps/api/src/modules/metrics/stateBuilder.js` | language パラメータ追加、pickTodayInsight の戻り値変更、getInsightFallback 追加 |
| `apps/api/src/routes/mobile/behavior.js` | language 引数追加、AI Insight 呼び出し |
| `apps/api/src/routes/mobile/realtime.js` | language 引数追加 |
| `aniccaios/.../FutureScenarioView.swift` | カード横幅・タイトル表示修正 |
| `aniccaios/.../HighlightsCard.swift` | ステータス文言削除、値表示 |
| `aniccaios/.../HealthKitManager.swift` | 睡眠クエリ日付範囲修正 |
| `aniccaios/.../WakePromptBuilder.swift` | プレフィックスローカライズ |
| `aniccaios/.../UserProfile.swift` | languageLine ハードコード、displayName 追加 |
| `aniccaios/.../VoiceSessionController.swift` | 言語別プロンプト読み込み、IDEAL_TRAITS ローカライズ |
| `aniccaios/.../BehaviorView.swift` | デバッグログ追加、待機時間1秒に延長 |
| `aniccaios/.../MetricsUploader.swift` | デバッグログ追加 |
| `aniccaios/.../Resources/Prompts/feeling_self_loathing_ja.txt` | **新規作成** |
| `aniccaios/.../Resources/Prompts/feeling_anxiety_ja.txt` | **新規作成** |
| `aniccaios/.../Resources/Prompts/feeling_irritation_ja.txt` | **新規作成** |
| `aniccaios/.../Resources/Prompts/feeling_free_conversation_ja.txt` | **新規作成** |

---

## 適用手順

### 1. バックエンド（apps/api）

1. `apps/api/src/modules/insights/` ディレクトリを作成
   ```bash
   mkdir -p apps/api/src/modules/insights
   ```

2. 新規ファイル `generateTodayInsight.js` を作成

3. 各ファイルのパッチを適用

4. デプロイ

### 2. iOS（aniccaios）

1. 各Swiftファイルのパッチを適用

2. 日本語プロンプトファイル（4ファイル）を `Resources/Prompts/` に作成

3. Xcodeでプロジェクトを開き、新規ファイルをターゲットに追加

4. ビルド・実行

---

## レビュー完了基準チェックリスト

- [ ] `futureScenario.js` の fetch URL が `https://api.openai.com/v1/chat/completions` に変更されている
- [ ] `futureScenario.js` の `fallback()` 関数で `ifImprove: ''` に変更されている
- [ ] `FutureScenarioView.swift` の isEmpty ケースで `frame(maxWidth: .infinity)` が適用されている
- [ ] `generateTodayInsight.js` が新規作成されている
- [ ] `behavior.js` で `generateTodayInsight()` を呼び出すロジックがある
- [ ] `contextSnapshot.js` の `today_stats` に `sleepStartAt` が追加されている
- [ ] `HealthKitManager.swift` のクエリ開始時刻が前日18時になっている
- [ ] `HealthKitManager.swift` の options が `[]` に変更されている
- [ ] `stateBuilder.js` の `buildHighlights()` に `language` パラメータがある
- [ ] `behavior.js` と `realtime.js` で `language: lang` が渡されている
- [ ] `HighlightsCard.swift` で `ui.label` の表示が削除されている
- [ ] `WakePromptBuilder.swift` で `preferredLanguage` を参照している
- [ ] `UserProfile.swift` で `languageLine` が `NSLocalizedString` を使わずハードコードされている
- [ ] `VoiceSessionController.swift` で `langSuffix` を使って言語別ファイルを読み込んでいる
- [ ] 日本語プロンプトファイル（4ファイル）が作成されている
- [ ] `BehaviorView.swift` と `MetricsUploader.swift` にデバッグログが追加されている

---

**最終更新**: 2025-12-26
