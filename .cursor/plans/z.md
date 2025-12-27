問題を徹底的に調査します。まず関連するコードを確認させてください。

[18 tools called]

問題を徹底的に調査しました。以下に各問題の原因と修正パッチを示します。

---

## 問題1: LaunchServicesエラー
これらはシミュレータ/デバッグ環境で発生するiOSシステムレベルの警告です。アプリのコードの問題ではありません。`com.apple.runningboard.process-state` entitlementはApple専用で、サードパーティアプリには付与されません。**修正不要**（無視して問題ありません）

---

## 問題2: "10 Years From Now" が2行表示される問題

**原因**: バックエンドのフォールバック時に `ifContinue` と `ifImprove` 両方に同じメッセージを設定しているため、UIで両方表示されてしまう。

**パッチ（バックエンド）**:

```javascript
// apps/api/src/routes/mobile/behavior.js

// 変更前 (53-56行目):
const fallbackFuture = lang === 'ja'
  ? { ifContinue: '十分なデータがありません', ifImprove: '十分なデータがありません' }
  : { ifContinue: 'Not enough data available', ifImprove: 'Not enough data available' };

// 変更後:
const fallbackFuture = lang === 'ja'
  ? { ifContinue: '十分なデータがありません', ifImprove: '' }
  : { ifContinue: 'Not enough data available', ifImprove: '' };
```

---

## 問題3: "10 Years From Now" カードの横幅が狭い問題

**原因**: `CardView`に`frame(maxWidth: .infinity)`が適用されていない。

**パッチ（iOS）**:

```swift
// aniccaios/aniccaios/Views/Behavior/FutureScenarioView.swift

// 変更前 (10-18行目):
if isEmpty {
    // ★ データなし時は1行のみ表示
    CardView {
        Text(String(localized: "behavior_not_enough_data"))
            .font(AppTheme.Typography.subheadlineDynamic)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .frame(maxWidth: .infinity, alignment: .center)
    }
    .frame(maxWidth: .infinity)  // ★ TimelineViewと同じ横幅
}

// 変更後:
if isEmpty {
    // ★ データなし時は1行のみ表示
    CardView {
        VStack(alignment: .leading, spacing: 12) {
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

## 問題4: 24Hour Timelineが表示されない問題

**原因**: タイムラインは `sleepStartAt`、`wakeAt`、`snsSessions`、`walkRunSessions` から構築されます。これらのデータが `daily_metrics` テーブルに保存されていない場合、空のタイムラインが返されます。

`sleepStartAt` がバックエンドに正しく保存されていない可能性があります。

**パッチ（バックエンド）**:

```javascript
// apps/api/src/routes/mobile/dailyMetrics.js を確認し、以下のフィールドが保存されているか確認

// sleepStartAt, wakeAt が snake_case で保存されているか確認
// 受信: sleep_start_at, wake_at
// DB: sleep_start_at, wake_at

// contextSnapshot.js の getTodayMetrics で返すフィールドを確認
// 46-58行目付近を確認して、sleepStartAt が正しく返されているか
```

実際のパッチ - `contextSnapshot.js` で `sleepStartAt` を追加:

```javascript
// apps/api/src/modules/realtime/contextSnapshot.js

// 変更前 (145-154行目):
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

// 変更後:
today_stats: today
  ? {
      sleepDurationMin: today.sleep_duration_min ?? null,
      sleepStartAt: today.sleep_start_at ?? null,  // ★ 追加
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

## 問題5: Behaviorタブのハイライトが0%のまま

**原因**: `buildHighlights` は `todayStats` のデータを使用します。データがバックエンドに送信されていないか、保存されていない可能性があります。

**確認**: MetricsUploaderからデータが送信されているか確認してください。Screen Timeのトグルをオンにした後、Behaviorタブを開いて強制的にアップロードが実行されますが、その前にScreen Timeデータが App Groups に保存されている必要があります。

**パッチ（iOS）- BehaviorView.swift で load() の待機時間を増やす**:

```swift
// aniccaios/aniccaios/Views/Behavior/BehaviorView.swift

// 変更前 (107-113行目):
// v3.1: Screen Time データを更新するために DeviceActivityReport を表示
if appState.sensorAccess.screenTimeEnabled {
    showScreenTimeReport = true
    // Extension がデータを App Groups に保存するのを待つ
    try? await Task.sleep(nanoseconds: 500_000_000) // 0.5秒
    showScreenTimeReport = false
}

// 変更後:
// v3.1: Screen Time データを更新するために DeviceActivityReport を表示
if appState.sensorAccess.screenTimeEnabled {
    showScreenTimeReport = true
    // Extension がデータを App Groups に保存するのを待つ（1秒に延長）
    try? await Task.sleep(nanoseconds: 1_000_000_000) // 1秒
    showScreenTimeReport = false
}
```

---

## 問題6: データ統合トグルの状態が保存されない問題

**原因**: `sensorAccess` はUserDefaultsに保存されていますが、サーバーには同期されていません。アプリを削除して再インストールすると、UserDefaultsがクリアされ、同じアカウントでサインインしてもサーバーから `sensorAccess` は復元されません。

**パッチ（iOS）- AppState.swift に sensorAccess をプロファイル同期に追加**:

```swift
// aniccaios/aniccaios/AppState.swift

// 1. profileSyncPayload に sensorAccess を追加（554-596行目付近）

// 変更前:
func profileSyncPayload(for profile: UserProfile) -> [String: Any] {
    var payload: [String: Any] = [
        // ... existing fields ...
    ]
    // ... existing code ...
    return payload
}

// 変更後（payloadにsensorAccessを追加）:
func profileSyncPayload(for profile: UserProfile) -> [String: Any] {
    var payload: [String: Any] = [
        // ... existing fields ...
    ]
    
    // ... existing code ...
    
    // ★ sensorAccess を同期に追加
    payload["sensorAccess"] = [
        "screenTimeEnabled": sensorAccess.screenTimeEnabled,
        "sleepEnabled": sensorAccess.sleepEnabled,
        "stepsEnabled": sensorAccess.stepsEnabled,
        "motionEnabled": sensorAccess.motionEnabled
    ]
    
    return payload
}


// 2. applyRemoteProfilePayload に sensorAccess の復元を追加（962-1101行目付近の最後に追加）

// applyRemoteProfilePayload 関数の最後に追加:
// v3.2: sensorAccess を復元
if let sensorAccessPayload = payload["sensorAccess"] as? [String: Bool] {
    if let screenTimeEnabled = sensorAccessPayload["screenTimeEnabled"] {
        sensorAccess.screenTimeEnabled = screenTimeEnabled
    }
    if let sleepEnabled = sensorAccessPayload["sleepEnabled"] {
        sensorAccess.sleepEnabled = sleepEnabled
    }
    if let stepsEnabled = sensorAccessPayload["stepsEnabled"] {
        sensorAccess.stepsEnabled = stepsEnabled
    }
    if let motionEnabled = sensorAccessPayload["motionEnabled"] {
        sensorAccess.motionEnabled = motionEnabled
    }
    saveSensorAccess()
}
```

---

## 問題7: スクリーンタイムのトグルがスムーズに動かない問題

**原因**: トグルをONにするとき、`onEnable`クロージャが非同期で許可をリクエストしますが、トグルの状態が即座に反映されません。許可ダイアログが出る前にトグルがOFFに戻ってしまうことがあります。

**パッチ（iOS）- ProfileView.swift のトグル処理を改善**:

```swift
// aniccaios/aniccaios/Views/Profile/ProfileView.swift

// 変更前 (355-373行目):
private func dataToggleRow(title: String, isOn: Binding<Bool>, onEnable: @escaping () -> Void, onDisable: @escaping () -> Void) -> some View {
    Toggle(title, isOn: Binding(
        get: { isOn.wrappedValue },
        set: { newValue in
            // OFFにする場合は即座に反映
            if !newValue {
                onDisable()
                return
            }
            // ONにする場合は、許可リクエストの結果を待ってから反映
            if newValue && !isOn.wrappedValue {
                onEnable()
            }
        }
    ))
    .tint(AppTheme.Colors.accent)
    .padding(.vertical, 14)
    .padding(.horizontal, 2)
}

// 変更後:
private func dataToggleRow(title: String, isOn: Binding<Bool>, onEnable: @escaping () -> Void, onDisable: @escaping () -> Void) -> some View {
    Toggle(title, isOn: Binding(
        get: { isOn.wrappedValue },
        set: { newValue in
            // OFFにする場合は即座に反映
            if !newValue {
                onDisable()
                return
            }
            // ONにする場合は即座にクロージャを実行（許可リクエスト）
            // 注意: onEnable内でTask{}で非同期処理し、結果に応じてappState.set*Enabled(true)を呼ぶ
            onEnable()
        }
    ))
    .tint(AppTheme.Colors.accent)
    .padding(.vertical, 14)
    .padding(.horizontal, 2)
}
```

さらに、`requestScreenTimeAndUpdateToggle()` を修正して、トグル操作がよりスムーズになるようにします：

```swift
// aniccaios/aniccaios/Views/Profile/ProfileView.swift

// 変更前 (539-550行目):
/// ScreenTime許可をリクエストし、結果に応じてトグルを更新する
private func requestScreenTimeAndUpdateToggle() async {
    let granted = await ScreenTimeManager.shared.requestAuthorization()
    await MainActor.run {
        if granted {
            appState.setScreenTimeEnabled(true)
        }
    }
    if granted {
        await MetricsUploader.shared.runUploadIfDue(force: true)
    }
}

// 変更後:
/// ScreenTime許可をリクエストし、結果に応じてトグルを更新する
private func requestScreenTimeAndUpdateToggle() async {
    // ★ 既に authorized の場合はトグルをONにするだけ
    if ScreenTimeManager.shared.isAuthorized {
        await MainActor.run { appState.setScreenTimeEnabled(true) }
        await MetricsUploader.shared.runUploadIfDue(force: true)
        return
    }
    
    let granted = await ScreenTimeManager.shared.requestAuthorization()
    await MainActor.run {
        // ★ 許可された場合のみONにする（拒否された場合はOFFのまま）
        appState.setScreenTimeEnabled(granted)
    }
    if granted {
        await MetricsUploader.shared.runUploadIfDue(force: true)
    }
}
```

---

## 追加: HealthKitの "Authorization not determined" エラー

**原因**: ワークアウトを取得しようとしたときに、HealthKit認可が確定していないエラーが出ています。

**パッチ（iOS）- HealthKitManager.swift でワークアウト取得前に認可状態を確認**:

```swift
// aniccaios/aniccaios/Services/HealthKitManager.swift

// 変更前 (158-201行目):
// v3.1: Fetch workouts (walk/run sessions)
let workoutType = HKObjectType.workoutType()
let workoutPredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)

do {
    let workouts = try await withCheckedThrowingContinuation { ... }
    ...
} catch {
    logger.error("Failed to fetch workouts: \(error.localizedDescription)")
}

// 変更後:
// v3.1: Fetch workouts (walk/run sessions) - 認可状態を確認してから取得
let workoutType = HKObjectType.workoutType()
let workoutAuthStatus = healthStore.authorizationStatus(for: workoutType)

if workoutAuthStatus == .sharingAuthorized {
    let workoutPredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
    
    do {
        let workouts = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKWorkout], Error>) in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: workoutPredicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples as? [HKWorkout] ?? [])
                }
            }
            healthStore.execute(query)
        }
        
        summary.workoutSessions = workouts.map { workout in
            let type: String
            switch workout.workoutActivityType {
            case .walking: type = "walk"
            case .running: type = "run"
            case .cycling: type = "cycling"
            case .swimming: type = "swimming"
            case .yoga: type = "yoga"
            case .functionalStrengthTraining, .traditionalStrengthTraining: type = "strength"
            case .highIntensityIntervalTraining: type = "hiit"
            default: type = "workout"
            }
            return WorkoutSession(
                startAt: workout.startDate,
                endAt: workout.endDate,
                type: type,
                totalMinutes: Int(workout.duration / 60)
            )
        }
        logger.info("Fetched \(workouts.count) workout sessions")
    } catch {
        logger.error("Failed to fetch workouts: \(error.localizedDescription)")
    }
} else {
    logger.info("Workout authorization not granted, skipping workout fetch")
}
```

---

## まとめ

| 問題 | ファイル | 修正内容 |
|------|----------|----------|
| 1. LaunchServicesエラー | N/A | 無視（シミュレータの制限） |
| 2. "Not enough data"が2行 | `behavior.js` | `ifImprove`を空文字に |
| 3. FutureScenarioカード幅 | `FutureScenarioView.swift` | タイトルを追加、構造を統一 |
| 4. 24h Timeline表示されない | `contextSnapshot.js` | `sleepStartAt`を追加 |
| 5. Highlights 0%のまま | `BehaviorView.swift` | 待機時間を1秒に延長 |
| 6. トグル状態が保存されない | `AppState.swift` | `sensorAccess`をサーバー同期に追加 |
| 7. トグルがスムーズでない | `ProfileView.swift` | 認可状態チェックを追加 |
| 追加: HealthKitエラー | `HealthKitManager.swift` | 認可確認後にワークアウト取得 |

プランモードなので、これらのパッチを実際に適用する場合はお知らせください。

まず質問に回答し、その後でローカライズのパッチを示します。

---

## 質問への回答

### 質問1: ハイライトの4つの値は何が出るべき？固定？

**4つのハイライトは固定**です：

| ハイライト | データソース | 表示される値 |
|-----------|-------------|-------------|
| **Wake** | `daily_metrics.wake_at` | 起床時刻（例: "Wake 6:30"） |
| **Screen (SNS)** | `daily_metrics.sns_minutes_total` | SNS使用時間（例: "SNS 45m"） |
| **Workout (Steps)** | `daily_metrics.steps` | 歩数（例: "Steps 8524"） |
| **Rumination** | 計算式（lateNightSns, snsMinutes, sleepWindowPhone等から算出） | 反芻思考の割合（例: "Rumination 25%"） |

バックエンドの `stateBuilder.js` で定義されています。

---

### 質問2: 24hタイムラインに出てくる値は？

タイムラインには以下の4種類のセグメントが表示されます：

| セグメント | データソース | 説明 |
|-----------|-------------|------|
| **Sleep（青）** | `daily_metrics.sleep_start_at` → `wake_at` | 睡眠時間帯 |
| **Scroll（赤）** | `activity_summary.snsSessions[]` | SNS/スクロール時間帯（各セッションのstartAt→endAt） |
| **Activity（緑）** | `activity_summary.walkRunSessions[]` | ワークアウト/ウォーキング時間帯 |
| **Focus（オレンジ）** | 現在未実装 | 集中時間帯（将来実装予定） |

**データが溜まる条件：**
- Sleep: HealthKitのSleep Analysisデータがあること + sleepEnabled=true
- Scroll: Screen Time許可 + DeviceActivityReportExtensionがsnsSessionsを記録すること
- Activity: HealthKitのWorkoutデータがあること

---

### 質問3: 10年後のFutureと1日の要約は何が出る？

#### Today's Insight（1日の要約）
**データソース**: `daily_metrics.insights.todayInsight`

これはバックエンドで生成される文字列で、`pickTodayInsight()` 関数が返します。現在はフォールバック文のみ：
- 日本語: "まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。"
- 英語: "Not enough behavior data yet. We can shape today gently from here."

**本来の実装予定**: `daily_metrics.insights` に保存された AI 生成のインサイト

#### 10 Years From Now（未来シナリオ）
**データソース**: `generateFutureScenario()` 関数（`futureScenario.js`）

これはAI（OpenAI）が以下のデータを使って生成します：
- `traits`: ユーザーの ideals, struggles, big5
- `todayStats`: 今日のメトリクス（睡眠、歩数、SNS時間など）
- `language`: ユーザーの優先言語

**出力**:
- `ifContinue`: "今の行動を続けた場合の10年後"
- `ifImprove`: "行動を改善した場合の10年後"

---

では、ローカライズ関連のパッチを調査して示します。

[10 tools called]

完全に理解しました。では各問題のパッチを示します。

---

## パッチ1: オンボーディングの `ideal_trait_brave` が日本語でローカライズされていない

**原因**: 日本語のLocalizable.stringsに `ideal_trait_brave` がある（220行目）が、chipButton が `NSLocalizedString` を使っているのでこれは正しく動作するはずです。ただし、WakePromptBuilder が英語になってしまう問題があります。

**調査結果**: 日本語ローカライズファイルには `"ideal_trait_brave" = "勇敢"` があります（220行目）。問題は `WakePromptBuilder.swift` で直接日本語のプレフィックスを使っていることです。

**パッチ（WakePromptBuilder.swift）**:

```swift
// aniccaios/aniccaios/WakePromptBuilder.swift

// 変更前 (153-167行目):
// 理想の姿（全習慣で使用）
if !profile.idealTraits.isEmpty {
    // ★ ローカライズして表示
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

// 変更後:
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

## パッチ2: LANGUAGE LOCK が English になる問題

**原因**: `LanguagePreference.languageLine` は `NSLocalizedString` を使っていますが、これはアプリのローカライズ設定に依存します。問題は `NSLocalizedString` がアプリのBundle言語（iOSのアプリ設定）を使い、ユーザーの `preferredLanguage` 設定を無視していることです。

**パッチ（UserProfile.swift の LanguagePreference）**:

```swift
// aniccaios/aniccaios/Models/UserProfile.swift

// 変更前 (3-22行目):
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

// 変更後:
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

## パッチ3: VoiceSessionController で `IDEAL_TRAITS` がローカライズされていない

**原因**: `VoiceSessionController.swift` の `renderTemplate` で `idealTraits` をローカライズせずにそのまま結合している。

**パッチ（VoiceSessionController.swift）**:

```swift
// aniccaios/aniccaios/VoiceSessionController.swift

// 変更前 (1083-1097行目):
// 理想の自分
if !profile.idealTraits.isEmpty {
    result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: profile.idealTraits.joined(separator: ", "))
} else {
    result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: "")
}

// 問題・課題
if !profile.problems.isEmpty {
    let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
    result = result.replacingOccurrences(of: "${PROBLEMS}", with: localizedProblems.joined(separator: ", "))
} else {
    result = result.replacingOccurrences(of: "${PROBLEMS}", with: "")
}

// 変更後:
// 理想の自分（ローカライズ）
if !profile.idealTraits.isEmpty {
    let localizedTraits = profile.idealTraits.map { NSLocalizedString("ideal_trait_\($0)", comment: "") }
    let prefix = profile.preferredLanguage == .ja
        ? "理想の姿として設定されている特性: "
        : "Ideal self traits: "
    let separator = profile.preferredLanguage == .ja ? "、" : ", "
    result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: prefix + localizedTraits.joined(separator: separator))
} else {
    result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: "")
}

// 問題・課題（ローカライズ）
if !profile.problems.isEmpty {
    let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
    let prefix = profile.preferredLanguage == .ja
        ? "今抱えている問題: "
        : "Current struggles: "
    let separator = profile.preferredLanguage == .ja ? "、" : ", "
    result = result.replacingOccurrences(of: "${PROBLEMS}", with: prefix + localizedProblems.joined(separator: separator))
} else {
    result = result.replacingOccurrences(of: "${PROBLEMS}", with: "")
}
```

---

## パッチ4: Feelingプロンプトファイルのローカライズ

**原因**: `feeling_free_conversation.txt` などのプロンプトファイルが英語でハードコードされている。言語設定に応じて異なるファイルを読み込む必要があります。

**解決策**: プロンプトファイルを言語別に分けるか、内部でローカライズする

**パッチ（RealtimePromptBuilder でファイル名に言語サフィックスを追加）**:

```swift
// aniccaios/aniccaios/VoiceSessionController.swift

// 変更前 (1040-1060行目):
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
        let opener = (load(name: openerName, ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        let commonTemplate = (load(name: "common", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let talkTemplate = (load(name: "talk_session", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        // common.txt + talk_session.txt + feeling_xxx.txt を結合
        let mergedTemplate = "\(commonTemplate)\n\n\(talkTemplate)\n\n\(opener)"
        
        // 変数置換を実行
        let rendered = renderTemplate(mergedTemplate, profile: profile)
        return rendered
    }

// 変更後:
private enum RealtimePromptBuilder {
    static func buildFeelingInstructions(topic: FeelingTopic, profile: UserProfile) -> String {
        let langSuffix = profile.preferredLanguage == .ja ? "_ja" : "_en"
        
        let openerBaseName: String = {
            switch topic {
            case .selfLoathing: return "feeling_self_loathing"
            case .anxiety: return "feeling_anxiety"
            case .irritation: return "feeling_irritation"
            case .freeConversation: return "feeling_free_conversation"
            }
        }()
        
        // 言語別ファイルがあればそれを、なければフォールバック
        let opener = (load(name: openerBaseName + langSuffix, ext: "txt")
            ?? load(name: openerBaseName, ext: "txt")
            ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        let commonTemplate = (load(name: "common", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let talkTemplate = (load(name: "talk_session", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        // common.txt + talk_session.txt + feeling_xxx.txt を結合
        let mergedTemplate = "\(commonTemplate)\n\n\(talkTemplate)\n\n\(opener)"
        
        // 変数置換を実行
        let rendered = renderTemplate(mergedTemplate, profile: profile)
        return rendered
    }
```

**追加**: 日本語用のプロンプトファイルを作成

```txt
# aniccaios/aniccaios/Resources/Prompts/feeling_self_loathing_ja.txt

[Feeling: self_loathing]
短い opener を 2–3 文で。痛みの承認→事実と解釈の分離→優しさの足場。
質問攻めにしない。
```

```txt
# aniccaios/aniccaios/Resources/Prompts/feeling_anxiety_ja.txt

[Feeling: anxiety]
短い opener を 2–3 文で。身体/現在へのグラウンディング→受容→最小の一歩。
質問攻めにしない。
```

```txt
# aniccaios/aniccaios/Resources/Prompts/feeling_irritation_ja.txt

[Feeling: irritation]
短い opener を 2–3 文で。怒りの承認→その下にある本当の感情を探る→一呼吸。
質問攻めにしない。
```

```txt
# aniccaios/aniccaios/Resources/Prompts/feeling_free_conversation_ja.txt

[Feeling: free_conversation]

ユーザーは「その他」を選びました。今の気持ちを言葉にできない、またはカテゴリに当てはまらない状態かもしれません。

アプローチ:
1. 温かく穏やかに挨拶する
2. オープンに尋ねる：「何かあった？」「今どんな気持ち？」
3. 感情にラベルをつけなくていいと伝える

重要なガイドライン:
- 聞くことを優先する
- 決めつけない - ユーザーに語らせる
- 不明瞭でも矛盾していても受け入れる
- 言葉にできない場合は「それってどんな感じ？」と穏やかに探る
- ユーザーの流れに従う

覚えておくこと: あなたの役割は、判断せずに支える聞き手。既存のカテゴリに当てはまらなかったからこそ「その他」を選んだ - その選択を尊重して。
```

---

## パッチ5: ハイライトのラベル（Wake, SNS, Steps, Rumination）が日本語でも英語

**原因**: バックエンドの `stateBuilder.js` がラベルを英語で生成している。

**パッチ（バックエンド）**:

```javascript
// apps/api/src/modules/metrics/stateBuilder.js

// 変更前 (8-43行目):
export function buildHighlights({ todayStats, timezone }) {
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
  const steps = Number(todayStats?.steps ?? 0);
  
  // ...省略...

  const wakeLabel = wakeAt ? `Wake ${toLocalTimeHHMM(wakeAt, timezone)}` : 'Wake';
  const screenLabel = snsMinutesTotal > 0 ? `SNS ${snsMinutesTotal}m` : 'SNS';
  const workoutLabel = steps > 0 ? `Steps ${steps}` : 'Workout';
  const ruminationLabel = `Rumination ${Math.round(ruminationProxy * 100)}%`;
  
  // ...省略...
}

// 変更後（language パラメータを追加）:
export function buildHighlights({ todayStats, timezone, language = 'en' }) {
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
  const steps = Number(todayStats?.steps ?? 0);
  
  // 修正: 計算式を直接使用
  const activity = todayStats?.activitySummary || {};
  const ruminationProxy = calculateRuminationProxy({
    lateNightSnsMinutes: Number(activity?.lateNightSnsMinutes ?? 0),
    snsMinutes: snsMinutesTotal,
    totalScreenTime: Number(activity?.totalScreenTime ?? snsMinutesTotal),
    sleepWindowPhoneMinutes: Number(activity?.sleepWindowPhoneMinutes ?? 0),
    longestNoUseHours: Number(activity?.longestNoUseHours ?? 0)
  });

  const isJa = language === 'ja';
  
  // ラベルをローカライズ
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

**behavior.js も更新**:

```

**behavior.js も更新**:

```javascript
// apps/api/src/routes/mobile/behavior.js

// 変更前 (25-27行目):
const todayInsight = pickTodayInsight({ todayStats: today, language: lang });
const highlights = buildHighlights({ todayStats: today, timezone: tz });
const timeline = buildTimeline({ todayStats: today, timezone: tz });

// 変更後:
const todayInsight = pickTodayInsight({ todayStats: today, language: lang });
const highlights = buildHighlights({ todayStats: today, timezone: tz, language: lang });
const timeline = buildTimeline({ todayStats: today, timezone: tz });
```

---

## パッチ6: ハイライトのデザイン変更（ステータス文言を削除し、値を表示）

**要望**: 「要注意」「前進中」などのステータスラベルを削除し、代わりに実際の値を同じサイズで表示

**パッチ（HighlightsCard.swift）**:

```swift
// aniccaios/aniccaios/Views/Behavior/HighlightsCard.swift

// 変更前 (29-72行目):
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
                    
                    // v3.1: バックエンドから返される具体的な数値（例: "Wake 6:30", "Steps 8524"）を表示
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
                .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44)) // #6B8E6F
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(AppTheme.Colors.buttonUnselected.opacity(0.6))
        .clipShape(Capsule())
        .padding(10)
    }
}

// 変更後:
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
                .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44)) // #6B8E6F
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

## パッチ7: 10年後のFutureのフォールバック修正（両方空なら1行で表示）

**パッチ（behavior.js）**:

```javascript
// apps/api/src/routes/mobile/behavior.js

// 変更前 (53-56行目):
const fallbackFuture = lang === 'ja'
  ? { ifContinue: '十分なデータがありません', ifImprove: '十分なデータがありません' }
  : { ifContinue: 'Not enough data available', ifImprove: 'Not enough data available' };

// 変更後（ifImproveを空に）:
const fallbackFuture = lang === 'ja'
  ? { ifContinue: '十分なデータがありません', ifImprove: '' }
  : { ifContinue: 'Not enough data available', ifImprove: '' };
```

---

## パッチ8: デバッグログの追加（ハイライトとタイムライン）

**パッチ（BehaviorView.swift）**:

```swift
// aniccaios/aniccaios/Views/Behavior/BehaviorView.swift

// load()関数に追加 (102-125行目):
private func load() async {
    guard !isLoading else { return }
    isLoading = true
    errorText = nil
    
    logger.info("BehaviorView: Starting data load")
    logger.info("BehaviorView: screenTimeEnabled=\(appState.sensorAccess.screenTimeEnabled), sleepEnabled=\(appState.sensorAccess.sleepEnabled), stepsEnabled=\(appState.sensorAccess.stepsEnabled)")
    
    // v3.1: Screen Time データを更新するために DeviceActivityReport を表示
    if appState.sensorAccess.screenTimeEnabled {
        showScreenTimeReport = true
        logger.info("BehaviorView: Waiting for DeviceActivityReport...")
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1秒
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

**パッチ（MetricsUploader.swift にもログ追加）**:

```swift
// aniccaios/aniccaios/Services/MetricsUploader.swift

// runUploadIfDue 関数の最後（送信前）に追加:

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

## パッチ9: Today's Insight と 10 Years の日本語対応（バックエンド）

**パッチ（stateBuilder.js）**:

```javascript
// apps/api/src/modules/metrics/stateBuilder.js

// 変更前 (89-95行目):
export function pickTodayInsight({ todayStats, language = 'en' }) {
  const insight = todayStats?.insights?.todayInsight;
  if (typeof insight === 'string' && insight.trim()) return insight.trim();
  return language === 'ja'
    ? 'まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。'
    : 'Not enough behavior data yet. We can shape today gently from here.';
}

// これは既にローカライズされているので変更不要
```

---

## まとめ表

| 問題 | ファイル | 修正内容 |
|------|----------|----------|
| 1. ideal_trait_brave が英語 | WakePromptBuilder.swift | プレフィックスを言語設定に応じて変更 |
| 2. LANGUAGE LOCK: English | UserProfile.swift | `languageLine` をハードコード |
| 3. IDEAL_TRAITS 未ローカライズ | VoiceSessionController.swift | ローカライズ処理を追加 |
| 4. Feelingプロンプト英語 | VoiceSessionController.swift + 新ファイル | 言語別ファイル読み込み |
| 5. ハイライトラベル英語 | stateBuilder.js, behavior.js | language パラメータ追加 |
| 6. ステータス文言削除 | HighlightsCard.swift | 値のみ表示に変更 |
| 7. 10年後が2行表示 | behavior.js | ifImprove を空に |
| 8. デバッグログ追加 | BehaviorView.swift, MetricsUploader.swift | ログ追加 |

これらのパッチを適用すれば、ローカライズの問題が解決し、デバッグも容易になります。プランモードなので、適用するかどうかお知らせください。