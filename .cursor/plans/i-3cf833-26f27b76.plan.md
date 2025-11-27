<!-- 26f27b76-a6e3-402a-af83-b16c1b0590b3 2b37e02c-2144-4ad2-808b-9cde8072f727 -->
# Anicca iOS UI モダナイズ計画（最終 v3・完全擬似パッチ付き）

## 方針（Apple HIG / SwiftUI 最新準拠）

- Navigation: iOS 18ターゲットのため、アプリ全体を NavigationStack へ統一。
- Typography: Dynamic Typeに準拠（.largeTitle 等の相対スタイル）。固定32ptは廃止。
- CTA: 主要アクションは `PrimaryButton` に統一（ローディング/無効化/アイコン、軽いハプティクス）。
- Background: 全画面を `AppBackground()`（systemGroupedBackground）で統一。
- Colors: `AccentColor` を中核、役割ベーストークン（background/cardBackground/label/secondaryLabel）を追加。
- Accessibility: コントラスト/可読性を優先（グラデ見出しは不採用）。
- ComponentsKit: SUCard/SUBadge等は活用、主要CTAは段階的に `PrimaryButton` へ置換。

---

## 完全擬似パッチ（そのまま適用可能）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
+import SwiftUI
+
+enum AppTheme {
+    enum Colors {
+        static let accent: Color = .accentColor
+        static let background: Color = Color(.systemGroupedBackground)
+        static let cardBackground: Color = Color(.secondarySystemGroupedBackground)
+        static let label: Color = .primary
+        static let secondaryLabel: Color = .secondary
+        static let success: Color = .green
+        static let danger: Color = .red
+    }
+
+    enum Spacing {
+        static let xs: CGFloat = 4
+        static let sm: CGFloat = 8
+        static let md: CGFloat = 12
+        static let lg: CGFloat = 16
+        static let xl: CGFloat = 24
+        static let xxl: CGFloat = 32
+    }
+
+    enum Radius {
+        static let sm: CGFloat = 8
+        static let md: CGFloat = 12
+        static let lg: CGFloat = 16
+    }
+
+    enum Typography {
+        static let appTitle: Font = .largeTitle
+        static let title2: Font = .title2
+        static let headline: Font = .headline
+        static let body: Font = .body
+        static let subheadline: Font = .subheadline
+        static let footnote: Font = .footnote
+    }
+}
+
*** End Patch
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
+import SwiftUI
+
+struct AppBackground: View {
+    var body: some View {
+        AppTheme.Colors.background.ignoresSafeArea()
+    }
+}
+
*** End Patch
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
+import SwiftUI
+import UIKit
+
+struct PrimaryButton: View {
+    let title: String
+    var icon: String? = nil
+    var isEnabled: Bool = true
+    var isLoading: Bool = false
+    let action: () -> Void
+
+    var body: some View {
+        Button {
+            guard isEnabled, !isLoading else { return }
+            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
+            action()
+        } label: {
+            HStack(spacing: 8) {
+                if isLoading { ProgressView().progressViewStyle(.circular) }
+                else if let icon { Image(systemName: icon) }
+                Text(title).fontWeight(.semibold).lineLimit(1)
+            }
+            .frame(maxWidth: .infinity)
+            .padding(.vertical, 14)
+        }
+        .foregroundStyle(.white)
+        .background(
+            RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
+                .fill(isEnabled ? AppTheme.Colors.accent : AppTheme.Colors.accent.opacity(0.4))
+        )
+        .opacity(isEnabled ? 1 : 0.6)
+        .contentShape(Rectangle())
+        .accessibilityLabel(Text(title))
+        .accessibilityAddTraits(.isButton)
+        .disabled(!isEnabled || isLoading)
+    }
+}
+
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/aniccaiosApp.swift
@@
         WindowGroup {
             ContentRouterView()
                 .environmentObject(appState)
+                .tint(AppTheme.Colors.accent)
         }
     }
 }
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/ContentView.swift
@@
 struct AuthenticationProcessingView: View {
     var body: some View {
         VStack(spacing: 24) {
             ProgressView()
                 .scaleEffect(1.5)
             Text("common_signing_in")
                 .font(.headline)
                 .foregroundStyle(.secondary)
         }
         .frame(maxWidth: .infinity, maxHeight: .infinity)
+        .background(AppBackground())
     }
 }
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
-    private var authenticatedContent: some View {
-        VStack(spacing: 24) {
-            HStack {
-                Spacer()
-                Button(action: {
-                    isShowingSettings = true
-                }) {
-                    Image(systemName: "gearshape")
-                        .font(.title3)
-                }
-                .buttonStyle(.bordered)
-            }
-            .frame(maxWidth: .infinity, alignment: .trailing)
-            .padding(.top)
-
-            Text("Anicca")
-                .font(.system(size: 32, weight: .bold))
-
-            if shouldShowWakeSilentNotice {
-                Text(String(localized: "session_wake_silent_notice"))
-                    .multilineTextAlignment(.center)
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
-                    .padding(16)
-                    .frame(maxWidth: .infinity)
-                    .background(
-                        RoundedRectangle(cornerRadius: 16, style: .continuous)
-                            .fill(.thinMaterial)
-                    )
-            }
-
-            Spacer(minLength: 24)
-
-            sessionButton
-        }
-        .padding()
-        .sheet(isPresented: $isShowingSettings) {
+    private var authenticatedContent: some View {
+        NavigationStack {
+            VStack(spacing: AppTheme.Spacing.xl) {
+                Text("Anicca")
+                    .font(AppTheme.Typography.appTitle)
+                    .fontWeight(.heavy)
+                    .foregroundStyle(AppTheme.Colors.label)
+
+                if shouldShowWakeSilentNotice {
+                    Text(String(localized: "session_wake_silent_notice"))
+                        .multilineTextAlignment(.center)
+                        .font(AppTheme.Typography.subheadline)
+                        .foregroundStyle(.secondary)
+                        .padding(16)
+                        .frame(maxWidth: .infinity)
+                        .background(
+                            RoundedRectangle(cornerRadius: AppTheme.Radius.lg, style: .continuous)
+                                .fill(AppTheme.Colors.cardBackground)
+                        )
+                }
+
+                Spacer(minLength: AppTheme.Spacing.xl)
+
+                sessionButton
+            }
+            .padding()
+            .background(AppBackground())
+            .toolbar {
+                ToolbarItem(placement: .topBarTrailing) {
+                    Button { isShowingSettings = true } label: { Image(systemName: "gearshape") }
+                }
+            }
+            .navigationBarTitleDisplayMode(.inline)
+        }
+        .sheet(isPresented: $isShowingSettings) {
             SettingsView()
                 .environmentObject(appState)
         }
@@
-    private var sessionButton: some View {
-        let config = buttonConfig
-        return Button(config.title) {
-            config.action()
-        }
-        .buttonStyle(BorderedProminentButtonStyle())
-        .controlSize(.large)
-        .disabled(config.disabled)
-    }
+    private struct ButtonConfig {
+        let title: String
+        let icon: String?
+        let isLoading: Bool
+        let isEnabled: Bool
+        let action: () -> Void
+    }
+
+    private var sessionButton: some View {
+        let config = buttonConfig
+        return PrimaryButton(
+            title: config.title,
+            icon: config.icon,
+            isEnabled: config.isEnabled,
+            isLoading: config.isLoading,
+            action: config.action
+        )
+    }
@@
-    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
+    private var buttonConfig: ButtonConfig {
         switch controller.connectionStatus {
         case .connected:
-            return (
-                title: String(localized: "session_button_end"),
-                disabled: false,
-                action: { 
-                    controller.stop()
-                    // エビデンス: stop()時にはmarkQuotaHoldを呼ばない（エンドセッション押下時の誤表示を防ぐ）
-                }
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_end"),
+                icon: "stop.fill",
+                isLoading: false,
+                isEnabled: true,
+                action: { controller.stop() }
+            )
         case .connecting:
-            return (
-                title: String(localized: "session_button_connecting"),
-                disabled: true,
-                action: {}
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_connecting"),
+                icon: "hourglass",
+                isLoading: true,
+                isEnabled: false,
+                action: {}
+            )
         case .disconnected:
-            return (
-                title: String(localized: "session_button_talk"),
-                disabled: false,
-                action: {
-                    let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
-                    if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
-                        // 上限に達している時だけ毎回シートを表示
-                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
-                        isShowingLimitModal = true
-                        return
-                    }
-                    controller.start()
-                }
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_talk"),
+                icon: "mic.fill",
+                isLoading: false,
+                isEnabled: true,
+                action: {
+                    let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
+                    if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
+                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
+                        isShowingLimitModal = true
+                        return
+                    }
+                    controller.start()
+                }
+            )
         }
     }
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/WelcomeStepView.swift
@@
-            Text("onboarding_welcome_title")
-                .font(.system(size: 32, weight: .bold))
+            Text("onboarding_welcome_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
@@
-            Button(action: next) {
-                Text("onboarding_welcome_cta")
-                    .frame(maxWidth: .infinity)
-            }
-            .buttonStyle(.borderedProminent)
-            .controlSize(.large)
+            PrimaryButton(title: String(localized: "onboarding_welcome_cta")) { next() }
         }
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
@@
-            Text("onboarding_account_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_account_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
@@
-            Text("onboarding_microphone_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_microphone_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            SUButton(
-                                model: {
-                                    var vm = ButtonVM()
-                                    vm.title = isRequesting
-                                        ? String(localized: "common_requesting")
-                                        : String(localized: "common_continue")
-                                    vm.style = .filled
-                                    vm.size = .medium
-                                    vm.isFullWidth = true
-                                    vm.isEnabled = !isRequesting
-                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                                    return vm
-                                }(),
-                                action: requestMicrophone
-                            )
+                            PrimaryButton(
+                                title: isRequesting ? String(localized: "common_requesting") : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) { requestMicrophone() }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
@@
-            Text(String(localized: "onboarding_notifications_title"))
-                .font(.title)
-                .padding(.top, 40)
+            Text(String(localized: "onboarding_notifications_title"))
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            SUButton(
-                                model: {
-                                    var vm = ButtonVM()
-                                    vm.title = isRequesting
-                                        ? String(localized: "common_requesting")
-                                        : String(localized: "common_continue")
-                                    vm.style = .filled
-                                    vm.size = .medium
-                                    vm.isFullWidth = true
-                                    vm.isEnabled = !isRequesting
-                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                                    return vm
-                                }(),
-                                action: requestNotifications
-                            )
+                            PrimaryButton(
+                                title: isRequesting ? String(localized: "common_requesting") : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) { requestNotifications() }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
-            Text("onboarding_habit_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_habit_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_done")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = canSave
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_done"),
+                isEnabled: canSave,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
@@
-        .sheet(isPresented: $showingAddCustomHabit) {
-            NavigationView {
+        .sheet(isPresented: $showingAddCustomHabit) {
+            NavigationStack {
                 Form {
@@
-            }
+            }
         }
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/ProfileInfoStepView.swift
@@
-            Text("onboarding_profile_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_profile_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "onboarding_profile_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "onboarding_profile_continue"),
+                isEnabled: !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/CompletionStepView.swift
@@
-            Text("onboarding_completion_title")
-                .font(.title)
-                .fontWeight(.bold)
+            Text("onboarding_completion_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = String(localized: "onboarding_completion_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: next
-            )
+            PrimaryButton(title: String(localized: "onboarding_completion_continue")) { next() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
-        .padding(24)
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitWakeLocationStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_wake_location_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_wake_location_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSleepLocationStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_sleep_location_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_sleep_location_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitTrainingFocusStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_training_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_training_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            Image(systemName: selectedTrainingFocus == option.id ? "checkmark.circle.fill" : "circle")
-                                .foregroundStyle(selectedTrainingFocus == option.id ? .blue : .secondary)
+                            Image(systemName: selectedTrainingFocus == option.id ? "checkmark.circle.fill" : "circle")
+                                .foregroundStyle(selectedTrainingFocus == option.id ? AppTheme.Colors.accent : .secondary)
@@
-                        .background(
-                            RoundedRectangle(cornerRadius: 8)
-                                .fill(selectedTrainingFocus == option.id ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
-                        )
+                        .background(
+                            RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                                .fill(selectedTrainingFocus == option.id ? AppTheme.Colors.accent.opacity(0.1) : AppTheme.Colors.cardBackground)
+                        )
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !selectedTrainingFocus.isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !selectedTrainingFocus.isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
@@
-    var body: some View {
-        NavigationView {
+    var body: some View {
+        NavigationStack {
             ScrollView {
@@
-        }
+        }
+        .background(AppBackground())
         .task {
             await loadOffering()
         }
@@
-                if !isCurrentPlan {
-                    SUButton(
-                        model: {
-                            var vm = ButtonVM()
-                            vm.title = String(localized: "settings_subscription_select")
-                            vm.style = .filled
-                            vm.size = .medium
-                            vm.isFullWidth = true
-                            vm.isEnabled = !isPurchasing
-                            vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                            return vm
-                        }(),
-                        action: {
-                            Task {
-                                await purchasePackage(package)
-                            }
-                        }
-                    )
-                }
+                if !isCurrentPlan {
+                    PrimaryButton(
+                        title: String(localized: "settings_subscription_select"),
+                        isEnabled: !isPurchasing,
+                        isLoading: isPurchasing
+                    ) {
+                        Task { await purchasePackage(package) }
+                    }
+                }
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
-            .navigationBarTitleDisplayMode(.inline)
+            .navigationBarTitleDisplayMode(.inline)
+            .background(AppBackground())
*** End Patch
```
```

---

## テスト観点

- 認証/課金/音声セッションの回帰（開始/停止/制限到達時の挙動）
- Dynamic Type（最小～最大）での崩れがないこと
- ダーク/ライト両モードでの視認性
- NavigationStack遷移/シートの表示一貫性
- 主要CTAの状態遷移（connecting/connected/disconnected）

### To-dos

- [ ] DesignSystem追加（AppTheme/AppBackground/PrimaryButton）
- [ ] アプリルートに.tint(AppTheme.Colors.accent)を適用
- [ ] SessionViewをNavigationStack化しCTA/背景を統一
- [ ] Welcome/Authenticationのタイトル/背景/CTAを統一
- [ ] Microphone/NotificationsのCTA置換と背景適用
- [ ] HabitSetup/ProfileInfo/CompletionのCTA置換と背景適用
- [ ] Wake/Sleep/TrainingFocusのCTA置換と背景適用
- [ ] Settings/ManageSubscriptionの背景統一＋選択CTAをPrimaryButton化
- [ ] AuthenticationProcessingViewに背景適用