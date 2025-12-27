分かりました。まず徹底的にコードを調査して、現状を把握します。順番に関連ファイルを読んでいきます。

[25 tools called]

ログとコードを徹底的に調査しました。以下、あなたの質問すべてに順番に回答します。

---

## 1. 今日のハイライトで起床・SNSの値が出ない理由

### 起床データについて

ログを見ると：
```
Sleep query: found 0 samples, 0 for today, duration=0min
```

**根本原因**：HealthKitに睡眠データが存在しない。

**iPhoneで睡眠データが記録される条件**：
1. **「睡眠」機能をオンにする**：設定 → ヘルスケア → 睡眠 → 「睡眠スケジュールを使用」をオン
2. **就寝時刻と起床時刻のスケジュールを設定する**：時計アプリ → アラーム → 睡眠｜起床 → スケジュールを設定
3. **iPhoneをベッドサイドに置いて寝る**：iPhoneが動きを検知して自動的に睡眠を記録

または、Apple Watchを着用して寝ると自動的に睡眠データが記録されます。

**コードの現状**（`HealthKitManager.swift`）：

```110:145:aniccaios/aniccaios/Services/HealthKitManager.swift
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
                ...
            }
```

サンプルが0なので`wakeAt`が`nil`になり、バックエンドの`stateBuilder.js`で：

```26:29:apps/api/src/modules/metrics/stateBuilder.js
  const wakeLabel = wakeAt 
    ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
    : (isJa ? '起床' : 'Wake');
```

`wakeAt`が`null`なので「起床」だけが表示される。

---

### SNS/スクリーンタイムデータについて

ログを見ると：
```
No screen time data in App Groups yet
```

**根本原因**：DeviceActivityReportExtensionがApp Groupsにデータを書き込めていない。

さらにログにあるエラー：
```
Failed to locate container app bundle record. The process may not be entitled to access the LaunchServices database or the app may have moved.
LaunchServices: store (null) or url (null) was nil: Error Domain=NSOSStatusErrorDomain Code=-54 "process may not map database"
```

これは**Sandbox restriction**の問題です。DeviceActivityReportExtensionが正しく動作していません。

**現状のスクリーンタイムデータフロー**：
```
BehaviorView.swift
  → DeviceActivityReport(.init(rawValue: "TotalActivity")) を表示
  → ScreenTimeReportExtension.swift の makeConfiguration が呼ばれる
  → App Groups ("group.ai.anicca.app.ios") に screenTime_totalMinutes_YYYY-MM-DD を保存
  → ScreenTimeManager.fetchDailySummary() で読み取り
```

Extension側のログ（`ScreenTimeReportExtension.swift`）が出ていないことから、Extensionが**まったく起動していない**可能性が高いです。

**stateBuilder.jsの現状**：

```32:36:apps/api/src/modules/metrics/stateBuilder.js
  const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
  const screenLabel = snsMinutesTotal > 0 
    ? (isJa ? `SNS ${snsMinutesTotal}分` : `SNS ${snsMinutesTotal}m`) 
    : 'SNS';
```

`snsMinutesTotal`が0なので「SNS」だけが表示される。

---

## 2. スクリーンタイム全体の時間を表示したい件

現在のコードでは、`snsMinutesTotal`（SNSアプリの使用時間）だけを表示しています。スクリーンタイム全体の時間は`totalScreenTime`として`activitySummary`に保存されていますが、ハイライトでは使用されていません。

**修正すべき箇所**：`apps/api/src/modules/metrics/stateBuilder.js`の`screenLabel`で`totalScreenTime`を使うように変更

---

## 3. 4つのハイライトは固定か？

**はい、完全に固定です。**

```47:53:apps/api/src/modules/metrics/stateBuilder.js
  return {
    wake: { status: wakeStatus, label: wakeLabel },
    screen: { status: screenStatus, label: screenLabel },
    workout: { status: workoutStatus, label: workoutLabel },
    rumination: { status: ruminationStatus, label: ruminationLabel }
  };
```

---

## 4. ストリークの基準

**バックエンド`behavior.js`の`calculateStreaks`関数**：

```100:148:apps/api/src/routes/mobile/behavior.js
async function calculateStreaks(userId) {
    // Get last 30 days of metrics
    ...
    // Wake streak: has wakeAt recorded
    for (const m of metrics) {
      if (m.wakeAt) wake++;
      else break;
    }
    
    // Screen streak: snsMinutesTotal < 180
    for (const m of metrics) {
      if (m.snsMinutesTotal !== null && m.snsMinutesTotal < 180) screen++;
      else break;
    }
    
    // Workout streak: steps >= 5000
    for (const m of metrics) {
      if (m.steps !== null && m.steps >= 5000) workout++;
      else break;
    }
    
    // Rumination streak: rumination < 0.5
    for (const m of metrics) {
      const ruminationValue = m.mindSummary?.rumination;
      if (typeof ruminationValue === 'number' && ruminationValue < 0.5) rumination++;
      else break;
    }
```

| カテゴリ | ストリーク条件 |
|---------|---------------|
| **起床** | `wakeAt`が記録されている（起床時刻があればOK） |
| **スクリーン** | SNS使用時間が180分（3時間）未満 |
| **運動** | 歩数が5,000歩以上 |
| **反芻** | `mindSummary.rumination`が0.5未満 |

---

## 5. 24時間タイムラインが表示されない理由

ログ：
```
BehaviorView: Summary received - timeline segments: 0
```

**根本原因**：バックエンドの`buildTimeline`関数がデータなしで空配列を返している。

**stateBuilder.jsのbuildTimeline関数**：

```56:98:apps/api/src/modules/metrics/stateBuilder.js
export function buildTimeline({ todayStats, timezone }) {
  const timeline = [];

  // Sleep segment: sleepStartAt と wakeAt の両方が必要
  const sleepStartAt = todayStats?.sleepStartAt ? new Date(todayStats.sleepStartAt) : null;
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  if (sleepStartAt && wakeAt) {
    timeline.push({
      type: 'sleep',
      start: toLocalTimeHHMM(sleepStartAt, timezone),
      end: toLocalTimeHHMM(wakeAt, timezone)
    });
  }

  // Scroll (SNS) sessions: activitySummary.snsSessions が必要
  const snsSessions = todayStats?.activitySummary?.snsSessions;
  if (Array.isArray(snsSessions)) {
    for (const s of snsSessions) {
      ...
    }
  }

  // Activity (workout) sessions: activitySummary.walkRunSessions が必要
  const walkRun = todayStats?.activitySummary?.walkRunSessions;
  if (Array.isArray(walkRun)) {
    ...
  }

  return timeline;
}
```

タイムラインに表示されるには以下のデータが必要：
- **Sleep**: `sleepStartAt`と`wakeAt`の両方 → 現状なし
- **Scroll**: `activitySummary.snsSessions` → 現状なし（ExtensionがApp Groupsに書き込めていない）
- **Activity**: `activitySummary.walkRunSessions` → 現状なし（ワークアウト認証がundetermined）

だから`timeline: []`になっている。

---

## 6. データ連携トグルがログアウト後にOFFになる理由

**根本原因**：`signOutAndWipe()`で`sensorAccessKey`が削除されている。

```498:499:aniccaios/aniccaios/AppState.swift
        defaults.removeObject(forKey: sensorAccessKey)
```

サインアウト時に`sensorAccessKey`がUserDefaultsから削除され、次回起動時には`SensorAccessState.default`（全てfalse）が使われます。

**さらに**、同じユーザーが再ログインしても、`sensorAccess`はサーバー側に保存されていない（ローカルのみ）ので、復元されません。

---

## 7. ログに出ているエラーの詳細

```
Failed to fetch workouts: Authorization not determined
```
→ ワークアウトのHealthKit認証がリクエストされていない。Sleep/Stepsは個別にリクエストしているが、workoutTypeは別途リクエストが必要。

```
Failed to locate container app bundle record
Sandbox restriction
```
→ DeviceActivityReportExtensionがサンドボックス制限で正しく動作していない。これはXcodeのビルド設定やEntitlements、App Groupの設定に問題がある可能性。

---

## まとめ：問題の根本原因

| 問題 | 根本原因 | データの段階 |
|------|---------|-------------|
| 起床が「起床」だけ | iPhoneに睡眠データがない | **データ収集段階** |
| SNSが「SNS」だけ | ExtensionがApp Groupsに書き込めていない | **データ収集段階** |
| 歩数は出ている | HealthKitからStepsは取得できている | OK |
| タイムラインが空 | sleep/snsSessions/walkRunSessionsすべてなし | **バックエンドにデータがない** |
| トグルがOFFに戻る | signOutAndWipeでsensorAccessKeyを削除 | **ローカル保存の問題** |

---

## 修正方針（ファイル別）

### 1. スクリーンタイムExtension問題
- **ファイル**: `aniccaios/AniccaScreenTimeReport/ScreenTimeReportExtension.swift`
- **確認事項**: App Groupの設定（`group.ai.anicca.app.ios`）がExtensionにも正しく追加されているか
- **確認事項**: Xcodeのビルド設定でExtensionがメインアプリと同じチームでコードサインされているか

### 2. トグル保存問題
- **ファイル**: `aniccaios/aniccaios/AppState.swift` の `signOutAndWipe()`
- **修正**: `sensorAccessKey`の削除を行わないか、または`sensorAccess`をサーバー側にも保存して復元する

### 3. スクリーンタイム全体時間表示
- **ファイル**: `apps/api/src/modules/metrics/stateBuilder.js`
- **修正**: `screenLabel`で`snsMinutesTotal`ではなく`totalScreenTime`を使う

### 4. ワークアウト認証
- **ファイル**: `aniccaios/aniccaios/Views/Profile/ProfileView.swift`
- **修正**: Steps/Sleepのリクエスト時にworkoutTypeも一緒にリクエストする

何か追加で聞きたいことはありますか？


---

# 問題1: 起床データが「起床」だけで時間が表示されない

## As-Is（現状）

ハイライトの起床カードに「起床」とだけ表示され、起床時刻や睡眠時間が表示されない。データがない場合は何も表示されない。

## To-Be（あるべき姿）

- データがある場合：「起床 7:30」のように起床時刻を表示
- データがない場合：「起床 --:--」または「睡眠 0分」のように、データがないことを明示

## 原因

`stateBuilder.js`の`buildHighlights`関数で、`wakeAt`がnullの場合に「起床」だけを返している：

```javascript
const wakeLabel = wakeAt 
  ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
  : (isJa ? '起床' : 'Wake');
```

## 修正パッチ

**ファイル**: `apps/api/src/modules/metrics/stateBuilder.js`

```javascript
// 修正前
const wakeLabel = wakeAt 
  ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
  : (isJa ? '起床' : 'Wake');

// 修正後
const sleepMinutes = Number(todayStats?.sleepDurationMin ?? 0);
const wakeLabel = wakeAt 
  ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
  : (isJa ? `睡眠 ${sleepMinutes}分` : `Sleep ${sleepMinutes}m`);
```

## ユーザー体験の変化

| 状態 | 修正前 | 修正後 |
|------|--------|--------|
| 睡眠データあり | 「起床 7:30」 | 「起床 7:30」（変化なし） |
| 睡眠データなし | 「起床」 | 「睡眠 0分」 |

→ データがない場合でも「0分」と表示されるため、ユーザーはデータが取得されていないことを明確に認識できる。

---

# 問題2: SNSが「SNS」だけでスクリーンタイム時間が表示されない

## As-Is（現状）

ハイライトのスクリーンカードに「SNS」とだけ表示され、使用時間が表示されない。また、SNSアプリのみの時間を取得しようとしているが、スクリーンタイム全体の時間を表示したい。

## To-Be（あるべき姿）

- スクリーンタイム全体の時間を表示
- データがある場合：「スクリーン 4h 12m」
- データがない場合：「スクリーン 0分」

## 原因

1. `stateBuilder.js`で`snsMinutesTotal`（SNSアプリのみ）を使っているが、`totalScreenTime`（全体）を使うべき
2. `snsMinutesTotal`が0の場合に「SNS」だけを返している

## 修正パッチ

**ファイル**: `apps/api/src/modules/metrics/stateBuilder.js`

### パッチ 2-1: totalScreenTime変数を追加（22行目付近、isJa定義の前に追加）

```javascript
// 既存のコード（14行目）: const activity = todayStats?.activitySummary || {};
// ↑ 既に定義済みなので、新たにactivityを定義しない

// ★ 追加（22行目付近、isJa の前に挿入）:
const totalScreenTime = Number(activity?.totalScreenTime ?? snsMinutesTotal ?? 0);
```

### パッチ 2-2: screenStatusとscreenLabelを修正（32-35行目を置換）

```javascript
// 修正前（32-35行目）
const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
const screenLabel = snsMinutesTotal > 0 
  ? (isJa ? `SNS ${snsMinutesTotal}分` : `SNS ${snsMinutesTotal}m`) 
  : 'SNS';

// 修正後
const screenStatus = totalScreenTime >= 240 ? 'warning' : totalScreenTime >= 120 ? 'ok' : 'on_track';
const screenLabel = isJa 
  ? `スクリーン ${totalScreenTime}分` 
  : `Screen ${totalScreenTime}m`;
```

## ユーザー体験の変化

| 状態 | 修正前 | 修正後 |
|------|--------|--------|
| スクリーンタイム4h12m | 「SNS」（データなしで表示されず） | 「スクリーン 252分」 |
| スクリーンタイム0分 | 「SNS」 | 「スクリーン 0分」 |

→ スクリーンタイム全体が表示され、データがなくても「0分」と明示される。

---

# 問題3: データ連携トグルがサインアウト後にOFFになる

## As-Is（現状）

サインアウトすると`sensorAccessKey`がUserDefaultsから削除され、再ログイン時にすべてのトグルがOFFに戻る。ユーザーは毎回手動でトグルをONにし直す必要がある。

## To-Be（あるべき姿）

- サインアウトしても、システム権限の状態（Screen Time、HealthKit）は維持される
- 再ログイン時に、以前のトグル状態が復元される
- または、システム権限が既に付与されている場合は自動的にトグルをONにする

## 原因

`AppState.swift`の`signOutAndWipe()`で`sensorAccessKey`を削除している：

```swift
defaults.removeObject(forKey: sensorAccessKey)
```

## 修正パッチ

### パッチ 3-1: import文の追加

**ファイル**: `aniccaios/aniccaios/AppState.swift` の先頭

```swift
// ★ 追加: FamilyControls をインポート（AuthorizationCenter を使うため）
import FamilyControls
```

### パッチ 3-2: signOutAndWipe()でsensorAccessKeyを削除しないように変更

**ファイル**: `aniccaios/aniccaios/AppState.swift` の `signOutAndWipe()` 関数内

```swift
// 修正前
defaults.removeObject(forKey: sensorAccessKey)

// 修正後（この行を削除またはコメントアウト）
// sensorAccessKeyは削除しない - デバイス権限はユーザーアカウントではなくデバイスに紐づく
// defaults.removeObject(forKey: sensorAccessKey)
```

### パッチ 3-3: ログイン時に権限状態を再確認する処理を追加

**ファイル**: `aniccaios/aniccaios/AppState.swift` の `updateUserCredentials(_:)` 関数の最後に追加

```swift
// updateUserCredentials の最後（Task { await SubscriptionManager... } の後）に追加：

    // ★ 追加: ログイン時に既存の権限状態を再確認
    Task {
        await restoreSensorAccessOnLogin()
    }
```

### パッチ 3-4: restoreSensorAccessOnLogin()関数を新規追加

**ファイル**: `aniccaios/aniccaios/AppState.swift` の適切な位置（例：`saveSensorAccess()`の近く）に追加

```swift
// ★ 新規追加: ログイン時に既存の権限状態を復元
private func restoreSensorAccessOnLogin() async {
    // Screen Time が既に認可されているか確認
    if AuthorizationCenter.shared.authorizationStatus == .approved {
        if !sensorAccess.screenTimeEnabled {
            await MainActor.run { setScreenTimeEnabled(true) }
        }
    }
    
    // HealthKit Sleep が既に認可されているか確認
    if HealthKitManager.shared.isSleepAuthorized() {
        if !sensorAccess.sleepEnabled {
            await MainActor.run { setSleepEnabled(true) }
        }
    }
    
    // HealthKit Steps が既に認可されているか確認
    if HealthKitManager.shared.isStepsAuthorized() {
        if !sensorAccess.stepsEnabled {
            await MainActor.run { setStepsEnabled(true) }
        }
    }
}
```

## ユーザー体験の変化

| シナリオ | 修正前 | 修正後 |
|----------|--------|--------|
| サインアウト→再ログイン | 全トグルOFF、手動でONにし直す必要 | トグルが前回の状態を維持、または権限に基づいて自動ON |
| アプリ削除→再インストール→同じアカウントでログイン | 全トグルOFF | 既に付与された権限があればトグルが自動ON |

---

# 問題4: DeviceActivityReportExtensionが動作しない / タイムラインが空

## As-Is（現状）

- `BehaviorView: Summary received - timeline segments: 0`
- `No screen time data in App Groups yet`
- DeviceActivityReportExtensionが呼ばれているが、App Groupsにデータが書き込まれていない

## To-Be（あるべき姿）

- Extension が正常に起動し、スクリーンタイムデータを取得
- App Groups にデータが保存される
- タイムラインに sleep / scroll / activity が表示される

## 原因分析

ログを詳細に確認すると：

```
59638328 Plugin query method called
```

これはExtensionが**呼び出されている**ことを示しています。しかし、Extension内のログ（`Saved screen time: ...`）が出力されていません。

問題の可能性：

1. **Extension の構造問題**: 現在のコードには iOS 18.2+ の `extensionPoint` 定義がありますが、これは`DeviceActivityReportExtension`では不要で、逆に問題を起こしている可能性があります。

2. **Concurrency問題**: `@MainActor`と`nonisolated`の混在が問題を起こしている可能性。

3. **データが空**: `DeviceActivityResults`自体が空のデータを返している可能性。

## 修正パッチ

### パッチ 4-1: Extension構造の修正（修正前後の比較）

**ファイル**: `aniccaios/AniccaScreenTimeReport/ScreenTimeReportExtension.swift`

**修正のポイント**:
- `ExtensionFoundation`と`ExtensionKit`のimportを削除（DeviceActivityReportExtensionでは不要）
- `@MainActor`を削除（DeviceActivityReportExtensionは独自のアクター分離を持つ）
- `extensionPoint`プロパティを削除（DeviceActivityReportExtensionでは自動的に設定される）
- `body`と`makeConfiguration`から`nonisolated`を削除

### パッチ 4-2: ScreenTimeReportExtension.swift 完全な修正後コード

**ファイル**: `aniccaios/AniccaScreenTimeReport/ScreenTimeReportExtension.swift` を以下で**完全に置き換え**：

```swift
import DeviceActivity
import ManagedSettings
import SwiftUI
import os.log

@main
struct AniccaScreenTimeReportExtension: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        TotalActivityReport { activityReport in
            TotalActivityView(report: activityReport)
        }
    }
}

// MARK: - Report Context

extension DeviceActivityReport.Context {
    static let totalActivity = Self("TotalActivity")
}

// MARK: - Report Scene

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (ActivityReport) -> TotalActivityView
    
    func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> ActivityReport {
        let logger = Logger(subsystem: "ai.anicca.app.ios.screentime-report", category: "Report")
        let appGroupDefaults = UserDefaults(suiteName: "group.ai.anicca.app.ios")
        
        // ★ デバッグログ追加 - Extension起動確認
        logger.info("makeConfiguration called - starting to process data")
        
        // ★ App Groups が取得できているか確認
        guard let appGroupDefaults = appGroupDefaults else {
            logger.error("Failed to access App Group UserDefaults")
            return ActivityReport(totalMinutes: 0, socialMinutes: 0, lateNightMinutes: 0)
        }
        
        var totalMinutes: Double = 0
        var socialMinutes: Double = 0
        var lateNightMinutes: Double = 0
        var snsSessions: [[String: Any]] = []
        
        let calendar = Calendar.current
        
        // SNS アプリの Bundle ID リスト
        let snsBundleIds = [
            "com.twitter", "com.atebits.tweetie2",  // Twitter/X
            "com.burbn.instagram",                   // Instagram
            "com.zhiliaoapp.musically",              // TikTok
            "com.facebook.Facebook",                 // Facebook
            "com.toyopagroup.picaboo",               // Snapchat
            "com.pinterest",                         // Pinterest
            "com.reddit.Reddit",                     // Reddit
            "net.whatsapp.WhatsApp",                 // WhatsApp
            "jp.naver.line",                         // LINE
            "com.facebook.Messenger",                // Messenger
            "com.google.ios.youtube"                 // YouTube
        ]
        
        // ★ DeviceActivityResults は AsyncSequence なので、すべて for await を使用
        for await dataItem in data {
            for await segment in dataItem.activitySegments {
                let segmentStart = segment.dateInterval.start
                let segmentEnd = segment.dateInterval.end
                let hour = calendar.component(.hour, from: segmentStart)
                let isLateNight = hour >= 23 || hour < 6
                
                // ★ segment.categories を経由して applications を取得
                for await category in segment.categories {
                    for await app in category.applications {
                        let minutes = app.totalActivityDuration / 60.0
                        totalMinutes += minutes
                        
                        // SNS かどうか判定
                        let bundleId = app.application.bundleIdentifier ?? ""
                        let isSns = snsBundleIds.contains { bundleId.hasPrefix($0) }
                        
                        if isSns {
                            socialMinutes += minutes
                            if isLateNight {
                                lateNightMinutes += minutes
                            }
                            
                            // snsSessions に追加
                            snsSessions.append([
                                "bundleId": bundleId,
                                "startAt": ISO8601DateFormatter().string(from: segmentStart),
                                "endAt": ISO8601DateFormatter().string(from: segmentEnd),
                                "totalMinutes": Int(minutes)
                            ])
                        }
                    }
                }
            }
        }
        
        // App Groups に保存（メインアプリで読み取り）
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let todayKey = String(today)
        
        appGroupDefaults.set(Int(totalMinutes), forKey: "screenTime_totalMinutes_\(todayKey)")
        appGroupDefaults.set(Int(socialMinutes), forKey: "screenTime_socialMinutes_\(todayKey)")
        appGroupDefaults.set(Int(lateNightMinutes), forKey: "screenTime_lateNightMinutes_\(todayKey)")
        
        // v3.1: snsSessions を JSON として保存
        if let sessionsData = try? JSONSerialization.data(withJSONObject: snsSessions),
           let sessionsJSON = String(data: sessionsData, encoding: .utf8) {
            appGroupDefaults.set(sessionsJSON, forKey: "screenTime_snsSessions_\(todayKey)")
        }
        
        appGroupDefaults.set(Date().timeIntervalSince1970, forKey: "screenTime_lastUpdate")
        
        logger.info("Saved screen time: total=\(Int(totalMinutes))m, social=\(Int(socialMinutes))m, lateNight=\(Int(lateNightMinutes))m, sessions=\(snsSessions.count)")
        
        return ActivityReport(
            totalMinutes: Int(totalMinutes),
            socialMinutes: Int(socialMinutes),
            lateNightMinutes: Int(lateNightMinutes)
        )
    }
}

// MARK: - Data Model

struct ActivityReport {
    let totalMinutes: Int
    let socialMinutes: Int
    let lateNightMinutes: Int
}

// MARK: - View (Extension 内でのみ使用)

struct TotalActivityView: View {
    let report: ActivityReport
    
    var body: some View {
        VStack(spacing: 16) {
            Text("Screen Time Today")
                .font(.headline)
            Text("\(report.totalMinutes / 60)h \(report.totalMinutes % 60)m")
                .font(.largeTitle.bold())
            
            HStack(spacing: 32) {
                VStack {
                    Text("Social")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(report.socialMinutes)m")
                        .font(.title3.bold())
                }
                VStack {
                    Text("Late Night")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(report.lateNightMinutes)m")
                        .font(.title3.bold())
                        .foregroundStyle(report.lateNightMinutes > 30 ? .red : .primary)
                }
            }
        }
        .padding()
    }
}
```

## ユーザー体験の変化

| 状態 | 修正前 | 修正後 |
|------|--------|--------|
| 24時間タイムライン | 空（何も表示されない） | スクリーンタイム使用時間がバーとして表示される |
| スクリーンタイム4h12m | データ取得失敗 | タイムラインに赤いバー（scroll）で表示 |

---

# 問題5: ワークアウト認証がundetermined

## As-Is（現状）

```
Failed to fetch workouts: Authorization not determined
```

Sleep/StepsのHealthKit認証は個別にリクエストしているが、Workoutタイプは含まれていない。

## To-Be（あるべき姿）

Steps認証リクエスト時にWorkoutも一緒にリクエストする。

## 修正パッチ

**ファイル**: `aniccaios/aniccaios/Services/HealthKitManager.swift`

```swift
// 修正前
func requestStepsAuthorization() async -> Bool {
    guard let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        return false
    }
    return await requestAuthorizationFor(types: [stepsType])
}

// 修正後
func requestStepsAuthorization() async -> Bool {
    guard let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
        return false
    }
    // ★ Workout も一緒にリクエスト（タイムラインの Activity 表示に必要）
    var types: Set<HKObjectType> = [stepsType]
    types.insert(HKObjectType.workoutType())
    return await requestAuthorizationFor(types: types)
}
```

## ユーザー体験の変化

| 状態 | 修正前 | 修正後 |
|------|--------|--------|
| Stepsトグル ON | 歩数のみ取得、ワークアウトエラー | 歩数＋ワークアウトセッション取得 |
| タイムライン | Activityバー表示なし | ワークアウト時間が緑のバー（activity）で表示 |

---

# あなたがやるべき作業

## Xcode側で確認すべき項目

1. **AniccaScreenTimeReport Extension のビルドターゲット設定確認**:
   - Xcode > AniccaScreenTimeReport target > Build Settings > 「Deployment」を確認
   - iOS Deployment Target がメインアプリと一致しているか確認

2. **Extension の Embed 設定確認**:
   - Xcode > aniccaios target > Build Phases > Embed App Extensions
   - AniccaScreenTimeReport.appex が含まれているか確認

3. **クリーンビルド**:
   ```bash
   cd aniccaios
   rm -rf build/
   xcodebuild clean
   ```
   その後、Xcodeで Product > Clean Build Folder (Cmd+Shift+K) を実行

4. **デバイスでの実機テスト**:
   - シミュレータではScreen Time APIが正常に動作しないことがあるため、実機でテスト

---

# まとめ

| 問題 | 原因 | 修正ファイル |
|------|------|-------------|
| 起床「起床」だけ | フォールバックが空白 | `apps/api/src/modules/metrics/stateBuilder.js` |
| SNS「SNS」だけ | totalScreenTimeを使っていない | `apps/api/src/modules/metrics/stateBuilder.js` |
| トグルがOFFに戻る | signOutAndWipeでsensorAccessKey削除 | `aniccaios/aniccaios/AppState.swift` |
| タイムライン空 | Extension構造問題 | `aniccaios/AniccaScreenTimeReport/ScreenTimeReportExtension.swift` |
| ワークアウトエラー | Workout認証未リクエスト | `aniccaios/aniccaios/Services/HealthKitManager.swift` |

これらの修正を実行しますか？