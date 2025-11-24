<!-- ca6aea5b-0a8c-4f51-922e-9263c6116052 7c2341ce-4689-41ea-aff3-9b06748ca084 -->
# Anicca iOS/API 修正計画（時系列ソート/トレーニング目標/Customer Center/Paywall/サインアウト/削除500）

### 対象

- iOS: `Onboarding/HabitSetupStepView.swift`、`Habits/HabitsSectionView.swift`、`Onboarding/HabitTrainingFocusStepView.swift`、`SettingsView.swift`、`Components/PaywallContainerView.swift`、`Resources/Prompts/training.txt`（確認のみ）
- API: `apps/api/src/routes/mobile/account.js`
- 仕様: `.cursor/plans/KOUJI.md`, `.cursor/plans/LEVELS.md` に準拠

---

### 1) オンボーディング「Set your habit」— 時刻の早い順に自動ソート

- 既に `HabitSetupStepView` に `sortedDefaultHabits` あり。初期値/変更時にも並び替えが反映されるよう維持（必要なら微調整）。

擬似パッチ:

```swift
// aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
// 既存の sortedDefaultHabits を利用。必要に応じて再計算トリガを強化
private var sortedDefaultHabits: [HabitType] {
    let base: [HabitType] = [.wake, .training, .bedtime]
    return base.sorted { a, b in
        let ca = habitTimes[a] ?? Calendar.current.date(from: a.defaultTime) ?? .distantFuture
        let cb = habitTimes[b] ?? Calendar.current.date(from: b.defaultTime) ?? .distantFuture
        return ca < cb
    }
}
```

---

### 2) Habits画面 — 時系列ソートと重複(Sleep二重)修正、Wake/Sleepのルーティン編集

- **確認**: 既存実装では `sortedHabits` と `sortedCustomHabits` が別々に存在し、重複表示は発生していない。
- 統合ソートは任意の拡張。既存実装で問題なければ変更不要。
- 統合する場合は単一の統合配列にマージして時刻昇順で表示。
- アクティブ項目のみをソート表示し、非アクティブは別表示にすることで重複解消（Sleep二重）。
- Wake/Sleepをタップ時は、時刻だけでなく「場所＋ルーティン（並べ替え/追加/削除）」も編集できる統合エディタに拡張。

擬似パッチ（要点抜粋）:

```swift
// aniccaios/aniccaios/Habits/HabitsSectionView.swift
// 1) 統合エントリ
private enum HabitEntry: Identifiable { case `default`(HabitType, DateComponents), custom(UUID, String, DateComponents) 
  var id: String { switch self { case .default(let h, _): return "d:\\(h.rawValue)"; case .custom(let id, _, _): return "c:\\(id.uuidString)" } } }

// 2) アクティブのみ抽出して統合ソート
private var sortedActiveEntries: [HabitEntry] {
    let cal = Calendar.current
    let defaults = activeHabits.compactMap { h -> HabitEntry? in
        guard let comps = appState.habitSchedules[h], cal.date(from: comps) != nil else { return nil }
        return .default(h, comps)
    }
    let customs = activeCustomHabits.compactMap { id -> HabitEntry? in
        guard let comps = appState.customHabitSchedules[id], cal.date(from: comps) != nil,
              let name = appState.customHabits.first(where: { $0.id == id })?.name else { return nil }
        return .custom(id, name, comps)
    }
    return (defaults + customs).sorted { a, b in
        func time(_ e: HabitEntry) -> (Int, Int) {
            switch e { case .default(_, let c), .custom(_, _, let c): return (c.hour ?? 0, c.minute ?? 0) }
        }
        let (h1, m1) = time(a); let (h2, m2) = time(b)
        return h1 < h2 || (h1 == h2 && m1 < m2)
    }
}

// 3) View 本文: アクティブは sortedActiveEntries を一括表示。非アクティブは従来どおり個別行で。
// 4) タップで “HabitEditSheet” を開き、Wake/Sleep は 位置とルーティン、Training は目標＋種目を編集可能に。
```

Wake/Sleep 統合エディタの擬似パッチ（要点）:

```swift
// aniccaios/aniccaios/Habits/HabitsSectionView.swift（下部の HabitEditSheet を拡張）
struct HabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    let habit: HabitType
    @State private var time = Date()
    @State private var routines: [RoutineItem] = [RoutineItem(text: ""), RoutineItem(text: ""), RoutineItem(text: "")]
    @State private var location: String = ""

    var body: some View {
        NavigationView {
            List {
                // Time
                DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])

                switch habit {
                case .wake:
                    Section(String(localized: "habit_wake_location")) { TextField("habit_wake_location_placeholder", text: $location) }
                    routinesSection(titleKey: "habit_wake_routines")
                case .bedtime:
                    Section(String(localized: "habit_sleep_location")) { TextField("habit_sleep_location_placeholder", text: $location) }
                    routinesSection(titleKey: "habit_sleep_routines")
                case .training:
                    HabitTrainingFocusStepView(next: {}) // 下記でツールバー保存に変更
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common_cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common_save")) { save() } }
            }
            .onAppear { load() }
        }
    }

    @ViewBuilder private func routinesSection(titleKey: LocalizedStringKey) -> some View {
        Section(titleKey) {
            ForEach(routines) { r in /* 並べ替え/削除可能な行（KOUJI通り） */ }
            .onMove { routines.move(fromOffsets: $0, toOffset: $1) }
            Button { routines.append(.init(text: "")) } label: { Label(String(localized: "habit_add_routine"), systemImage: "plus.circle.fill") }
        }
        .toolbar { EditButton() }
    }

    private func load() { /* AppState から location/routines を読み込み */ }
    private func save() { /* AppState.updateHabit + updateWake/SleepLocation + updateWake/SleepRoutines */ }
}
```

---

### 3) トレーニング — 目標入力を上部に追加、Continue ボタン削除（保存は右上）

- `HabitTrainingFocusStepView` に自由記述の `trainingGoal` を追加。
- 下部の `Continue(SUButton)` を廃止。ツールバーの「Save」で `updateTrainingGoal` + `updateTrainingFocus([選択1]) `を保存し、必要時 `next()` を呼ぶ。

擬似パッチ:

```swift
// aniccaios/aniccaios/Onboarding/HabitTrainingFocusStepView.swift
struct HabitTrainingFocusStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var selectedTrainingFocus: String = ""
    @State private var trainingGoal: String = ""
    @State private var isSaving = false
    /* options は既存 */

    var body: some View {
        navigationContainer {
            Form {
                Section(String(localized: "habit_training_goal")) {
                    TextField(String(localized: "habit_training_goal_placeholder"), text: $trainingGoal)
                }
                Section(String(localized: "habit_training_types")) {
                    Picker("", selection: $selectedTrainingFocus) { /* Push-up/Core/Cardio/Stretch */ }
                        .pickerStyle(.inline)
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) { save() }.disabled(selectedTrainingFocus.isEmpty || isSaving)
                }
            }
            .onAppear {
                trainingGoal = appState.userProfile.trainingGoal
                selectedTrainingFocus = appState.userProfile.trainingFocus.first ?? ""
            }
        }
    }

    private func save() {
        guard !selectedTrainingFocus.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            appState.updateTrainingGoal(trainingGoal)
            appState.updateTrainingFocus([selectedTrainingFocus])
            await MainActor.run { isSaving = false; next() }
        }
    }
}
```

---

### 4) 設定 — サブスク表示を復元（プラン/利用量/Manage Plan）＋ Customer Center 直通

- サブスク欄に現在のプラン表示、利用量（`monthlyUsageCount`/`monthlyUsageLimit`）を併記。
- 「Manage Plan」は独自 `ManageSubscriptionSheet` を廃止し、直接 RevenueCat Customer Center を提示。
- 独自 Subscription 画面は不要。
- **重要**: RevenueCat公式APIに準拠。`refundRequestStatus` は存在せず、`refundRequestStarted` と `refundRequestCompleted` に分かれている。
- Customer Centerを閉じた後は `SubscriptionManager.shared.syncNow()` を呼び出して最新状態を取得。

擬似パッチ:

```swift
// aniccaios/aniccaios/SettingsView.swift
Section(String(localized: "settings_subscription_title")) {
    HStack { 
        Text(String(localized: "settings_subscription_plan"))
        Spacer()
        Text(appState.subscriptionInfo.displayPlanName)
    }
    // SubscriptionInfoにmonthlyUsageCountとmonthlyUsageLimitが存在する場合のみ表示
    if let used = appState.subscriptionInfo.monthlyUsageCount,
       let limit = appState.subscriptionInfo.monthlyUsageLimit {
        HStack {
            Text(String(localized: "settings_subscription_usage"))
            Spacer()
            Text("\(used)/\(limit)")
        }
    }
    Button(String(localized: "settings_subscription_manage")) {
        showingManageSubscription = true
    }
}
// Customer Centerを直接提示（RevenueCat公式API準拠）
.sheet(isPresented: $showingManageSubscription) {
    CustomerCenterView()
        .onCustomerCenterRestoreCompleted { customerInfo in
            Task {
                let subscription = SubscriptionInfo(info: customerInfo)
                await MainActor.run {
                    appState.updateSubscriptionInfo(subscription)
                }
                // Customer Centerを閉じた後に同期
                await SubscriptionManager.shared.syncNow()
            }
        }
}
```

または、`.presentCustomerCenter` modifierを使用する場合:

```swift
.presentCustomerCenter(
    isPresented: $showingManageSubscription,
    restoreCompleted: { customerInfo in
        Task {
            let subscription = SubscriptionInfo(info: customerInfo)
            await MainActor.run {
                appState.updateSubscriptionInfo(subscription)
            }
            await SubscriptionManager.shared.syncNow()
        }
    },
    onDismiss: {
        Task {
            await SubscriptionManager.shared.syncNow()
        }
    }
)
```

---

### 5) Paywall — 価格バナーの扱い（削除は任意）

- `PricingDisclosureBanner` は現在 `PaywallContainerView` で使用されているが、削除は必須ではない。
- RevenueCat `PaywallView` 自体も価格情報を含むが、Guideline 3.1.2対応のため明確な価格表示は推奨される。
- 重複感が強い場合は削除を検討するが、現状維持でも問題なし。

擬似パッチ（削除する場合）:

```swift
// aniccaios/aniccaios/Components/PaywallContainerView.swift
- if let primaryPackage = offeringToDisplay.availablePackages.first {
-     PricingDisclosureBanner(
-         billedAmountText: ..., perMonthText: ..., noteText: "Cancel anytime..."
-     )
- }
+ // 価格等の独自バナー表示は廃止（RC Paywall に委譲）
```

**注意**: 削除は任意。現状維持でも問題なし。

---

### 6) サインアウト — ウェルカムに確実に戻す

- サインアウト（Settingsの「Sign out」）でオンボーディング完了フラグとステップをクリアし、`Welcome` に戻る。
- `signOutAndWipe()` にオンボーディング状態の完全なリセットを追加。

擬似パッチ:

```swift
// aniccaios/aniccaios/SettingsView.swift
- Button(String(localized: "common_sign_out")) { appState.clearUserCredentials(); dismiss() }
+ Button(String(localized: "common_sign_out")) { appState.signOutAndWipe(); dismiss() }

// aniccaios/aniccaios/AppState.swift
func signOutAndWipe() {
    authStatus = .signedOut
    userProfile = UserProfile()
    subscriptionInfo = .free
    habitSchedules = [:]
    customHabits = []
    customHabitSchedules = [:]
    pendingHabitTrigger = nil
    pendingHabitPrompt = nil
    cachedOffering = nil
    
    // オンボーディング状態をリセット
    isOnboardingComplete = false
    defaults.removeObject(forKey: onboardingKey)
    setOnboardingStep(.welcome) // これでonboardingStepKeyもクリアされる
    
    // UserDefaultsからすべてのユーザーデータを削除
    defaults.removeObject(forKey: userCredentialsKey)
    defaults.removeObject(forKey: userProfileKey)
    defaults.removeObject(forKey: subscriptionKey)
    defaults.removeObject(forKey: habitSchedulesKey)
    defaults.removeObject(forKey: customHabitsKey)
    defaults.removeObject(forKey: customHabitSchedulesKey)
    
    // 通知をすべてキャンセル
    Task {
        await scheduler.cancelAll()
    }
    
    // RevenueCatからログアウト
    Task {
        await SubscriptionManager.shared.handleLogout()
    }
}
```

---

### 7) アカウント削除 500 — DB カラム修正と既存テーブルに合わせた削除順

- `profiles.user_id` は存在しない（`profiles.id` が主キー）。`profiles.id = $1::uuid` を使用。
- `devices` テーブルと `users` テーブルは存在しないため削除対象から除外。
- `user_settings` は `profiles(id) ON DELETE CASCADE` で自動削除されるため個別削除不要。

擬似パッチ:

```js
// apps/api/src/routes/mobile/account.js
await client.query('BEGIN');
await client.query('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);
await client.query('DELETE FROM mobile_profiles WHERE user_id = $1', [userId]);
await client.query('DELETE FROM mobile_voip_tokens WHERE user_id = $1', [userId]);
await client.query('DELETE FROM tokens WHERE user_id = $1', [userId]);
// profilesテーブルはidが主キーなので、user_idではなくidを使用
await client.query('DELETE FROM profiles WHERE id = $1::uuid', [userId]);
// user_settingsはON DELETE CASCADEで自動削除される
await client.query('COMMIT');
```

**注意**: `devices` テーブルと `users` テーブルは存在しないため削除対象から除外。

---

### 8) 「Add Habit」で二重追加される不具合のガード

- 連打/多重トリガ防止のため `isAdding` フラグで二重実行を抑止。`AppState.addCustomHabit` は重複名を既に抑止済。

擬似パッチ:

```swift
// aniccaios/aniccaios/Habits/HabitsSectionView.swift
@State private var isAdding = false
...
Button(String(localized: "common_add")) {
    guard !isAdding else { return }
    isAdding = true
    addCustomHabit()
    isAdding = false
}
```

---

### 9) training.txt のグラウンディング確認

- `${TRAINING_FOCUS_LIST}` と `${TRAINING_GOAL}` は既に存在（変更なし）。

---

### 注意

- UI/UX の配色やレイアウトの大幅変更は行わず、既存パターンを踏襲。
- ローカライズキーが不足する場合は最小限の追加のみ行います。

### To-dos

- [ ] オンボーディングの習慣（既定3種）を時刻昇順で表示する
- [ ] Habits画面でデフォルト/カスタムを統合し時系列で一括表示
- [ ] Wake/Sleepの場所＋ルーティン編集（並べ替え/追加/削除）実装
- [ ] トレーニング目標入力を追加しContinueを廃止（右上保存）
- [ ] 設定のサブスク表示復元＋Customer Center直通化
- [ ] Paywallの価格バナーを確認（削除は任意）
- [ ] サインアウトでオンボ完了を解除してWelcomeに戻す
- [ ] アカウント削除SQLを実テーブル/カラムに合わせて修正
- [ ] Add Habit二重実行ガードを追加