<!-- 13743313-365f-4947-b9b6-760f8b79467e 66c97aea-15fa-4f6e-a711-ebc8eddf3e55 -->
# iOS習慣管理機能のバグ修正と改善

## 概要

仕様書（KOUJI.md、LEVELS.md）に基づき、以下の問題を修正・改善します。

## 修正項目

### 1. オンボーディングとHabits画面の時系列ソート

- **問題**: オンボーディングの「Set your habit」とHabits画面で、Wake/Training/Sleepが時系列順（時刻が早い順から遅い順）に自動ソートされていない
- **修正**: `HabitSetupStepView.swift`と`HabitsSectionView.swift`のソートロジックを修正し、`appState.habitSchedules`から時刻を優先的に取得して時系列順にソート

### 2. Wake/Sleep習慣のフォローアップ画面

- **問題**: Habits画面でWake/Sleepを押した時、ロケーションだけでなく起床後のルーティンと就寝後のルーティンも実行できるようにする必要がある
- **修正**: `HabitEditSheet`でWake/Sleep習慣の場合、`HabitWakeFollowUpView`/`HabitSleepFollowUpView`を表示し、ルーティンも設定可能にする。`onRegisterSave`コールバックを適切に処理してSaveボタンで保存

### 3. Training習慣の目標回数入力

- **問題**: Trainingを押した時、4つから運動を選ぶのに加えて、目標とする回数を自由記述で入れられるようにする必要があるが、表示されていない
- **修正**: `HabitEditSheet`で`HabitTrainingFocusStepView`の代わりに`HabitTrainingFollowUpView`を使用し、目標回数入力フィールドを表示

### 4. Training画面のContinueボタン削除

- **問題**: Training画面でContinueボタンが不要（右上にSaveボタンがあるため）
- **確認**: `HabitTrainingFollowUpView.swift`にはContinueボタンは存在しない（`HabitTrainingFocusStepView`にはあるが、これはオンボーディング専用）

### 5. Sleepが2つ出るバグ

- **問題**: Habits画面でSleepが2つ表示される
- **修正**: `HabitsSectionView.swift`の`sortedHabits`と`inactiveDefaultHabits`の重複を確認し、`.bedtime`が重複しないように修正

### 6. Add Habitで習慣が2つ追加されるバグ

- **問題**: Add Habitすると習慣が2つ追加される
- **修正**: `addCustomHabit()`メソッドで既存の習慣名をチェックし、重複追加を防ぐ

### 7. Settings画面のサブスクリプション表示修正

- **問題**: Settings画面のサブスクリプション表示がおかしい（過去のコミットを確認して正しい表示に戻す）
- **修正**: `SettingsView.swift`で現在のプラン、利用回数、Manage Planボタンを正しく表示

### 8. Manage Plan後の独自Subscription画面削除

- **問題**: Manage Plan押した後の独自Subscription画面が不要（Customer Centerに直接遷移すべき）
- **修正**: `SettingsView.swift`で`ManageSubscriptionSheet`を削除し、直接`RevenueCatUI.CustomerCenterView`を表示。閉じた後に`syncNow()`を呼び出して最新状態を取得

### 9. Delete Account API修正

- **問題**: Delete Accountで500エラー（`profiles`テーブルに`user_id`カラムが存在しない）
- **修正**: `apps/api/src/routes/mobile/account.js`で`profiles`テーブルを`metadata->>'apple_user_id'`で検索して`id`で削除し、`mobile_profiles`テーブルも削除

### 10. Sign out処理修正

- **問題**: Sign out後にウェルカム画面に戻るが、Continueを押しても何も起こらない（フリーズ）
- **修正**: `AppState.swift`の`clearUserCredentials()`で`isOnboardingComplete`を`false`にリセットし、オンボーディングフローに戻る

### 11. Paywallのカスタム表示削除

- **問題**: Paywallの上にポップアップのような表示（¥15,000/yr等）が表示されている
- **修正**: `PaywallContainerView.swift`から`PricingDisclosureBanner`を削除し、RevenueCatのPaywallViewのみを表示（法的リンクは下部に常設）

## 実装ファイル

### iOSアプリ側

- `aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift`
- `aniccaios/aniccaios/Habits/HabitsSectionView.swift`
- `aniccaios/aniccaios/Settings/HabitWakeFollowUpView.swift`（既存）
- `aniccaios/aniccaios/Settings/HabitSleepFollowUpView.swift`（既存）
- `aniccaios/aniccaios/Settings/HabitTrainingFollowUpView.swift`（既存）
- `aniccaios/aniccaios/SettingsView.swift`
- `aniccaios/aniccaios/Components/PaywallContainerView.swift`
- `aniccaios/aniccaios/AppState.swift`

### バックエンド側

- `apps/api/src/routes/mobile/account.js`

## 注意事項

- 時系列ソートは`appState.habitSchedules`から時刻を優先的に取得し、時間未設定の習慣は最後に表示
- `HabitEditSheet`でWake/Sleep/Training習慣の場合、適切なフォローアップ画面を表示し、`onRegisterSave`コールバックでSaveボタンから保存処理を呼び出す
- Delete Account APIでは`profiles`テーブルを`metadata->>'apple_user_id'`で検索して`id`で削除し、`mobile_profiles`テーブルも削除
- Sign out時は`isOnboardingComplete`を`false`にリセットし、オンボーディングフローに戻る
- RevenueCat Customer Centerは`RevenueCatUI.CustomerCenterView()`を直接使用し、閉じた後に`syncNow()`を呼び出す

## 完全な疑似パッチ

### 1. オンボーディングの時系列ソート修正

**ファイル**: `aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift`

```swift
// 18-26行目のsortedDefaultHabitsを修正
// 修正前:
private var sortedDefaultHabits: [HabitType] {
    let base: [HabitType] = [.wake, .training, .bedtime]
    return base.sorted { a, b in
        let ca = habitTimes[a] ?? Calendar.current.date(from: a.defaultTime) ?? Date.distantFuture
        let cb = habitTimes[b] ?? Calendar.current.date(from: b.defaultTime) ?? Date.distantFuture
        return ca < cb
    }
}

// 修正後:
private var sortedDefaultHabits: [HabitType] {
    let base: [HabitType] = [.wake, .training, .bedtime]
    return base.sorted { a, b in
        // appState.habitSchedulesから時刻を優先的に取得
        let timeA: Date = {
            if let components = appState.habitSchedules[a],
               let date = Calendar.current.date(from: components) {
                return date
            }
            return habitTimes[a] ?? Calendar.current.date(from: a.defaultTime) ?? Date.distantFuture
        }()
        let timeB: Date = {
            if let components = appState.habitSchedules[b],
               let date = Calendar.current.date(from: components) {
                return date
            }
            return habitTimes[b] ?? Calendar.current.date(from: b.defaultTime) ?? Date.distantFuture
        }()
        return timeA < timeB
    }
}
```

### 2. Habits画面の時系列ソート修正

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```swift
// 32-49行目のsortedHabitsを修正
// 修正前:
private var sortedHabits: [(habit: HabitType, time: DateComponents?)] {
    let allHabits = HabitType.allCases.filter { $0 != .custom }
    return allHabits.compactMap { habit in
        let time = habitTimes[habit].flatMap { date in
            Calendar.current.dateComponents([.hour, .minute], from: date)
        }
        return (habit, time)
    }
    .sorted { item1, item2 in
        guard let time1 = item1.time, let time2 = item2.time else {
            return item1.time != nil
        }
        let hour1 = time1.hour ?? 0
        let hour2 = time2.hour ?? 0
        let minute1 = time1.minute ?? 0
        let minute2 = time2.minute ?? 0
        return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
    }
}

// 修正後:
private var sortedHabits: [(habit: HabitType, time: DateComponents?)] {
    let allHabits = HabitType.allCases.filter { $0 != .custom }
    return allHabits.compactMap { habit in
        // appState.habitSchedulesから時刻を優先的に取得
        let time: DateComponents? = {
            if let components = appState.habitSchedules[habit] {
                return components
            }
            return habitTimes[habit].flatMap { date in
                Calendar.current.dateComponents([.hour, .minute], from: date)
            }
        }()
        return (habit, time)
    }
    .sorted { item1, item2 in
        guard let time1 = item1.time, let time2 = item2.time else {
            return item1.time != nil
        }
        let hour1 = time1.hour ?? 0
        let hour2 = time2.hour ?? 0
        let minute1 = time1.minute ?? 0
        let minute2 = time2.minute ?? 0
        return hour1 < hour2 || (hour1 == hour2 && minute1 < minute2)
    }
}
```

### 3. Sleepが2つ出るバグ修正

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```swift
// 74-76行目のinactiveDefaultHabitsを修正
// 修正前:
private var inactiveDefaultHabits: [HabitType] {
    [HabitType.wake, .training, .bedtime].filter { !activeHabits.contains($0) }
}

// 修正後:
private var inactiveDefaultHabits: [HabitType] {
    // sortedHabitsに含まれていない習慣のみを返す（重複を防ぐ）
    let activeHabitTypes = Set(sortedHabits.map { $0.habit })
    return [HabitType.wake, .training, .bedtime].filter { !activeHabitTypes.contains($0) }
}
```

### 4. HabitEditSheetでWake/Sleep/Trainingフォローアップを正しく表示

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```swift
// 379-430行目のHabitEditSheetを修正
// 修正前:
struct HabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    let habit: HabitType
    @State private var time = Date()
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            Form {
                // Time
                DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
                
                // Follow-ups
                switch habit {
                case .wake:
                    TextField(String(localized: "habit_wake_location"), text: Binding(
                        get: { appState.userProfile.wakeLocation },
                        set: { appState.updateWakeLocation($0) }
                    ))
                case .bedtime:
                    TextField(String(localized: "habit_sleep_location"), text: Binding(
                        get: { appState.userProfile.sleepLocation },
                        set: { appState.updateSleepLocation($0) }
                    ))
                case .training:
                    HabitTrainingFocusStepView(next: { }) // embed; saves via AppState
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        Task { await appState.updateHabit(habit, time: time) }
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            // 現在の時刻を読み込む
            if let components = appState.habitSchedules[habit],
               let date = Calendar.current.date(from: components) {
                time = date
            }
        }
    }
}

// 修正後:
struct HabitEditSheet: View {
    @EnvironmentObject private var appState: AppState
    let habit: HabitType
    @State private var time = Date()
    @State private var wakeFollowUpSave: (() -> Void)?
    @State private var sleepFollowUpSave: (() -> Void)?
    @State private var trainingFollowUpSave: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            Form {
                // Time
                DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
                
                // Follow-ups
                switch habit {
                case .wake:
                    HabitWakeFollowUpView(onRegisterSave: { saveAction in
                        wakeFollowUpSave = saveAction
                    })
                case .bedtime:
                    HabitSleepFollowUpView(onRegisterSave: { saveAction in
                        sleepFollowUpSave = saveAction
                    })
                case .training:
                    HabitTrainingFollowUpView(onRegisterSave: { saveAction in
                        trainingFollowUpSave = saveAction
                    })
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        // 時刻を保存
                        Task { await appState.updateHabit(habit, time: time) }
                        // フォローアップ画面のsave()を呼び出す
                        switch habit {
                        case .wake:
                            wakeFollowUpSave?()
                        case .bedtime:
                            sleepFollowUpSave?()
                        case .training:
                            trainingFollowUpSave?()
                        case .custom:
                            break
                        }
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            // 現在の時刻を読み込む
            if let components = appState.habitSchedules[habit],
               let date = Calendar.current.date(from: components) {
                time = date
            }
        }
    }
}
```

### 5. HabitTrainingFollowUpViewからContinueボタンを削除

**ファイル**: `aniccaios/aniccaios/Settings/HabitTrainingFollowUpView.swift`

```swift
// 確認結果: HabitTrainingFollowUpViewにはContinueボタンは存在しない（正しい実装）
// 注意: HabitTrainingFocusStepView（オンボーディング用）にはContinueボタンがあるが、
//       HabitEditSheetではHabitTrainingFollowUpView（設定画面用）を使用するため問題なし
//       HabitTrainingFollowUpViewには目標回数入力フィールドが上部に配置されている
```

### 6. Add Habitで習慣が2つ追加されるバグ修正

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```swift
// 367-375行目のaddCustomHabit()を修正
// 修正前:
private func addCustomHabit() {
    let trimmed = newCustomHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    
    let config = CustomHabitConfiguration(name: trimmed)
    appState.addCustomHabit(config)
    newCustomHabitName = ""
    activeSheet = nil
}

// 修正後（重複追加を防ぐ）:
private func addCustomHabit() {
    let trimmed = newCustomHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    
    // 既に同じ名前の習慣が存在しないか確認
    guard !appState.customHabits.contains(where: { $0.name.compare(trimmed, options: .caseInsensitive) == .orderedSame }) else {
        // 既に存在する場合は追加しない
        newCustomHabitName = ""
        activeSheet = nil
        return
    }
    
    let config = CustomHabitConfiguration(name: trimmed)
    appState.addCustomHabit(config)
    newCustomHabitName = ""
    activeSheet = nil
}
```

### 7. Settings画面のサブスクリプション表示修正

**ファイル**: `aniccaios/aniccaios/SettingsView.swift`

```swift
// 15行目のState変数を修正
// 修正前:
@State private var showingManageSubscription = false

// 修正後:
@State private var showingCustomerCenter = false

// 20-23行目のSectionを修正
// 修正前:
Section(String(localized: "settings_subscription_title")) {
    Button(String(localized: "settings_subscription_manage")) { showingManageSubscription = true }
}

// 修正後:
Section(String(localized: "settings_subscription_title")) {
    // 現在のプラン表示
    HStack {
        Text(String(localized: "settings_subscription_current_plan"))
            .font(.body)
        Spacer()
        Text(appState.subscriptionInfo.displayPlanName)
            .font(.body)
            .foregroundStyle(.secondary)
    }
    
    // 利用回数表示（PROプランの場合）
    if appState.subscriptionInfo.plan == .pro,
       let limit = appState.subscriptionInfo.monthlyUsageLimit,
       let remaining = appState.subscriptionInfo.monthlyUsageRemaining {
        HStack {
            Text(String(localized: "settings_subscription_usage"))
                .font(.body)
            Spacer()
            Text("\(limit - remaining)/\(limit)")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }
    
    // Manage Planボタン
    Button(String(localized: "settings_subscription_manage")) { 
        showingCustomerCenter = true 
    }
}

// 105-107行目のsheetを修正
// 修正前:
.sheet(isPresented: $showingManageSubscription) {
    ManageSubscriptionSheet().environmentObject(appState)
}

// 修正後:
.sheet(isPresented: $showingCustomerCenter) {
    RevenueCatUI.CustomerCenterView()
        .environment(\.locale, .autoupdatingCurrent)
        .onCustomerCenterRestoreCompleted { customerInfo in
            Task {
                await SubscriptionManager.shared.syncNow()
            }
        }
}
```

### 8. Delete Account API修正

**ファイル**: `apps/api/src/routes/mobile/account.js`

```javascript
// 39-54行目を修正
// 修正前:
// アプリDBの削除（pg Poolでトランザクション）
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // 関連データを削除（外部キー制約の順序に注意）
  await client.query('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM profiles WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM devices WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM users WHERE id = $1', [userId]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

// 修正後:
// アプリDBの削除（pg Poolでトランザクション）
const client = await pool.connect();
try {
  await client.query('BEGIN');
  
  // 関連データを削除（外部キー制約の順序に注意）
  await client.query('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM monthly_vc_grants WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM mobile_profiles WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM devices WHERE user_id = $1', [userId]);
  
  // profilesテーブルはmetadata->>'apple_user_id'で検索してidで削除
  const profileResult = await client.query(
    `SELECT id FROM profiles WHERE metadata->>'apple_user_id' = $1`,
    [userId]
  );
  
  if (profileResult.rows.length > 0) {
    const profileId = profileResult.rows[0].id;
    // user_settingsも削除（profilesに外部キー制約がある場合）
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [profileId]).catch(() => {
      // テーブルが存在しない場合は無視
    });
    await client.query('DELETE FROM profiles WHERE id = $1', [profileId]);
  }
  
  // usersテーブルが存在する場合は削除
  await client.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {
    // usersテーブルが存在しない場合は無視
  });
  
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

### 9. Sign out処理修正

**ファイル**: `aniccaios/aniccaios/AppState.swift`

```swift
// 273-277行目のclearUserCredentials()を修正
// 修正前:
func clearUserCredentials() {
    authStatus = .signedOut
    defaults.removeObject(forKey: userCredentialsKey)
    Task { await SubscriptionManager.shared.handleLogout() }
}

// 修正後:
func clearUserCredentials() {
    authStatus = .signedOut
    defaults.removeObject(forKey: userCredentialsKey)
    // オンボーディング完了フラグをリセットして、ウェルカム画面に戻る
    isOnboardingComplete = false
    defaults.set(false, forKey: onboardingKey)
    defaults.removeObject(forKey: onboardingStepKey)
    onboardingStep = .welcome
    Task { await SubscriptionManager.shared.handleLogout() }
}
```

**ファイル**: `aniccaios/aniccaios/ContentView.swift`

```swift
// 14-25行目のbodyを確認（既に正しく実装されているが、念のため確認）
// 現在の実装:
var body: some View {
    if !appState.isOnboardingComplete {
        OnboardingFlowView()
    } else {
        switch appState.authStatus {
        case .signedOut:
            OnboardingFlowView()
        case .signingIn:
            AuthenticationProcessingView()
        case .signedIn:
            MainTabView()
        }
    }
}
// この実装は正しい。clearUserCredentials()でisOnboardingCompleteをfalseにすることで、OnboardingFlowViewが表示される
```

### 10. Paywallのカスタム表示削除

**ファイル**: `aniccaios/aniccaios/Components/PaywallContainerView.swift`

```swift
// 32-65行目を修正
// 修正前:
// Guideline 3.1.2対応: 請求額を最強調、法的リンクを常設
VStack(spacing: 0) {
    // 上部: 請求額を最も目立つ形で表示
    if let primaryPackage = offeringToDisplay.availablePackages.first {
        PricingDisclosureBanner(
            billedAmountText: PricingDisclosureBanner.billedText(for: primaryPackage),
            perMonthText: PricingDisclosureBanner.perMonthText(for: primaryPackage),
            noteText: "Cancel anytime. Price may vary by region and currency."
        )
    }
    
    // RevenueCatUIのPaywallViewを使用
    PaywallView(offering: offeringToDisplay)
        .onRequestedDismissal {
            // RevenueCat Paywall の「×」押下時に呼ばれる
            onDismissRequested?()
        }
        .onPurchaseCompleted { customerInfo in
            print("[Paywall] Purchase completed: \(customerInfo)")
            Task {
                await handlePurchaseResult(customerInfo)
            }
        }
        // 追加: キャンセル時のフリーズ対策
        .onPurchaseCancelled {
            print("[Paywall] Purchase cancelled by user")
        }
        .onRestoreCompleted { customerInfo in
            print("[Paywall] Restore completed: \(customerInfo)")
            Task {
                await handlePurchaseResult(customerInfo)
            }
        }
}
.safeAreaInset(edge: .bottom) {
    // 下部: 法的リンクを常設
    LegalLinksView()
}

// 修正後:
// RevenueCatUIのPaywallViewのみを使用（カスタムバナーを削除）
PaywallView(offering: offeringToDisplay)
    .onRequestedDismissal {
        // RevenueCat Paywall の「×」押下時に呼ばれる
        onDismissRequested?()
    }
    .onPurchaseCompleted { customerInfo in
        print("[Paywall] Purchase completed: \(customerInfo)")
        Task {
            await handlePurchaseResult(customerInfo)
        }
    }
    // 追加: キャンセル時のフリーズ対策
    .onPurchaseCancelled {
        print("[Paywall] Purchase cancelled by user")
    }
    .onRestoreCompleted { customerInfo in
        print("[Paywall] Restore completed: \(customerInfo)")
        Task {
            await handlePurchaseResult(customerInfo)
        }
    }
.safeAreaInset(edge: .bottom) {
    // 下部: 法的リンクを常設
    LegalLinksView()
}
```

## レビュー結果サマリー

### 修正が必要な項目

1. ✅ **時系列ソートの修正**: `appState.habitSchedules`から時刻を優先的に取得するように修正
2. ✅ **HabitEditSheetでのフォローアップ表示**: `onRegisterSave`コールバックを適切に処理してSaveボタンから保存
3. ✅ **Delete Account API修正**: `profiles`テーブルを`metadata->>'apple_user_id'`で検索して`id`で削除
4. ✅ **Sign out処理修正**: `isOnboardingComplete`を`false`にリセット
5. ✅ **Settings画面のサブスクリプション表示**: Customer Centerへの直接遷移と同期処理
6. ✅ **Paywallのカスタム表示削除**: `PricingDisclosureBanner`を削除

### 問題ない項目

1. ✅ **Sleepが2つ出るバグ修正**: `inactiveDefaultHabits`の修正は適切
2. ✅ **Add Habitで習慣が2つ追加されるバグ修正**: 重複チェックの追加は適切
3. ✅ **Training画面のContinueボタン削除**: `HabitTrainingFollowUpView`にはContinueボタンは存在しない

### 追加の注意点

1. `HabitTrainingFocusStepView`と`HabitTrainingFollowUpView`は別物:
   - `HabitTrainingFocusStepView`: オンボーディング用（Continueボタンあり）
   - `HabitTrainingFollowUpView`: 設定画面用（目標回数入力あり、Continueボタンなし）
   - `HabitEditSheet`では`HabitTrainingFollowUpView`を使用する必要がある

2. RevenueCat Customer Centerの使い方:
   - `RevenueCatUI.CustomerCenterView()`を直接使用
   - `onCustomerCenterRestoreCompleted`で購入復元を処理
   - 閉じた後に`syncNow()`を呼び出して最新状態を取得

以上が、レビュー結果を反映した完全な疑似パッチです。各修正は実際のファイル構造とコードに基づいています。
