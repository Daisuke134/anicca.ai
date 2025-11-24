# Anicca iOS UI モダナイズ実装計画

## 方針

- **DesignSystem導入**（AppTheme: Colors/Spacing/Radius/Typography + AppBackground）を全画面の基盤に。
- **PrimaryButton**を追加して主要CTAを統一（テンプレートのPrimaryButtonガイドに準拠）。
- 既存`ComponentsKit`は活用しつつ、見出し・背景・CTAの統一で“プロ”品質へ。
- 依存追加なし／iOSターゲット据え置き（`NavigationView`維持）。
- ブランドカラーは既存`AccentColor`を使用。

## 変更の要点（全体）

- すべての主要画面に`AppBackground()`適用（安全なグループ背景）。
- 画面タイトル（H1）は`AppTheme.Typography.appTitle` + `AppTheme.titleGradient`で統一。
- 主要CTAは`PrimaryButton`へ置換（ローディング/無効状態/アイコン一貫性）。
- ルートに`.tint(AppTheme.Colors.accent)`を適用（全体アクセント統一）。

## 追加ファイル

- `aniccaios/aniccaios/DesignSystem/AppTheme.swift`
- `aniccaios/aniccaios/DesignSystem/AppBackground.swift`
- `aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift`

## 既存ファイルの更新（代表）

- `aniccaios/aniccaios/aniccaiosApp.swift`: グローバル`tint`
- `aniccaios/aniccaios/SessionView.swift`: ツールバー化・見出し/CTA刷新・背景適用
- `aniccaios/aniccaios/Onboarding/WelcomeStepView.swift`: 見出し/CTA/背景統一
- `aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift`: 見出し/背景統一
- `aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift`: CTA置換/見出し/背景
- `aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift`: CTA置換/見出し/背景
- `aniccaios/aniccaios/SettingsView.swift`: 背景適用
- `aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift`: 背景適用
- `aniccaios/aniccaios/ContentView.swift`（`AuthenticationProcessingView`）: 背景適用

---

## 完全パッチ（そのまま適用可）

```
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
+import SwiftUI
+
+enum AppTheme {
+    enum Colors {
+        static let accent = Color.accentColor
+        static let background = Color(.systemGroupedBackground)
+        static let cardBackground = Color(.secondarySystemGroupedBackground)
+        static let success = Color.green
+        static let danger = Color.red
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
+        static let appTitle: Font = .system(size: 32, weight: .heavy, design: .rounded)
+        static let headline: Font = .headline
+        static let body: Font = .body
+        static let subheadline: Font = .subheadline
+        static let footnote: Font = .footnote
+    }
+
+    static let titleGradient = LinearGradient(
+        colors: [Colors.accent, Colors.accent.opacity(0.6)],
+        startPoint: .leading,
+        endPoint: .trailing
+    )
+}
+
*** End Patch
```
```
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
+import SwiftUI
+
+struct AppBackground: View {
+    var body: some View {
+        Color(.systemGroupedBackground).ignoresSafeArea()
+    }
+}
+
*** End Patch
```
```
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
+import SwiftUI
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
+                if isLoading {
+                    ProgressView().progressViewStyle(.circular)
+                } else if let icon {
+                    Image(systemName: icon)
+                }
+                Text(title)
+                    .fontWeight(.semibold)
+                    .lineLimit(1)
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
```
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
```
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
+    private var authenticatedContent: some View {
+        NavigationView {
+            VStack(spacing: AppTheme.Spacing.xl) {
+                Text("Anicca")
+                    .font(AppTheme.Typography.appTitle)
+                    .foregroundStyle(AppTheme.titleGradient)
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
+                    Button {
+                        isShowingSettings = true
+                    } label: {
+                        Image(systemName: "gearshape")
+                    }
+                }
+            }
+            .navigationBarTitleDisplayMode(.inline)
+        }
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
+                action: {
+                    controller.stop()
+                }
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
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/WelcomeStepView.swift
@@
-            Text("onboarding_welcome_title")
-                .font(.system(size: 32, weight: .bold))
+            Text("onboarding_welcome_title")
+                .font(AppTheme.Typography.appTitle)
+                .foregroundStyle(AppTheme.titleGradient)
@@
-            Button(action: next) {
-                Text("onboarding_welcome_cta")
-                    .frame(maxWidth: .infinity)
-            }
-            .buttonStyle(.borderedProminent)
-            .controlSize(.large)
+            PrimaryButton(title: String(localized: "onboarding_welcome_cta")) {
+                next()
+            }
         }
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
     }
*** End Patch
```
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
@@
-            Text("onboarding_account_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_account_title")
+                .font(AppTheme.Typography.appTitle)
+                .foregroundStyle(AppTheme.titleGradient)
+                .padding(.top, 40)
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
         .onAppear {
             Task {
                 await AuthHealthCheck.shared.warmBackend()
             }
         }
*** End Patch
```
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
@@
-            Text("onboarding_microphone_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_microphone_title")
+                .font(AppTheme.Typography.appTitle)
+                .foregroundStyle(AppTheme.titleGradient)
+                .padding(.top, 40)
@@
-                        } else {
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
+                        } else {
+                            PrimaryButton(
+                                title: isRequesting
+                                    ? String(localized: "common_requesting")
+                                    : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) {
+                                requestMicrophone()
+                            }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
         .onAppear {
             updatePermissionSnapshot()
             if micGranted {
@@
     }
*** End Patch
```
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
@@
-            Text(String(localized: "onboarding_notifications_title"))
-                .font(.title)
-                .padding(.top, 40)
+            Text(String(localized: "onboarding_notifications_title"))
+                .font(AppTheme.Typography.appTitle)
+                .foregroundStyle(AppTheme.titleGradient)
+                .padding(.top, 40)
@@
-                        } else {
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
+                        } else {
+                            PrimaryButton(
+                                title: isRequesting
+                                    ? String(localized: "common_requesting")
+                                    : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) {
+                                requestNotifications()
+                            }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
         .onAppear {
             Task { await refreshAuthorizationState(autoAdvance: true) }
         }
*** End Patch
```
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
-        NavigationView {
+        NavigationView {
             ScrollView {
@@
-            .navigationBarTitleDisplayMode(.inline)
+            .navigationBarTitleDisplayMode(.inline)
+            .background(AppBackground())
*** End Patch
```
```
*** Begin Patch
*** Update File: aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
@@
-        NavigationView {
+        NavigationView {
             ScrollView {
@@
-        }
+        }
+        .background(AppBackground())
         .task {
             await loadOffering()
         }
*** End Patch
```
```
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

---

## 補足（一括適用のための機械的置換ガイド）

- 見出し（タイトル級）: `font(.title)`や`font(.system(size: 32, weight: .bold))` → `font(AppTheme.Typography.appTitle)`＋`foregroundStyle(AppTheme.titleGradient)`。
- CTAボタン: `.buttonStyle(.borderedProminent)/.controlSize(.large)`の主要CTA → `PrimaryButton(title:..., isEnabled:..., isLoading:...)`。
- 画面背景: ルート`VStack`の直後に`.background(AppBackground())`。
- 情報カード背景: `.thinMaterial`等 → `RoundedRectangle(...).fill(AppTheme.Colors.cardBackground)`に統一。

## テスト観点

- 既存機能（課金/認可/セッション開始・終了）の動作は不変であること。
- Dynamic Typeでレイアウト破綻がないこと。
- ダークモードでコントラスト違反がないこと。