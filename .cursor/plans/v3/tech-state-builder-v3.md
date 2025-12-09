# tech-state-builder-v3.md

本書は v3 の **stateBuilder 仕様決定版（MDのみ）**。コード変更は行わない。  
対象ドメイン: Rhythm(Wake/Bedtime/MorningPhone), Screen, Movement, Mental/Feeling, Priority Habit。  
Big5・HealthKit・ScreenTime は必須で state に反映する。

---

## 1. 概要
stateBuilder は DP（Decision Point）評価時に、ユーザー状況を表す特徴量ベクトルを構築する。  
入力: `userId`, `now`, `tz`（IANA）。出力: ドメイン別 State struct。  
データソース: `daily_metrics`, `nudge_events`, `nudge_outcomes`, `user_traits`, `feeling_sessions`, `habit_logs`。  
- 権限未許可時は Health/ScreenTime 系特徴量を 0/false で埋め、nudgeIntensity を quiet とみなす（Profile許可が入れば即時通常化）。

参照すべきファイル:  
- `v3-data.md`（stateフィールド定義）  
- `tech-db-schema-v3.md`（テーブル定義）  
- `v3-stack-nudge.md`（DPとstateの利用箇所）

---

## 2. 共通フィールドの取得元

| フィールド | 型 | データソース | 取得方法 |
|-----------|---|-------------|---------|
| `localHour` | number | システム時刻 | `now.tz(tz).hour()` |
| `dayOfWeek` | number | システム時刻 | `now.tz(tz).day()` (0=Sun) |
| `sleepDebtHours` | number | `daily_metrics` | `avg7dSleepHours - lastNightSleepHours`（上限 ±5h でクリップ） |
| `snsMinutesToday` | number | `daily_metrics.snsMinutesTotal` | 当日行 |
| `stepsToday` | number | `daily_metrics.steps` | 当日行 |
| `sedentaryMinutesToday` | number | `daily_metrics.sedentaryMinutes` | 当日行 |
| `big5` | object | `user_traits.big5` | {O,C,E,A,N} を 0-100 → 0-1 に正規化 |
| `struggles` | string[] | `user_traits.struggles` | そのまま |
| `nudgeIntensity` | string | `user_traits.nudgeIntensity` | quiet/normal/active |
| `recentFeelingCounts` | object | `daily_metrics.mindSummary.feelingCounts` | 例 `{self_loathing: n, anxiety: n}` |
| `recentFeelingSessions` | object | `feeling_sessions` | 直近1件 `{feelingId, emaBetter}` |

SQL/Prisma例（共通）:
```sql
-- 当日行取得 (tz はアプリ側で渡すローカル日付にマッピング済み)
SELECT * FROM daily_metrics
WHERE user_id = $1 AND date = $2::date;

-- 過去7日取得
SELECT * FROM daily_metrics
WHERE user_id = $1 AND date BETWEEN ($2::date - interval '6 days') AND $2::date
ORDER BY date DESC;
```
```typescript
const metrics7d = await prisma.dailyMetric.findMany({
  where: { userId, date: { gte: startDate, lte: today } },
  orderBy: { date: 'desc' },
});
const traits = await prisma.userTrait.findUnique({ where: { userId } });
```

---

## 3. buildWakeState(userId, now, tz)

### 入出力
- 入力: `userId`, `now: Date`, `tz: string`
- 出力: `WakeState`

### データソース
- `daily_metrics` 過去7日（sleepStartAt, wakeAt, sleepDurationMin, snsMinutesNight）
- `nudge_events`/`nudge_outcomes`（domain='rhythm', subtype in ['wake','bedtime']）
- `user_traits`
- 直近 feeling: `daily_metrics.mindSummary.feelingCounts`

### フィールドと算出
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `localHour` | number | `now.tz(tz).hour()` |
| `dayOfWeek` | number | `now.tz(tz).day()` |
| `avgWake7d` | number | `avg(wakeAt.hour)` 過去7日 (欠損除外) |
| `avgBedtime7d` | number | `avg(sleepStartAt.hour)` 過去7日 |
| `sleepDebtHours` | number | `avg7dSleepHours - lastNightSleepHours` |
| `wakeSuccessRate7d` | number | `success / total` from nudge_outcomes (subtype='wake', last 7d) |
| `bedtimeSuccessRate7d` | number | 同上 subtype='bedtime' |
| `snsMinutesLast60min` | number | DeviceActivity 集計を `daily_metrics.activitySummary.snsSessions` から直近セッションの60分内合計 |
| `snsLongUseAtNight` | boolean | `snsMinutesNight >= 30` (当日行) |
| `big5` / `struggles` / `nudgeIntensity` | object/string[]/string | `user_traits` |
| `recentFeelingCounts.self_loathing` | number | mindSummary から該当キーを取得（無ければ0） |

### Prisma/SQL スニペット
```sql
-- wakeSuccessRate7d
SELECT
  COUNT(*) FILTER (WHERE no.reward = 1) ::float /
  NULLIF(COUNT(*),0) AS wake_success_rate_7d
FROM nudge_events ne
LEFT JOIN nudge_outcomes no ON no.nudge_event_id = ne.id
WHERE ne.user_id = $1
  AND ne.subtype = 'wake'
  AND ne.created_at >= ($2::timestamptz - interval '7 days');
```

### 擬似コード
```typescript
async function buildWakeState(userId: string, now: Date, tz: string): Promise<WakeState> {
  const [metrics7d, traits] = await Promise.all([getMetrics7d(userId, now, tz), getTraits(userId)]);
  const today = metrics7d[0];
  return {
    localHour: toLocalHour(now, tz),
    dayOfWeek: toLocalDOW(now, tz),
    avgWake7d: calcAvgHour(metrics7d, 'wakeAt'),
    avgBedtime7d: calcAvgHour(metrics7d, 'sleepStartAt'),
    sleepDebtHours: calcSleepDebt(metrics7d),
    wakeSuccessRate7d: await fetchSuccessRate(userId, 'wake', now),
    bedtimeSuccessRate7d: await fetchSuccessRate(userId, 'bedtime', now),
    snsMinutesLast60min: calcSnsLast60(today?.activitySummary),
    snsLongUseAtNight: (today?.snsMinutesNight ?? 0) >= 30,
    big5: normalizeBig5(traits?.big5),
    struggles: traits?.struggles ?? [],
    nudgeIntensity: traits?.nudgeIntensity ?? 'normal',
    recentFeelingCounts: today?.mindSummary?.feelingCounts ?? {},
  };
}
```

---

## 4. buildMorningPhoneState(userId, now, tz)
（Rhythm内の起床後スマホ依存 DP 用）

### データソース
- `daily_metrics` 当日（wakeAt, snsMinutesTotal, mindSummary）
- `daily_metrics.activitySummary.snsSinceWake` など起床後セッション集計
- `user_traits`

### フィールド
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `timeSinceWakeMinutes` | number | `diffMinutes(now, wakeAt)` 当日 |
| `snsMinutesSinceWake` | number | `activitySummary.snsSinceWake` |
| `sleepDebtHours` | number | 共通 |
| `big5` | object | 共通 |
| `struggles` | string[] | 共通 |

### Prisma例
```typescript
const today = await prisma.dailyMetric.findUnique({ where: { userId_date: { userId, date: localDate } }});
```

---

## 5. buildScreenState(userId, now, tz)

### データソース
- `daily_metrics` 当日（snsMinutesTotal）
- `daily_metrics.activitySummary.snsSessions`（各セッションの start/end/totalMinutes）
- `user_traits`, `daily_metrics.mindSummary`
- `nudge_events`/`nudge_outcomes`（subtype='sns_long' 等）

### フィールド
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `localHour` | number | 共通 |
| `dayOfWeek` | number | 共通 |
| `snsCurrentSessionMinutes` | number | `latestSession.totalMinutes` |
| `snsMinutesToday` | number | `daily_metrics.snsMinutesTotal` |
| `sleepDebtHours` | number | 共通 |
| `big5` | object | 共通 |
| `struggles` | string[] | 共通 |
| `recentFeelingCounts` | object | mindSummary.feelingCounts |

### SQL例（最新セッション抽出: activitySummary を JSONB として保持する場合）
```sql
SELECT (jsonb_path_query_first(activity_summary, '$.snsSessions[-1].totalMinutes')::text)::int AS sns_current_session_minutes
FROM daily_metrics
WHERE user_id = $1 AND date = $2::date;
```

---

## 6. buildMovementState(userId, now, tz)

### データソース
- `daily_metrics` 当日（sedentaryMinutes, steps, activitySummary.walkRunSessions）
- `user_traits`
- `nudge_events/outcomes`（subtype='sedentary'）

### フィールド
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `sedentaryMinutesCurrent` | number | `activitySummary.sedentaryStreak.currentMinutes` |
| `sedentaryMinutesToday` | number | `daily_metrics.sedentaryMinutes` |
| `stepsToday` | number | `daily_metrics.steps` |
| `recentActivityEvents` | JSON | `activitySummary.walkRunSessions` |
| `sleepDebtHours` | number | 共通 |
| `big5` | object | 共通 |
| `struggles` | string[] | 共通 |

Prisma例:
```typescript
const today = await prisma.dailyMetric.findUnique({ where: { userId_date: { userId, date: localDate } }});
const sedentaryCurrent = today?.activitySummary?.sedentaryStreak?.currentMinutes ?? 0;
```

---

## 7. buildMentalState(userId, feelingId, now, tz)

### データソース
- `feeling_sessions`（過去7日 count）
- `daily_metrics.mindSummary.feelingCounts`
- `daily_metrics` 当日（sleepDebt, snsMinutesTotal）
- `user_traits`
- mem0 は state ではなく LLМ文脈用（参照のみ）

### フィールド
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `localHour` | number | 共通 |
| `dayOfWeek` | number | 共通 |
| `feelingId` | string | 入力値 |
| `recentFeelingCount` | number | 当日 mindSummary.feelingCounts[feelingId] |
| `recentFeelingCount7d` | number | `COUNT(*)` from feeling_sessions last 7d |
| `sleepDebtHours` | number | 共通 |
| `snsMinutesToday` | number | 共通 |
| `ruminationProxy` | number | 論文ベースの算出式（下記セクション7.1参照）0-1 |
| `big5` | object | 共通 |
| `struggles` | string[] | 共通 |

SQL例:
```sql
SELECT COUNT(*) AS feeling_count_7d
FROM feeling_sessions
WHERE user_id = $1 AND feeling_id = $2
  AND started_at >= ($3::timestamptz - interval '7 days');
```

### 7.1 ruminationProxy 算出式（論文ベース）

#### 根拠論文
- **Jacobucci et al. (2025)** "Passive vs Active Nighttime Smartphone Use as Markers of Next-Day Suicide Risk" - JAMA Network Open
- 79人を28日間追跡、5秒ごとのスクリーンショットで使用パターンを分析
- **主な知見**:
  1. 夜23時〜深夜1時のスマホ使用が翌日の精神状態悪化と最も強く相関
  2. パッシブ使用（スクロール）は悪影響、アクティブ使用（入力）は改善傾向
  3. 7-9時間の無使用時間がある人は精神状態が良好

#### データソース
| フィールド | 取得元 | 説明 |
|-----------|--------|------|
| `lateNightSnsMinutes` | DeviceActivity | 23:00-01:00のSNSカテゴリ使用分数 |
| `snsMinutes` | DeviceActivity | 当日のSNSカテゴリ合計分数 |
| `totalScreenTime` | DeviceActivity | 当日の全カテゴリ合計分数 |
| `sleepWindowPhoneMinutes` | DeviceActivity + HealthKit | 就寝〜起床間のスマホ使用分数 |
| `longestNoUseHours` | DeviceActivity | 24時間内の最長未使用時間（時） |

#### 算出式

```typescript
/**
 * ruminationProxy: 反芻思考の代理指標（0.0 - 1.0）
 * 
 * 構成要素:
 * 1. 夜間SNS使用（23:00-01:00）- 重み0.4
 *    → 論文: この時間帯の使用が最もリスクと相関
 * 2. SNS割合（パッシブ使用のproxy）- 重み0.3
 *    → 論文: SNS=主にスクロール、パッシブ使用の代理
 * 3. 睡眠時間帯の使用 - 重み0.3
 *    → 論文: 睡眠中の覚醒とスマホ使用は精神状態悪化の指標
 * 4. 十分な無使用時間（7-9時間）- ボーナス
 *    → 論文: 適切な睡眠/デジタル休息の指標
 */
function calculateRuminationProxy(data: {
  lateNightSnsMinutes: number;      // 23:00-01:00のSNS使用分数
  snsMinutes: number;               // 当日SNS合計分数
  totalScreenTime: number;          // 当日スクリーンタイム合計分数
  sleepWindowPhoneMinutes: number;  // 就寝-起床間の使用分数
  longestNoUseHours: number;        // 最長未使用時間（時）
}): number {
  // 1. 夜間SNS使用スコア（60分で上限、重み0.4）
  const lateNightScore = Math.min(data.lateNightSnsMinutes / 60, 1.0) * 0.4;
  
  // 2. SNS割合スコア（パッシブ使用のproxy、重み0.3）
  const snsRatio = data.totalScreenTime > 0 
    ? data.snsMinutes / data.totalScreenTime 
    : 0;
  const snsScore = snsRatio * 0.3;
  
  // 3. 睡眠時間帯使用スコア（30分で上限、重み0.3）
  const sleepWindowScore = Math.min(data.sleepWindowPhoneMinutes / 30, 1.0) * 0.3;
  
  // 4. 十分な無使用時間ボーナス（7-9時間でマイナス補正）
  const restBonus = (data.longestNoUseHours >= 7 && data.longestNoUseHours <= 9) 
    ? -0.2 
    : 0;
  
  // 最終スコア（0.0 - 1.0 にクリップ）
  return Math.max(0, Math.min(1, lateNightScore + snsScore + sleepWindowScore + restBonus));
}
```

#### 制約事項
- **パッシブ/アクティブ使用の区別は取得不可**: iOS APIではキーボード入力 vs スクロールの区別ができない
- **代替手法**: SNSアプリ使用 = パッシブ、メッセージアプリ使用 = アクティブとして近似
- **欠損時**: DeviceActivity権限がない場合は `ruminationProxy = 0` とし、nudgeIntensity を quiet 扱い

- 権限未許可/欠損時は ruminationProxy=0、nudgeIntensity=quiet で扱う。

---

## 8. buildHabitState(userId, habitId, now, tz)

### データソース
- `habit_logs`（status success/missed）
- `user_traits`

### フィールド
| フィールド | 型 | 取得/算出 |
|-----------|---|-----------|
| `habitId` | string | 入力値 |
| `habitMissedStreak` | number | 連続 missed 日数 |
| `habitSuccessStreak` | number | 連続 success 日数 |
| `localHour` | number | 共通 |
| `big5` | object | 共通 |
| `struggles` | string[] | 共通 |

SQL例:
```sql
-- 直近の streak を計算（例: missed streak）
SELECT COUNT(*) AS missed_streak
FROM (
  SELECT status
  FROM habit_logs
  WHERE user_id = $1 AND habit_id = $2
  ORDER BY occurred_on DESC
  LIMIT 30
) t
WHERE status = 'missed'
  AND NOT EXISTS (
    SELECT 1 FROM habit_logs h
    WHERE h.user_id = $1 AND h.habit_id = $2
      AND h.occurred_on > t.occurred_on AND h.status = 'success'
  );
```

---

## 9. 正規化ルール（bandit へ渡す前）

- 最終フィーチャ配列と正規化を本節に固定し、featureOrderHash をここで生成する。

- サーバ起動時に bandit_models.meta.featureOrderHash と突合し、不一致なら起動エラーとする。

| フィールド | 正規化方法 | 範囲 |
|-----------|-----------|------|
| `localHour` | `sin/cos(2π * hour/24)` 2次元へ展開 | -1〜1 |
| `dayOfWeek` | one-hot(7) | 0/1 |
| `sleepDebtHours` | clip to [-5,5] そのまま | -5〜5 |
| `wakeSuccessRate7d` / `bedtimeSuccessRate7d` | そのまま | 0〜1 |
| `snsMinutesToday` | `min(value,600)/600` | 0〜1 |
| `snsCurrentSessionMinutes` | `min(value,90)/90` | 0〜1 |
| `sedentaryMinutesCurrent` | `min(value,180)/180` | 0〜1 |
| `stepsToday` | `min(steps,15000)/15000` | 0〜1 |
| `big5` | 0-100 → `/100` | 0〜1 |
| `recentFeelingCount`/`recentFeelingCount7d` | `min(v,10)/10` | 0〜1 |
| `habitMissedStreak`/`habitSuccessStreak` | `min(v,7)/7` | 0〜1 |

---

## 10. キャッシュ/更新方針
- `daily_metrics`: 1日1回バッチ + 必要に応じてオンデマンド。stateBuilderは **毎回 DB 取得（キャッシュなし）**。
- `user_traits`: Profile更新時のみ変更。stateBuilderは毎回取得しても軽量。
- `nudge_events/outcomes`: 成功率計算で7日分を都度集計。
- `feeling_sessions`: 7日分カウントを都度集計。
- `habit_logs`: 30日以内を都度取得し streak 計算。

---

## 11. 実装上のガード
- タイムゾーン境界: `date` はユーザーTZで丸めてからクエリする（UTC 日付ではなくローカル日付）。
- 欠損値: null は 0/false で埋め、正規化前にクリップ。
- デバイス側リアルタイム値（DeviceActivity/HealthKit）の最新分はバックエンド収集ジョブで `daily_metrics.activitySummary` に追記し、stateBuilderは JSONB から読む。
- Big5/struggles/nudgeIntensity は必ず state に含める（パーソナライズ必須）。

---

## 12. DP ↔ builder 対応表
- Rhythm 起床 DP → `buildWakeState`
- Rhythm 就寝 DP → `buildWakeState`（同 State を流用、bedtimeSuccessRate 使用）
- Morning Phone DP → `buildMorningPhoneState`
- Screen/SNS 30/60min DP → `buildScreenState`
- Movement 座位90min DP → `buildMovementState`
- Priority Habit follow-up DP → `buildHabitState`
- Feeling EMI（自己嫌悪/不安 等） → `buildMentalState`

---

## 13. 今後の拡張メモ
- ruminationProxy は論文ベースの算出式を v3 で実装済み（セクション7.1参照）。将来的に mem0 感情発話頻度を追加入力として精度向上を検討。
- screen/movement のリアルタイムセッションテーブルを追加する場合は view `screen_time_sessions` / `activity_sessions` を作り stateBuilder は view を参照するだけにする。
- bandit 入力ベクトルはここで定義した正規化を固定し、`tech-bandit-v3.md` で次元順序を再掲する。

---

## 14. featureOrderHash の生成

banditモデルとstateBuilderの特徴量順序の一致を検証するため、以下の手順でハッシュを生成する。

### 14.1 目的
- stateBuilder と bandit で特徴量の順序がずれると、学習が破綻する
- モデルロード時にハッシュを比較し、不一致なら起動エラーとする

### 14.2 生成コード（TypeScript）

```typescript
import { createHash } from 'crypto';

function generateFeatureOrderHash(domain: string): string {
  // 共通フィールド（順序固定）
  const commonFields = [
    'bias',
    'localHour_sin', 'localHour_cos',
    'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6',
    'sleepDebtHours',
    'snsMinutesToday_norm',
    'stepsToday_norm',
    'sedentaryMinutesToday_norm',
    'big5_O', 'big5_C', 'big5_E', 'big5_A', 'big5_N',
    'struggle_late_sleep', 'struggle_sns_addiction', 'struggle_self_loathing',
    'struggle_anxiety', 'struggle_anger', 'struggle_jealousy',
    'struggle_sedentary', 'struggle_procrastination', 'struggle_perfectionism', 'struggle_burnout',
    'nudge_quiet', 'nudge_normal', 'nudge_active',
    'feeling_self_loathing_norm', 'feeling_anxiety_norm'
  ];
  
  // ドメイン固有フィールド（domain別に追加）
  const domainFields: Record<string, string[]> = {
    rhythm_wake: ['avgWake7d_norm', 'avgBedtime7d_norm', 'wakeSuccessRate7d', 'bedtimeSuccessRate7d', 'snsMinutesLast60_norm', 'snsLongUseAtNight'],
    rhythm_bedtime: ['avgWake7d_norm', 'avgBedtime7d_norm', 'wakeSuccessRate7d', 'bedtimeSuccessRate7d', 'snsMinutesLast60_norm', 'snsLongUseAtNight'],
    morning_phone: ['timeSinceWake_norm', 'snsMinutesSinceWake_norm'],
    screen: ['snsCurrentSessionMinutes_norm'],
    movement: ['sedentaryMinutesCurrent_norm', 'recentActivityEvents_flag'],
    habit: ['habitId_onehot', 'habitMissedStreak_norm', 'habitSuccessStreak_norm'],
    mental: ['feelingId_onehot', 'recentFeelingCount_norm', 'recentFeelingCount7d_norm', 'ruminationProxy_norm'],
  };
  
  const fields = [...commonFields, ...(domainFields[domain] || [])];
  return createHash('sha256').update(fields.join(',')).digest('hex').slice(0, 16);
}

// 使用例
const wakeHash = generateFeatureOrderHash('rhythm_wake');
// → "a1b2c3d4e5f67890" のような16文字のハッシュ
```

### 14.3 検証タイミング
1. **サーバー起動時**: `bandit_models` から各ドメインのモデルをロード
2. **ハッシュ比較**: `model.meta.featureOrderHash === generateFeatureOrderHash(domain)`
3. **不一致時**: 起動エラー（ログに警告を出力し、モデルを再初期化するか手動対応を要求）

### 14.4 注意事項
- 特徴量を追加・削除する場合は、`featureOrderHash` が変わるため、既存モデルは再初期化が必要
- v3.x 内での互換性を保つため、特徴量順序の変更は避ける（末尾追加のみ許容）

