---

# 追加実装仕様書: オンボーディング簡略化 + Apple Sign Inオプション化

---

## 目的

1. **オンボーディングを簡略化**（12ステップ → 7ステップ）
2. **Apple Sign Inをオプション化**（オンボーディングから削除）
3. **既存ユーザーの復元を可能にする**（Welcome画面 + プロフィール画面）
4. **匿名ユーザーでもプロフィールをサーバーに保存**

---

## To-Be（あるべき姿）

### 新規ユーザー

```
Welcome → Value → Ideals → Struggles → HabitSetup → Notifications → Paywall → メイン画面
（後からプロフィール画面でApple Sign Inすれば端末変更・削除後も復元可能）
```

### 既存ユーザー（アプリ削除→再インストール）

```
Welcome → 「以前使っていた方はこちら」タップ → Apple Sign In → 復元 → メイン画面
（オンボーディングスキップ、習慣設定が復元される）
```

---

## 変更ファイル一覧

| # | ファイル | 変更内容 |
|---|---------|---------|
| 1 | `OnboardingFlowView.swift` | オンボーディングフロー簡略化 |
| 2 | `profile.js` | AlarmKitデフォルト値を`false`に修正 |
| 3 | `WelcomeStepView.swift` | 「以前使っていた方はこちら」ボタン追加 |
| 4 | `ProfileView.swift` | Apple Sign Inボタン追加（未サインイン時のみ） |
| 5 | `ProfileSyncService.swift` | 匿名ユーザーでもサーバー同期 |
| 6 | `AppState.swift` | 起動時にサーバーからプロフィール復元 |
| 7 | `Localizable.strings` | 新規ローカライズ文字列追加 |

---

## パッチ1: OnboardingFlowView.swift

**目的**: オンボーディングを12ステップ→7ステップに簡略化

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

**変更箇所**: `advance()` メソッド内の遷移ロジック

```diff
 private func advance() {
     switch step {
     case .welcome:
         AnalyticsManager.shared.track(.onboardingWelcomeCompleted)
-        step = .account
-    case .account:
-        AnalyticsManager.shared.track(.onboardingAccountCompleted)
-        step = .value
+        // v0.4: Account (Sign in with Apple) をスキップ
+        step = .value
     case .value:
         AnalyticsManager.shared.track(.onboardingValueCompleted)
-        step = .source
-    case .source:
-        AnalyticsManager.shared.track(.onboardingSourceCompleted)
-        step = .name
-    case .name:
-        AnalyticsManager.shared.track(.onboardingNameCompleted)
-        step = .gender
-    case .gender:
-        AnalyticsManager.shared.track(.onboardingGenderCompleted)
-        step = .age
-    case .age:
-        AnalyticsManager.shared.track(.onboardingAgeCompleted)
+        // v0.4: Source, Name, Gender, Age をスキップ
         step = .ideals
     case .ideals:
         AnalyticsManager.shared.track(.onboardingIdealsCompleted)
         step = .struggles
     case .struggles:
         AnalyticsManager.shared.track(.onboardingStrugglesCompleted)
         step = .habitSetup
     case .habitSetup:
         AnalyticsManager.shared.track(.onboardingHabitsetupCompleted)
         step = .notifications
     case .notifications:
         AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
-        #if canImport(AlarmKit)
-        if #available(iOS 26.0, *) {
-            step = .alarmkit
-        } else {
-            completeOnboarding()
-            return
-        }
-        #else
+        // v0.4: AlarmKitステップを削除（習慣詳細画面でオンデマンド許可に変更）
         completeOnboarding()
         return
-        #endif
-    case .alarmkit:
-        AnalyticsManager.shared.track(.onboardingAlarmkitCompleted)
-        completeOnboarding()
-        return
+    // v0.4: 以下のステップはスキップされるが、コードは残す（将来の再利用のため）
+    case .account, .source, .name, .gender, .age, .alarmkit:
+        // これらのcaseに到達することはない
+        completeOnboarding()
+        return
     }
     appState.setOnboardingStep(step)
 }
```

---

## パッチ2: profile.js

**目的**: AlarmKitのデフォルト値を`false`に修正（許可されていない状態がデフォルト）

**ファイル**: `apps/api/src/routes/mobile/profile.js`

**変更箇所1**: Line 101-104（プロフィールが存在しない場合のデフォルト値）

```diff
         idealTraits: [],
         problems: [],
-        useAlarmKitForWake: true,
-        useAlarmKitForTraining: true,
-        useAlarmKitForBedtime: true,
-        useAlarmKitForCustom: true,
+        useAlarmKitForWake: false,
+        useAlarmKitForTraining: false,
+        useAlarmKitForBedtime: false,
+        useAlarmKitForCustom: false,
         stickyModeEnabled: true,
```

**変更箇所2**: Line 143-146（既存プロフィールのマージ時のデフォルト値）

```diff
       stickyMode: profile.stickyMode ?? profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
-      useAlarmKitForWake: profile.useAlarmKitForWake ?? true,
-      useAlarmKitForTraining: profile.useAlarmKitForTraining ?? true,
-      useAlarmKitForBedtime: profile.useAlarmKitForBedtime ?? true,
-      useAlarmKitForCustom: profile.useAlarmKitForCustom ?? true,
+      useAlarmKitForWake: profile.useAlarmKitForWake ?? false,
+      useAlarmKitForTraining: profile.useAlarmKitForTraining ?? false,
+      useAlarmKitForBedtime: profile.useAlarmKitForBedtime ?? false,
+      useAlarmKitForCustom: profile.useAlarmKitForCustom ?? false,
       stickyModeEnabled: profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
```

---

## パッチ3: WelcomeStepView.swift

**目的**: 既存ユーザー向けに「以前使っていた方はこちら」ボタンを追加

**ファイル**: `aniccaios/aniccaios/Onboarding/WelcomeStepView.swift`

**変更箇所**: ボタン部分の下に追加

```diff
 import SwiftUI
+import AuthenticationServices

 struct WelcomeStepView: View {
     let next: () -> Void
+    @EnvironmentObject private var appState: AppState
+    @State private var isRestoring = false

     var body: some View {
         VStack(spacing: 24) {
             Spacer()
             
             // ロゴとタイトル
             // ...existing code...
             
             // 「はじめる」ボタン
             PrimaryButton(title: String(localized: "onboarding_welcome_start")) {
                 next()
             }
+            
+            // 既存ユーザー向けの復元ボタン
+            VStack(spacing: 12) {
+                Text(String(localized: "onboarding_welcome_restore_description"))
+                    .font(.footnote)
+                    .foregroundStyle(.secondary)
+                    .multilineTextAlignment(.center)
+                
+                SignInWithAppleButton(.signIn) { request in
+                    AuthCoordinator.shared.configure(request)
+                } onCompletion: { result in
+                    isRestoring = true
+                    AuthCoordinator.shared.completeSignIn(result: result) { success in
+                        if success {
+                            Task {
+                                await appState.bootstrapProfileFromServerIfAvailable()
+                                // プロフィールが復元されたらオンボーディングをスキップ
+                                if appState.userProfile.displayName.isEmpty == false ||
+                                   appState.habitSchedules.isEmpty == false {
+                                    appState.completeOnboarding()
+                                }
+                            }
+                        }
+                        isRestoring = false
+                    }
+                }
+                .signInWithAppleButtonStyle(.whiteOutline)
+                .frame(height: 44)
+            }
+            .padding(.top, 8)
             
             Spacer()
         }
+        .disabled(isRestoring)
+        .overlay {
+            if isRestoring {
+                ProgressView()
+            }
+        }
     }
 }
```

---

## パッチ4: ProfileView.swift

**目的**: 未サインインユーザーにApple Sign Inボタンを表示

**ファイル**: `aniccaios/aniccaios/Views/Profile/ProfileView.swift`

**変更箇所**: `accountManagementSection` を修正

```diff
+import AuthenticationServices

 private var accountManagementSection: some View {
+    let isSignedIn: Bool = {
+        if case .signedIn = appState.authStatus { return true }
+        return false
+    }()
+    
     VStack(alignment: .leading, spacing: 10) {
         Text(String(localized: "profile_account_management"))
             .font(.system(size: 18, weight: .bold))
             .foregroundStyle(AppTheme.Colors.label)
             .padding(.horizontal, 2)

         CardView(cornerRadius: 28) {
             VStack(spacing: 0) {
-                Button {
-                    appState.signOutPreservingSensorAccess()
-                } label: {
-                    HStack {
-                        Text(String(localized: "common_sign_out"))
-                            .foregroundStyle(.red)
-                        Spacer()
+                if isSignedIn {
+                    // サインイン済み: サインアウト・削除ボタンを表示
+                    Button {
+                        appState.signOutPreservingSensorAccess()
+                    } label: {
+                        HStack {
+                            Text(String(localized: "common_sign_out"))
+                                .foregroundStyle(.red)
+                            Spacer()
+                        }
+                        .padding(.vertical, 16)
                     }
-                    .padding(.vertical, 16)
-                }
-                .buttonStyle(.plain)
+                    .buttonStyle(.plain)

-                divider
+                    divider

-                Button {
-                    isShowingDeleteAlert = true
-                } label: {
-                    HStack {
-                        Text(String(localized: "settings_delete_account"))
-                            .foregroundStyle(.red)
-                        Spacer()
+                    Button {
+                        isShowingDeleteAlert = true
+                    } label: {
+                        HStack {
+                            Text(String(localized: "settings_delete_account"))
+                                .foregroundStyle(.red)
+                            Spacer()
+                        }
+                        .padding(.vertical, 16)
                     }
-                    .padding(.vertical, 16)
+                    .buttonStyle(.plain)
+                } else {
+                    // 未サインイン: Apple Sign Inボタンを表示
+                    VStack(spacing: 12) {
+                        Text(String(localized: "profile_sign_in_description"))
+                            .font(.footnote)
+                            .foregroundStyle(.secondary)
+                            .multilineTextAlignment(.center)
+                            .padding(.vertical, 8)
+                        
+                        SignInWithAppleButton(.signIn) { request in
+                            AuthCoordinator.shared.configure(request)
+                        } onCompletion: { result in
+                            AuthCoordinator.shared.completeSignIn(result: result)
+                        }
+                        .signInWithAppleButtonStyle(.black)
+                        .frame(height: 50)
+                        .padding(.bottom, 8)
+                    }
                 }
-                .buttonStyle(.plain)
             }
         }
     }
 }
```

---

## パッチ5: ProfileSyncService.swift

**目的**: 匿名ユーザーでもサーバーにプロフィールを同期

**ファイル**: `aniccaios/aniccaios/Services/ProfileSyncService.swift`

**変更箇所**: `enqueue()` と `performSync()` を修正

```diff
 func enqueue(profile: UserProfile, sensorAccess: [String: Bool]? = nil) async {
-    let authStatus = await MainActor.run { AppState.shared.authStatus }
-    guard case .signedIn = authStatus else {
-        logger.debug("Not signed in, skipping profile sync")
-        return
-    }
+    // v0.4: 匿名ユーザーでもdevice_idで同期する（Apple Sign In不要）
     
     pendingSync = profile
     // ...existing code...
 }

 private func performSync() async {
     // ...existing code...
     
     let authStatus = await MainActor.run { AppState.shared.authStatus }
-    guard case .signedIn(let credentials) = authStatus else {
-        logger.warning("Lost authentication during sync")
-        isSyncing = false
-        pendingSync = nil
-        return
-    }
+    
+    // user_idがあれば使う、なければdevice_idをuser_idとして使う
+    let userId: String
+    if case .signedIn(let credentials) = authStatus {
+        userId = credentials.userId
+    } else {
+        userId = await MainActor.run { AppState.shared.resolveDeviceId() }
+    }
     
     let deviceId = await MainActor.run { AppState.shared.resolveDeviceId() }
     
     do {
         try await syncProfile(
             deviceId: deviceId,
-            userId: credentials.userId,
+            userId: userId,
             profile: profile
         )
         // ...existing code...
     }
 }
```

---

## パッチ6: AppState.swift

**目的**: 匿名ユーザーでもサーバーからプロフィールを復元

**変更箇所1**: `bootstrapProfileFromServerIfAvailable()` を修正

```diff
 func bootstrapProfileFromServerIfAvailable() async {
-    guard case .signedIn(let credentials) = authStatus else { return }
+    // v0.4: 匿名ユーザーでもdevice_idでプロフィールを復元
+    let userId: String
+    if case .signedIn(let credentials) = authStatus {
+        userId = credentials.userId
+    } else {
+        userId = resolveDeviceId()
+    }
     
     isBootstrappingProfile = true
     defer { isBootstrappingProfile = false }
     
     var request = URLRequest(url: AppConfig.profileSyncURL)
     request.httpMethod = "GET"
     request.setValue(resolveDeviceId(), forHTTPHeaderField: "device-id")
-    request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+    request.setValue(userId, forHTTPHeaderField: "user-id")
     
     // ...existing code...
 }
```

**変更箇所2**: `init()` の最後に起動時復元を追加

```diff
 private init() {
     // ...existing initialization code...
     
     Task { await scheduler.applySchedules(habitSchedules) }
     Task { await applyCustomSchedulesToScheduler() }
+    
+    // v0.4: 匿名ユーザーでもサーバーからプロフィールを復元
+    Task { await bootstrapProfileFromServerIfAvailable() }
 }
```

---

## パッチ7: Localizable.strings

**目的**: 新規ローカライズ文字列追加

**ファイル**: `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

```diff
+// Onboarding - Welcome
+"onboarding_welcome_restore_description" = "以前使っていた方はこちら";

+// Profile - Sign In
+"profile_sign_in_description" = "サインインすると、端末変更やアプリ削除後も習慣設定を復元できます";
```

**ファイル**: `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`

```diff
+// Onboarding - Welcome
+"onboarding_welcome_restore_description" = "Already have an account?";

+// Profile - Sign In
+"profile_sign_in_description" = "Sign in to restore your habit settings on new devices or after reinstalling";
```

---

## レビューチェックリスト

### 技術観点

- [ ] オンボーディングフローが7ステップになっているか
- [ ] AlarmKitデフォルト値がサーバー・クライアント両方で`false`になっているか
- [ ] Welcome画面に復元ボタンがあるか
- [ ] プロフィール画面にApple Sign Inボタンがあるか（未サインイン時のみ）
- [ ] 匿名ユーザーでもプロフィールがサーバーに同期されるか
- [ ] 起動時にサーバーからプロフィールが復元されるか

### ビジネス観点

- [ ] 新規ユーザーのオンボーディングが短くなっているか
- [ ] 既存ユーザーがアプリ削除→再インストール後に復元できるか
- [ ] 新規ユーザーが後からApple Sign Inできるか

---

## Mixpanel Funnel調整

新しいFunnelステップ：

```
1. onboarding_started
2. onboarding_welcome_completed
3. onboarding_value_completed
4. onboarding_ideals_completed
5. onboarding_struggles_completed
6. onboarding_habitsetup_completed
7. onboarding_notifications_completed
8. onboarding_completed
9. onboarding_paywall_viewed
10. onboarding_paywall_purchased
```

---

**これで追加実装仕様書は完成。実装を開始してよいか？**