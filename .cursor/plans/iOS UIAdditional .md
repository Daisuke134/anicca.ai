<!-- 1e3ad244-4fec-49a0-a2d5-dc7605e74ddb b5d63ebe-a6e9-4949-8b9e-0cc920b0cd89 -->
# Anicca iOS UI モダナイズ計画 v3.1（テンプレ準拠・最終）

## 概要

- 既存計画（v3）の「完全擬似パッチ」を採用しつつ、テンプレ準拠度と互換性を高めるための最小修正を統合。
- デプロイメントターゲットは iOS 18 のまま（Base SDK は最新で問題なし）。26 への引き上げは不要かつ不適切。

## 方針（変更なし＋微修正）

- Navigation: 画面は `NavigationStack` に統一（既存分岐が残る箇所は任意で統一）。
- Typography/Accessibility: Dynamic Type を尊重し、見出し/本文の役割ベースで整理。
- CTA: 主要アクションは `PrimaryButton` に統一（テンプレ準拠 API: title/isEnabled/isLoading/action の4点）。
- Background: 全画面を `AppBackground()` で統一。`List` は `.scrollContentBackground(.hidden)` を併用。
- Colors: 役割ベーストークン（accent/background/cardBackground/label/secondaryLabel）。
- 互換性: `ProgressView` は `CircularProgressViewStyle()` を明示（保守的）。
- Deployment Target: `IPHONEOS_DEPLOYMENT_TARGET = 18.0` を維持（26.0 の混在があれば 18.0 に統一）。

---

## 追加/修正擬似パッチ（v3への上書き差分）

1) PrimaryButton（APIをテンプレ準拠・互換性重視のProgressView表記）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
@@
-struct PrimaryButton: View {
-    let title: String
-    var icon: String? = nil
-    var isEnabled: Bool = true
-    var isLoading: Bool = false
-    let action: () -> Void
+struct PrimaryButton: View {
+    let title: String
+    var isEnabled: Bool = true
+    var isLoading: Bool = false
+    let action: () -> Void
@@
-            HStack(spacing: 8) {
-                if isLoading { ProgressView().progressViewStyle(.circular) }
-                else if let icon { Image(systemName: icon) }
-                Text(title).fontWeight(.semibold).lineLimit(1)
-            }
+            HStack(spacing: 8) {
+                if isLoading { ProgressView().progressViewStyle(CircularProgressViewStyle()) }
+                Text(title).fontWeight(.semibold).lineLimit(1)
+            }
*** End Patch
```

2) SessionView（PrimaryButton呼び出しから icon を除去／設定を保持）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
-    private struct ButtonConfig {
-        let title: String
-        let icon: String?
-        let isLoading: Bool
-        let isEnabled: Bool
-        let action: () -> Void
-    }
+    private struct ButtonConfig {
+        let title: String
+        let isLoading: Bool
+        let isEnabled: Bool
+        let action: () -> Void
+    }
@@
-        return PrimaryButton(
-            title: config.title,
-            icon: config.icon,
-            isEnabled: config.isEnabled,
-            isLoading: config.isLoading,
-            action: config.action
-        )
+        return PrimaryButton(
+            title: config.title,
+            isEnabled: config.isEnabled,
+            isLoading: config.isLoading,
+            action: config.action
+        )
@@
-            return ButtonConfig(
-                title: String(localized: "session_button_end"),
-                icon: "stop.fill",
-                isLoading: false,
-                isEnabled: true,
-                action: { controller.stop() }
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_end"),
+                isLoading: false,
+                isEnabled: true,
+                action: { controller.stop() }
+            )
@@
-            return ButtonConfig(
-                title: String(localized: "session_button_connecting"),
-                icon: "hourglass",
-                isLoading: true,
-                isEnabled: false,
-                action: {}
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_connecting"),
+                isLoading: true,
+                isEnabled: false,
+                action: {}
+            )
@@
-            return ButtonConfig(
-                title: String(localized: "session_button_talk"),
-                icon: "mic.fill",
-                isLoading: false,
-                isEnabled: true,
-                action: {
+            return ButtonConfig(
+                title: String(localized: "session_button_talk"),
+                isLoading: false,
+                isEnabled: true,
+                action: {
                     let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
                     if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
                         appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
                         isShowingLimitModal = true
                         return
                     }
                     controller.start()
                 }
             )
*** End Patch
```

3) ManageSubscriptionSheet（NavigationStack化＋背景統一）

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
*** End Patch
```

4) SettingsView（Listの背景安定化＋背景統一）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
-            .navigationBarTitleDisplayMode(.inline)
+            .navigationBarTitleDisplayMode(.inline)
+            .scrollContentBackground(.hidden)
+            .background(AppBackground())
             .toolbar {
*** End Patch
```

（任意）iOS 18 固定で全体を NavigationStack へ統一

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
-    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
-    @ViewBuilder
-    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
-        if #available(iOS 16.0, *) {
-            NavigationStack {
-                content()
-            }
-        } else {
-            NavigationView {
-                content()
-            }
-        }
-    }
+    // iOS 18ターゲット: NavigationStackで統一
+    @ViewBuilder
+    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
+        NavigationStack { content() }
+    }
*** End Patch
```

（任意）Deployment Target の混在を解消（26.0 が残っている場合のみ）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios.xcodeproj/project.pbxproj
@@
-                IPHONEOS_DEPLOYMENT_TARGET = 26.0;
+                IPHONEOS_DEPLOYMENT_TARGET = 18.0;
*** End Patch
```

---

## 実装・適用順序（迷わないための一本化）

1. 既存 v3 の「DesignSystem追加（AppTheme/AppBackground/PrimaryButton）」と各画面の置換パッチを適用。
2. 本ドキュメントの「追加/修正擬似パッチ」を順に適用（1→4）。
3. （任意）NavigationStackの完全統一、`project.pbxproj` の 26.0 → 18.0 統一。

## 動作確認項目（抜粋）

- 主要画面で背景が `AppBackground()` に統一されている。
- `SessionView` の CTA が `connecting/connected/disconnected` で正しく状態変化する。
- `ManageSubscriptionSheet` が `NavigationStack` で背景も統一。
- `SettingsView` の `List` 背景が透過し、全体背景と調和。
- Dynamic Type 最小〜最大で崩れがない。

## 注意点

- Deployment Target は 18.0 維持（26.0 は無効/不整合）。
- テンプレの `IconButton` 相当が必要な場合は別途導入可能だが、本計画では `PrimaryButton` 集約のみで完結。

### To-dos

- [ ] v3のDesignSystem/画面置換パッチを適用（ベース反映）
- [ ] PrimaryButtonをテンプレ準拠APIへ更新（icon削除）
- [ ] SessionViewのボタン呼び出しを新APIへ変更
- [ ] ManageSubscription/Settingsに背景統一＋List透過を適用
- [ ] （任意）NavigationStackへ全体統一・PBXの18.0統一確認