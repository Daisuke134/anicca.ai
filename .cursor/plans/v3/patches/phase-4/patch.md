# Phase 4 (4.1〜4.3) — iOS Onboarding UI: Ideals / Struggles / Value 追加 + フロー配線（擬似パッチ）

目的: `todolist.md` の **フェーズ4 (4.1〜4.3)** を満たす「擬似パッチMD」を作る。  
出力先: `.cursor/plans/v3/patches/phase-4/patch.md`（本ファイル）

一次情報（必読・参照元）
- `/.cursor/plans/v3/v3-ui.md`（Onboarding確定UI: 01〜07）
- `/.cursor/plans/v3/migration-patch-v3.md`（1.4: OnboardingStep追加と rawValue シフト注意）
- `/.cursor/plans/v3/file-structure-v3.md`
- 既存実装（現状の実ファイルパスに基づく）
  - `aniccaios/aniccaios/Onboarding/*StepView.swift`
  - `aniccaios/aniccaios/ContentView.swift`
  - `aniccaios/aniccaios/Onboarding/OnboardingStep.swift`
  - `aniccaios/aniccaios/AppState.swift`（UserDefaults: onboardingStepKey の Int rawValue 保存/読み込み）

重要制約
- UI/UX（コピー/配置）は `v3-ui.md` を一次情報として厳守（推測で埋めない）
- 既存保存済み `OnboardingStep.rawValue` の移行は **現状実装（UserDefaults Int保存）に合わせて**設計する
- このMDは「擬似パッチ」。**コード/設定はまだ触らない**（適用は別フェーズ）

補足（重要）:
- この `patch.md` には説明のために `diff --git` 形式の断片が残っているが、**apply_patch で機械適用できる形式は V4A（Begin Patch〜End Patch のマーカー）だけ**。
- **本フェーズで authoritative として使うのは末尾の「V4A 完全パッチ」セクション**であり、それ以外の `diff --git` 断片は読み物（参考）として扱う。

---

## フェーズ4.1: Ideals / Struggles / Value 画面追加

### 4.1-1 `OnboardingStep` の新ステップ追加（重複防止: Phase 3 で実施）

- `todolist.md` 上、`OnboardingStep` の値シフト対応は **フェーズ3（3.3）**の責務。  
- よって本フェーズ4では、`OnboardingStep` 自体を再変更せず、**新ステップに対応した画面追加とフロー配線（OnboardingFlowView）**に集中する。

補足（値シフトの事実）
- 現状（Phase 4 前）の `OnboardingStep` は `Int` の連番 rawValue。
- `.ideals/.struggles/.value` を **途中挿入**するため、保存済み `onboardingStepKey(Int)` は **必ず再マップ**が必要。

---

### 4.1-2 新規: `IdealsStepView`（複数選択チップ + Skip/Next）

対象: `aniccaios/aniccaios/Onboarding/IdealsStepView.swift`（新規）

UI一次情報（v3-ui.md）
- タイトル: `Who do you want to become?`
- サブ: `Choose as many as you like.`
- チップ: 複数選択（例: Kind / Honest / Mindful / Confident / Early Riser / Runner / Healthy / Calm / Disciplined / Open / Courageous）
- 下: `Skip` / `Next`（2ボタン）

実装メモ（既存UIに合わせる）
- チップ見た目は既存 `SettingsView` の `idealTraitButton` と同系（`AppTheme.Colors.buttonSelected/unselected` 等）を流用
- 保存先は既存の `UserProfile.idealTraits: [String]`（現状 `AppState.updateIdealTraits(_:)` があるためそれを利用）

```diff
diff --git a/aniccaios/aniccaios/Onboarding/IdealsStepView.swift b/aniccaios/aniccaios/Onboarding/IdealsStepView.swift
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/aniccaios/aniccaios/Onboarding/IdealsStepView.swift
@@
+import SwiftUI
+
+struct IdealsStepView: View {
+    let next: () -> Void
+    @EnvironmentObject private var appState: AppState
+
+    // v3-ui.md の例（推測で増やさない）
+    private let options: [String] = [
+        "kind",
+        "honest",
+        "mindful",
+        "confident",
+        "early_riser",
+        "runner",
+        "healthy",
+        "calm",
+        "disciplined",
+        "open",
+        "courageous"
+    ]
+
+    @State private var selected: Set<String> = []
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_ideals_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(2)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            Text(String(localized: "onboarding_ideals_subtitle"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+                .multilineTextAlignment(.center)
+                .padding(.horizontal)
+
+            ScrollView {
+                LazyVGrid(
+                    columns: [GridItem(.adaptive(minimum: 110), spacing: 12)],
+                    spacing: 12
+                ) {
+                    ForEach(options, id: \.self) { key in
+                        chipButton(kind: "ideal_trait", key: key)
+                    }
+                }
+                .padding(.horizontal, 16) // v3-ui.md: 画面左右 16pt
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            HStack(spacing: 12) {
+                PrimaryButton(
+                    title: String(localized: "common_skip"),
+                    style: .unselected
+                ) {
+                    // v3-ui.md: Skip で次へ（空で保存）
+                    appState.updateIdealTraits([])
+                    next()
+                }
+                PrimaryButton(
+                    title: String(localized: "common_next"),
+                    style: .primary
+                ) {
+                    appState.updateIdealTraits(Array(selected))
+                    next()
+                }
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+        .onAppear {
+            selected = Set(appState.userProfile.idealTraits)
+        }
+    }
+
+    @ViewBuilder
+    private func chipButton(kind: String, key: String) -> some View {
+        let isSelected = selected.contains(key)
+        Button {
+            if isSelected {
+                selected.remove(key)
+            } else {
+                selected.insert(key)
+            }
+        } label: {
+            Text(NSLocalizedString("\(kind)_\(key)", comment: ""))
+                .font(.subheadline)
+                .fixedSize(horizontal: true, vertical: false)
+                .padding(.horizontal, 12)
+                .padding(.vertical, 8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+                .overlay(
+                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                        .stroke(
+                            isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight,
+                            lineWidth: isSelected ? 2 : 1
+                        )
+                )
+        }
+        .buttonStyle(.plain)
+    }
+}
```

---

### 4.1-3 新規: `StrugglesStepView`（複数選択チップ + Skip/Next）

対象: `aniccaios/aniccaios/Onboarding/StrugglesStepView.swift`（新規）

UI一次情報（v3-ui.md）
- タイトル: `What are you struggling with right now?`
- サブ: `Select everything that applies.`
- チップ例: Self-loathing / Rumination / Anxiety / Anger / Jealousy / Loneliness / Night scrolling / Can't wake up / No motivation / Procrastination
- 下: `Skip` / `Next`

保存先（現状実装に合わせる）
- `UserProfile.problems: [String]`（既存 `AppState.updateUserProfile(profile, sync: true)` 経由で保存）

```diff
diff --git a/aniccaios/aniccaios/Onboarding/StrugglesStepView.swift b/aniccaios/aniccaios/Onboarding/StrugglesStepView.swift
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/aniccaios/aniccaios/Onboarding/StrugglesStepView.swift
@@
+import SwiftUI
+
+struct StrugglesStepView: View {
+    let next: () -> Void
+    @EnvironmentObject private var appState: AppState
+
+    // v3-ui.md の例（推測で増やさない）
+    private let options: [String] = [
+        "self_loathing",
+        "rumination",
+        "anxiety",
+        "anger",
+        "jealousy",
+        "loneliness",
+        "night_scrolling",
+        "cant_wake_up",
+        "no_motivation",
+        "procrastination"
+    ]
+
+    @State private var selected: Set<String> = []
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_struggles_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(3)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            Text(String(localized: "onboarding_struggles_subtitle"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+                .multilineTextAlignment(.center)
+                .padding(.horizontal)
+
+            ScrollView {
+                LazyVGrid(
+                    columns: [GridItem(.adaptive(minimum: 140), spacing: 12)],
+                    spacing: 12
+                ) {
+                    ForEach(options, id: \.self) { key in
+                        chipButton(kind: "problem", key: key)
+                    }
+                }
+                .padding(.horizontal, 16)
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            HStack(spacing: 12) {
+                PrimaryButton(
+                    title: String(localized: "common_skip"),
+                    style: .unselected
+                ) {
+                    var profile = appState.userProfile
+                    profile.problems = []
+                    appState.updateUserProfile(profile, sync: true)
+                    next()
+                }
+                PrimaryButton(
+                    title: String(localized: "common_next"),
+                    style: .primary
+                ) {
+                    var profile = appState.userProfile
+                    profile.problems = Array(selected)
+                    appState.updateUserProfile(profile, sync: true)
+                    next()
+                }
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+        .onAppear {
+            selected = Set(appState.userProfile.problems)
+        }
+    }
+
+    @ViewBuilder
+    private func chipButton(kind: String, key: String) -> some View {
+        let isSelected = selected.contains(key)
+        Button {
+            if isSelected {
+                selected.remove(key)
+            } else {
+                selected.insert(key)
+            }
+        } label: {
+            Text(NSLocalizedString("\(kind)_\(key)", comment: ""))
+                .font(.subheadline)
+                .fixedSize(horizontal: true, vertical: false)
+                .padding(.horizontal, 12)
+                .padding(.vertical, 8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+        }
+        .buttonStyle(.plain)
+    }
+}
```

---

### 4.1-4 新規: `ValueStepView`（3カード + Continue）

対象: `aniccaios/aniccaios/Onboarding/ValueStepView.swift`（新規）

UI一次情報（v3-ui.md）
- タイトル: `What Anicca can do for you`
- 3縦カード:
  - 1枚目のみ「タイトル＋サブ」が明記されている  
    - タイトル: `Be there when you’re suffering`
    - サブ: `Press one button when you feel stuck. Anicca speaks first and helps you untangle.`
  - 2/3枚目は **サブ文のみが明記**（タイトルが一次情報に存在しないため推測で足さない）
    - サブ2: `Anicca quietly watches your sleep, screen time, and movement, and nudges you at the right moments.`
    - サブ3: `See how today’s choices shape your future self.`
- 下: `Continue` ボタン1つ

```diff
diff --git a/aniccaios/aniccaios/Onboarding/ValueStepView.swift b/aniccaios/aniccaios/Onboarding/ValueStepView.swift
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/aniccaios/aniccaios/Onboarding/ValueStepView.swift
@@
+import SwiftUI
+
+struct ValueStepView: View {
+    let next: () -> Void
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_value_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(2)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            ScrollView {
+                VStack(spacing: 16) {
+                    valueCard(
+                        leading: "😔💬",
+                        titleKey: "onboarding_value_card1_title",
+                        bodyKey: "onboarding_value_card1_body"
+                    )
+                    valueCard(
+                        leading: "⏰📱",
+                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
+                        bodyKey: "onboarding_value_card2_body"
+                    )
+                    valueCard(
+                        leading: "📅➡️",
+                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
+                        bodyKey: "onboarding_value_card3_body"
+                    )
+                }
+                .padding(.horizontal, 16)
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            PrimaryButton(
+                title: String(localized: "common_continue"),
+                style: .primary
+            ) {
+                next()
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+    }
+
+    @ViewBuilder
+    private func valueCard(
+        leading: String,
+        titleKey: String?,
+        bodyKey: String
+    ) -> some View {
+        CardView {
+            HStack(alignment: .top, spacing: 12) {
+                Text(leading)
+                    .font(.title2)
+                VStack(alignment: .leading, spacing: 6) {
+                    if let titleKey {
+                        Text(String(localized: titleKey))
+                            .font(.headline)
+                            .foregroundStyle(AppTheme.Colors.label)
+                    }
+                    Text(String(localized: bodyKey))
+                        .font(.subheadline)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+                Spacer(minLength: 0)
+            }
+            .padding()
+        }
+    }
+}
```

---

## フェーズ4.2: 既存 Welcome / Sign-in / Mic / Notifications の v3 コピー反映 + Skip/Continue 整理

### 4.2-1 文字列（一次情報: v3-ui.md を英語の厳密値として反映）

対象:
- `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`
- `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

#### 4.2-1a 既存 onboarding 文言を v3-ui に合わせて更新（英語）

```diff
diff --git a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
--- a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
-"onboarding_welcome_title" = "Welcome to Anicca";
-"onboarding_welcome_subtitle" = "Let's configure your routines.";
-"onboarding_welcome_cta" = "Get Started";
+"onboarding_welcome_title" = "Anicca";
+"onboarding_welcome_subtitle" = "Anicca is a voice guide that helps you change your habits and soften your suffering.";
+"onboarding_welcome_cta" = "Get started";
@@
 "onboarding_account_title" = "Sign in with Apple";
-"onboarding_account_description" = "Sign in to sync your habits and preferences across your devices.";
+"onboarding_account_description" = "Sign in to sync your data across devices.";
+
+"onboarding_account_skip" = "Skip for now";
@@
-"onboarding_microphone_title" = "Microphone Access";
-"onboarding_microphone_description" = "Anicca uses your microphone for wake-up calls and habit reminders. You can keep going without enabling it and turn it on anytime from Settings.";
+"onboarding_microphone_title" = "Microphone access";
+"onboarding_microphone_description" = "Anicca listens to you through the microphone so you can talk freely. Your voice is processed securely on your device and servers.";
+"onboarding_microphone_allow" = "Allow microphone";
+"onboarding_permission_status_allowed" = "Allowed";
+"onboarding_permission_status_not_allowed" = "Not allowed";
@@
-"onboarding_notifications_title" = "Time-Sensitive Alerts";
-"onboarding_notifications_description" = "Notifications help Anicca nudge your habits (wake-up, training, bedtime), but they're optional and work even if you silence your phone.";
+"onboarding_notifications_title" = "Notifications";
+"onboarding_notifications_description" = "Anicca uses notifications to gently nudge you at the right moments — for waking up, putting your phone down, or taking a break.";
+"onboarding_notifications_allow" = "Allow notifications";
```

#### 4.2-1b フェーズ4.1 で追加した新キー（英語）

```diff
diff --git a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
--- a/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
+"common_skip" = "Skip";
+"common_next" = "Next";
+
+"onboarding_ideals_title" = "Who do you want to become?";
+"onboarding_ideals_subtitle" = "Choose as many as you like.";
+
+"onboarding_struggles_title" = "What are you struggling with right now?";
+"onboarding_struggles_subtitle" = "Select everything that applies.";
+
+"onboarding_value_title" = "What Anicca can do for you";
+"onboarding_value_card1_title" = "Be there when you’re suffering";
+"onboarding_value_card1_body" = "Press one button when you feel stuck. Anicca speaks first and helps you untangle.";
+"onboarding_value_card2_body" = "Anicca quietly watches your sleep, screen time, and movement, and nudges you at the right moments.";
+"onboarding_value_card3_body" = "See how today’s choices shape your future self.";
+
+// Ideal chips (v3-ui.md 例)
+"ideal_trait_kind" = "Kind";
+"ideal_trait_honest" = "Honest";
+"ideal_trait_mindful" = "Mindful";
+"ideal_trait_confident" = "Confident";
+"ideal_trait_early_riser" = "Early Riser";
+"ideal_trait_runner" = "Runner";
+"ideal_trait_healthy" = "Healthy";
+"ideal_trait_calm" = "Calm";
+"ideal_trait_disciplined" = "Disciplined";
+"ideal_trait_open" = "Open";
+"ideal_trait_courageous" = "Courageous";
+
+// Struggle chips (v3-ui.md 例)
+"problem_self_loathing" = "Self-loathing";
+"problem_rumination" = "Rumination";
+"problem_anxiety" = "Anxiety";
+"problem_anger" = "Anger";
+"problem_jealousy" = "Jealousy";
+"problem_loneliness" = "Loneliness";
+"problem_night_scrolling" = "Night scrolling";
+"problem_cant_wake_up" = "Can't wake up";
+"problem_no_motivation" = "No motivation";
+"problem_procrastination" = "Procrastination";
```

#### 4.2-1c 日本語（方針）
- v3-ui.md は英語が一次情報だが、現状 repo は `ja/en` 両方を持つため、**意味が一致する範囲**で日本語も併記する。
- ただし翻訳は一次情報ではないため、厳密一致要件があるのは英語（`en.lproj`）とする。

```diff
diff --git a/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings b/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
--- a/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
-"onboarding_welcome_title" = "Aniccaへようこそ";
-"onboarding_welcome_subtitle" = "一緒にルーティンを整えましょう。";
-"onboarding_welcome_cta" = "はじめる";
+"onboarding_welcome_title" = "Anicca";
+"onboarding_welcome_subtitle" = "音声ガイドとして、習慣を変え、苦しみをやわらげるお手伝いをします。";
+"onboarding_welcome_cta" = "はじめる";
@@
 "onboarding_account_title" = "Sign in with Apple";
 "onboarding_account_description" = "デバイス間で習慣や設定を同期するためにサインインしてください。";
+"onboarding_account_skip" = "今はスキップ";
@@
-"onboarding_microphone_title" = "マイクアクセス";
-"onboarding_microphone_description" = "Aniccaは起床コールや習慣リマインダーのためにマイクを使いますが、許可しなくても続行できます。必要になったら設定アプリからいつでもオンにできます。";
+"onboarding_microphone_title" = "マイクアクセス";
+"onboarding_microphone_description" = "Aniccaはマイクを通してあなたの声を聞き、自由に会話できるようにします。音声はデバイスとサーバーで安全に処理されます。";
+"onboarding_microphone_allow" = "マイクを許可";
+"onboarding_permission_status_allowed" = "許可済み";
+"onboarding_permission_status_not_allowed" = "未許可";
@@
-"onboarding_notifications_title" = "通知アラート";
-"onboarding_notifications_description" = "通知は習慣（起床・トレーニング・就寝）を思い出させるために便利ですが、必須ではありません。端末がサイレントでも動作します。";
+"onboarding_notifications_title" = "通知";
+"onboarding_notifications_description" = "Aniccaは、起床・スマホを置く・休憩するなど、適切なタイミングでやさしく促すために通知を使います。";
+"onboarding_notifications_allow" = "通知を許可";
@@
+"common_skip" = "スキップ";
+"common_next" = "次へ";
+
+"onboarding_ideals_title" = "どんな自分になりたいですか？";
+"onboarding_ideals_subtitle" = "いくつでも選べます。";
+
+"onboarding_struggles_title" = "いま何に苦しんでいますか？";
+"onboarding_struggles_subtitle" = "当てはまるものをすべて選んでください。";
+
+"onboarding_value_title" = "Aniccaができること";
+"onboarding_value_card1_title" = "つらいときに寄り添う";
+"onboarding_value_card1_body" = "行き詰まったときにボタンを押すだけ。Aniccaが先に話し、ほどいていくのを助けます。";
+"onboarding_value_card2_body" = "睡眠・スクリーンタイム・動きを静かに見守り、適切なタイミングでそっと促します。";
+"onboarding_value_card3_body" = "今日の選択が未来の自分にどうつながるかを見える化します。";
+
+// Ideal chips
+"ideal_trait_honest" = "誠実";
+"ideal_trait_confident" = "自信がある";
+"ideal_trait_early_riser" = "早起き";
+"ideal_trait_runner" = "ランナー";
+"ideal_trait_healthy" = "健康的";
+"ideal_trait_open" = "オープン";
+"ideal_trait_courageous" = "勇敢";
+
+// Struggle chips
+"problem_self_loathing" = "自己嫌悪";
+"problem_anger" = "怒り";
+"problem_loneliness" = "孤独";
+"problem_night_scrolling" = "夜のスクロール";
+"problem_cant_wake_up" = "起きられない";
+"problem_no_motivation" = "やる気が出ない";
+"problem_procrastination" = "先延ばし";
```

※ 既存キー（`ideal_trait_kind`, `ideal_trait_mindful`, `ideal_trait_calm`, `problem_rumination`, `problem_jealousy`, `problem_anxiety` 等）は既に存在するため上書き/追記は重複しないように調整する。

---

### 4.2-2 Sign in with Apple 画面に「Skip for now（リンク）」を追加

対象: `aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift`

UI一次情報（v3-ui.md）
- 下: `Skip for now`（リンク）

```diff
diff --git a/aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift b/aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
--- a/aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
+++ b/aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
@@
 struct AuthenticationStepView: View {
@@
     var body: some View {
         VStack(spacing: 24) {
@@
             SignInWithAppleButton(.signIn) { request in
                 AuthCoordinator.shared.configure(request)
             } onCompletion: { result in
                 AuthCoordinator.shared.completeSignIn(result: result)
             }
@@
             .onChange(of: appState.authStatus) { status in
                 handleAuthStatusChange(status)
             }
+
+            Button(String(localized: "onboarding_account_skip")) {
+                // v3-ui.md: Skip for now で次へ
+                next()
+            }
+            .buttonStyle(.plain)
+            .font(.subheadline)
+            .foregroundStyle(.secondary)
+            .padding(.top, 4)
@@
         }
     }
 }
```

---

### 4.2-3 Mic / Notifications の CTA を v3-ui 仕様へ（Continue → Allow ...）

対象:
- `aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift`
- `aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift`

UI一次情報（v3-ui.md）
- ボタンラベル:
  - Mic: `Allow microphone`
  - Notifications: `Allow notifications`
- 状態ラベル: `Not allowed` / `Allowed`

```diff
diff --git a/aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift b/aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
--- a/aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
+++ b/aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
@@
     var body: some View {
         VStack(spacing: 24) {
@@
-            if micGranted {
-                // 許可済み: ステータスを表示しボタンは無効
-                Label(String(localized: "common_enabled"), systemImage: "checkmark.circle")
-                    .font(.subheadline)
-                    .foregroundStyle(AppTheme.Colors.label)
-                PrimaryButton(
-                    title: String(localized: "common_enabled"),
-                    isEnabled: false,
-                    isLoading: false,
-                    style: .selected
-                ) { }
-            } else {
-                PrimaryButton(
-                    title: isRequesting
-                        ? String(localized: "common_requesting")
-                        : String(localized: "common_continue"),
-                    isEnabled: !isRequesting,
-                    isLoading: isRequesting
-                ) { requestMicrophone() }
-            }
+            Text(String(localized: micGranted ? "onboarding_permission_status_allowed" : "onboarding_permission_status_not_allowed"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+
+            PrimaryButton(
+                title: isRequesting
+                    ? String(localized: "common_requesting")
+                    : String(localized: "onboarding_microphone_allow"),
+                isEnabled: !isRequesting && !micGranted,
+                isLoading: isRequesting,
+                style: micGranted ? .selected : .primary
+            ) { requestMicrophone() }
@@
         }
     }
```

```diff
diff --git a/aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift b/aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
--- a/aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
+++ b/aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
@@
     var body: some View {
         VStack(spacing: 24) {
@@
-            if notificationGranted {
-                Label(String(localized: "common_enabled"), systemImage: "checkmark.circle")
-                    .font(.subheadline)
-                    .foregroundStyle(AppTheme.Colors.label)
-                PrimaryButton(
-                    title: String(localized: "common_enabled"),
-                    isEnabled: false,
-                    isLoading: false,
-                    style: .selected
-                ) { }
-            } else {
-                PrimaryButton(
-                    title: isRequesting
-                        ? String(localized: "common_requesting")
-                        : String(localized: "common_continue"),
-                    isEnabled: !isRequesting,
-                    isLoading: isRequesting
-                ) { requestNotifications() }
-            }
+            Text(String(localized: notificationGranted ? "onboarding_permission_status_allowed" : "onboarding_permission_status_not_allowed"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+
+            PrimaryButton(
+                title: isRequesting
+                    ? String(localized: "common_requesting")
+                    : String(localized: "onboarding_notifications_allow"),
+                isEnabled: !isRequesting && !notificationGranted,
+                isLoading: isRequesting,
+                style: notificationGranted ? .selected : .primary
+            ) { requestNotifications() }
@@
         }
     }
```

---

## フェーズ4.3: Onboarding フロー配線（新ステップ順 + rawValue移行）

### 4.3-1 OnboardingFlowView の画面分岐と遷移順を v3 に差し替え

対象: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

仕様（todolist.md 4.3）
- `.welcome → ideals → struggles → value → account → microphone → notifications → habitSetup ...`

```diff
diff --git a/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift b/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
--- a/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
+++ b/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
@@
                 switch step {
                 case .welcome:
                     WelcomeStepView(next: advance)
+                case .ideals:
+                    IdealsStepView(next: advance)
+                case .struggles:
+                    StrugglesStepView(next: advance)
+                case .value:
+                    ValueStepView(next: advance)
                 case .microphone:
                     MicrophonePermissionStepView(next: advance)
                 case .notifications:
                     NotificationPermissionStepView(next: advance)
                 case .account:
                     AuthenticationStepView(next: advance)
@@
     private func advance() {
         switch step {
         case .welcome:
-            step = .microphone
-        case .microphone:
-            step = .notifications
-        case .notifications:
-            step = .account
-        case .account:
-            step = .habitSetup
+            step = .ideals
+        case .ideals:
+            step = .struggles
+        case .struggles:
+            step = .value
+        case .value:
+            step = .account
+        case .account:
+            step = .microphone
+        case .microphone:
+            step = .notifications
+        case .notifications:
+            step = .habitSetup
             // プロフィール完了時にオファリングをプリフェッチ（Paywall表示の準備）
             Task {
                 await SubscriptionManager.shared.refreshOfferings()
             }
@@
         }
         appState.setOnboardingStep(step)
     }
```

---

### 4.3-2 AppState: 旧rawValue→新enum の「値シフト移行」（重複防止: Phase 3 で実施）

対象: `aniccaios/aniccaios/AppState.swift`

現状一次情報（AppState.swift）
- UserDefaults:
  - `onboardingStepKey = "com.anicca.onboardingStep"`
  - 値は `Int`（`defaults.integer(forKey:)`）
- 現状の特例:
  - `rawValue == 4` を `.habitSetup` にマップ（コメント: 旧.profile）

Phase 4 での要件
- `OnboardingStep` に `.ideals/.struggles/.value` を追加し rawValue がシフトするため、**旧保存値を新enumへマップ**する必要がある。
- ただしこれは **フェーズ3（3.3）で `OnboardingStep.migratedFromLegacyRawValue` 等として実装済み**とし、本フェーズでは二重実装しない。

移行方針（妄想しない）
- 旧 rawValue の意味は「Phase 4 前の `OnboardingStep`」の並び（現状コード）に限定する
  - `0: welcome, 1: microphone, 2: notifications, 3: account, 4: habitSetup, 5: habitWakeLocation, 6: habitSleepLocation, 7: habitTrainingFocus, 8: paywall, 9: completion`
- その旧値を **新 enum の case 名**に変換する（新 rawValue を直接計算しない）

（この差分は Phase 3 側に寄せるため、ここでは削除）

---

## V4A 完全パッチ（apply_patch 互換 / authoritative）

> 重要: 以降は **V4A形式のみ**。このセクションのブロックを順に apply_patch すれば、フェーズ4の変更が機械適用できる。

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Onboarding/IdealsStepView.swift
+import SwiftUI
+
+struct IdealsStepView: View {
+    let next: () -> Void
+    @EnvironmentObject private var appState: AppState
+
+    // v3-ui.md の例（推測で増やさない）
+    private let options: [String] = [
+        "kind",
+        "honest",
+        "mindful",
+        "confident",
+        "early_riser",
+        "runner",
+        "healthy",
+        "calm",
+        "disciplined",
+        "open",
+        "courageous"
+    ]
+
+    @State private var selected: Set<String> = []
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_ideals_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(2)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            Text(String(localized: "onboarding_ideals_subtitle"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+                .multilineTextAlignment(.center)
+                .padding(.horizontal)
+
+            ScrollView {
+                LazyVGrid(
+                    columns: [GridItem(.adaptive(minimum: 110), spacing: 12)],
+                    spacing: 12
+                ) {
+                    ForEach(options, id: \.self) { key in
+                        chipButton(kind: "ideal_trait", key: key)
+                    }
+                }
+                .padding(.horizontal, 16) // v3-ui.md: 画面左右 16pt
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            HStack(spacing: 12) {
+                PrimaryButton(
+                    title: String(localized: "common_skip"),
+                    style: .unselected
+                ) {
+                    // v3-ui.md: Skip で次へ（空で保存）
+                    appState.updateIdealTraits([])
+                    next()
+                }
+                PrimaryButton(
+                    title: String(localized: "common_next"),
+                    style: .primary
+                ) {
+                    appState.updateIdealTraits(Array(selected))
+                    next()
+                }
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+        .onAppear {
+            selected = Set(appState.userProfile.idealTraits)
+        }
+    }
+
+    @ViewBuilder
+    private func chipButton(kind: String, key: String) -> some View {
+        let isSelected = selected.contains(key)
+        Button {
+            if isSelected {
+                selected.remove(key)
+            } else {
+                selected.insert(key)
+            }
+        } label: {
+            Text(NSLocalizedString("\(kind)_\(key)", comment: ""))
+                .font(.subheadline)
+                .fixedSize(horizontal: true, vertical: false)
+                .padding(.horizontal, 12)
+                .padding(.vertical, 8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+                .overlay(
+                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                        .stroke(
+                            isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight,
+                            lineWidth: isSelected ? 2 : 1
+                        )
+                )
+        }
+        .buttonStyle(.plain)
+    }
+}
+
*** Add File: aniccaios/aniccaios/Onboarding/StrugglesStepView.swift
+import SwiftUI
+
+struct StrugglesStepView: View {
+    let next: () -> Void
+    @EnvironmentObject private var appState: AppState
+
+    // v3-ui.md の例（推測で増やさない）
+    private let options: [String] = [
+        "self_loathing",
+        "rumination",
+        "anxiety",
+        "anger",
+        "jealousy",
+        "loneliness",
+        "night_scrolling",
+        "cant_wake_up",
+        "no_motivation",
+        "procrastination"
+    ]
+
+    @State private var selected: Set<String> = []
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_struggles_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(3)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            Text(String(localized: "onboarding_struggles_subtitle"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+                .multilineTextAlignment(.center)
+                .padding(.horizontal)
+
+            ScrollView {
+                LazyVGrid(
+                    columns: [GridItem(.adaptive(minimum: 140), spacing: 12)],
+                    spacing: 12
+                ) {
+                    ForEach(options, id: \.self) { key in
+                        chipButton(kind: "problem", key: key)
+                    }
+                }
+                .padding(.horizontal, 16)
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            HStack(spacing: 12) {
+                PrimaryButton(
+                    title: String(localized: "common_skip"),
+                    style: .unselected
+                ) {
+                    var profile = appState.userProfile
+                    profile.problems = []
+                    appState.updateUserProfile(profile, sync: true)
+                    next()
+                }
+                PrimaryButton(
+                    title: String(localized: "common_next"),
+                    style: .primary
+                ) {
+                    var profile = appState.userProfile
+                    profile.problems = Array(selected)
+                    appState.updateUserProfile(profile, sync: true)
+                    next()
+                }
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+        .onAppear {
+            selected = Set(appState.userProfile.problems)
+        }
+    }
+
+    @ViewBuilder
+    private func chipButton(kind: String, key: String) -> some View {
+        let isSelected = selected.contains(key)
+        Button {
+            if isSelected {
+                selected.remove(key)
+            } else {
+                selected.insert(key)
+            }
+        } label: {
+            Text(NSLocalizedString("\(kind)_\(key)", comment: ""))
+                .font(.subheadline)
+                .fixedSize(horizontal: true, vertical: false)
+                .padding(.horizontal, 12)
+                .padding(.vertical, 8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+        }
+        .buttonStyle(.plain)
+    }
+}
+
*** Add File: aniccaios/aniccaios/Onboarding/ValueStepView.swift
+import SwiftUI
+
+struct ValueStepView: View {
+    let next: () -> Void
+
+    var body: some View {
+        VStack(spacing: 24) {
+            Text(String(localized: "onboarding_value_title"))
+                .font(AppTheme.Typography.onboardingTitle)
+                .fontWeight(.heavy)
+                .lineLimit(2)
+                .minimumScaleFactor(0.8)
+                .multilineTextAlignment(.center)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
+
+            ScrollView {
+                VStack(spacing: 16) {
+                    valueCard(
+                        leading: "😔💬",
+                        titleKey: "onboarding_value_card1_title",
+                        bodyKey: "onboarding_value_card1_body"
+                    )
+                    valueCard(
+                        leading: "⏰📱",
+                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
+                        bodyKey: "onboarding_value_card2_body"
+                    )
+                    valueCard(
+                        leading: "📅➡️",
+                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
+                        bodyKey: "onboarding_value_card3_body"
+                    )
+                }
+                .padding(.horizontal, 16)
+                .padding(.top, 8)
+            }
+
+            Spacer()
+
+            PrimaryButton(
+                title: String(localized: "common_continue"),
+                style: .primary
+            ) {
+                next()
+            }
+            .padding(.horizontal, 16)
+            .padding(.bottom)
+        }
+        .background(AppBackground())
+    }
+
+    @ViewBuilder
+    private func valueCard(
+        leading: String,
+        titleKey: String?,
+        bodyKey: String
+    ) -> some View {
+        CardView {
+            HStack(alignment: .top, spacing: 12) {
+                Text(leading)
+                    .font(.title2)
+                VStack(alignment: .leading, spacing: 6) {
+                    if let titleKey {
+                        Text(String(localized: titleKey))
+                            .font(.headline)
+                            .foregroundStyle(AppTheme.Colors.label)
+                    }
+                    Text(String(localized: bodyKey))
+                        .font(.subheadline)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+                Spacer(minLength: 0)
+            }
+            .padding()
+        }
+    }
+}
+
*** Update File: aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
@@
 struct AuthenticationStepView: View {
@@
     var body: some View {
         VStack(spacing: 24) {
@@
             .onChange(of: appState.authStatus) { status in
                 handleAuthStatusChange(status)
             }
+
+            Button(String(localized: "onboarding_account_skip")) {
+                // v3-ui.md: Skip for now で次へ
+                next()
+            }
+            .buttonStyle(.plain)
+            .font(.subheadline)
+            .foregroundStyle(.secondary)
+            .padding(.top, 4)
@@
         }
     }
 }

*** Update File: aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
@@
     var body: some View {
         VStack(spacing: 24) {
@@
-            if micGranted {
-                // 許可済み: ステータスを表示しボタンは無効
-                Label(String(localized: "common_enabled"), systemImage: "checkmark.circle")
-                    .font(.subheadline)
-                    .foregroundStyle(AppTheme.Colors.label)
-                PrimaryButton(
-                    title: String(localized: "common_enabled"),
-                    isEnabled: false,
-                    isLoading: false,
-                    style: .selected
-                ) { }
-            } else {
-                PrimaryButton(
-                    title: isRequesting
-                        ? String(localized: "common_requesting")
-                        : String(localized: "common_continue"),
-                    isEnabled: !isRequesting,
-                    isLoading: isRequesting
-                ) { requestMicrophone() }
-            }
+            Text(String(localized: micGranted ? "onboarding_permission_status_allowed" : "onboarding_permission_status_not_allowed"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+
+            PrimaryButton(
+                title: isRequesting
+                    ? String(localized: "common_requesting")
+                    : String(localized: "onboarding_microphone_allow"),
+                isEnabled: !isRequesting && !micGranted,
+                isLoading: isRequesting,
+                style: micGranted ? .selected : .primary
+            ) { requestMicrophone() }
@@
         }
     }

*** Update File: aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
@@
     var body: some View {
         VStack(spacing: 24) {
@@
-            if notificationGranted {
-                Label(String(localized: "common_enabled"), systemImage: "checkmark.circle")
-                    .font(.subheadline)
-                    .foregroundStyle(AppTheme.Colors.label)
-                PrimaryButton(
-                    title: String(localized: "common_enabled"),
-                    isEnabled: false,
-                    isLoading: false,
-                    style: .selected
-                ) { }
-            } else {
-                PrimaryButton(
-                    title: isRequesting
-                        ? String(localized: "common_requesting")
-                        : String(localized: "common_continue"),
-                    isEnabled: !isRequesting,
-                    isLoading: isRequesting
-                ) { requestNotifications() }
-            }
+            Text(String(localized: notificationGranted ? "onboarding_permission_status_allowed" : "onboarding_permission_status_not_allowed"))
+                .font(.subheadline)
+                .foregroundStyle(.secondary)
+
+            PrimaryButton(
+                title: isRequesting
+                    ? String(localized: "common_requesting")
+                    : String(localized: "onboarding_notifications_allow"),
+                isEnabled: !isRequesting && !notificationGranted,
+                isLoading: isRequesting,
+                style: notificationGranted ? .selected : .primary
+            ) { requestNotifications() }
@@
         }
     }

*** Update File: aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
@@
                 switch step {
                 case .welcome:
                     WelcomeStepView(next: advance)
+                case .ideals:
+                    IdealsStepView(next: advance)
+                case .struggles:
+                    StrugglesStepView(next: advance)
+                case .value:
+                    ValueStepView(next: advance)
                 case .microphone:
                     MicrophonePermissionStepView(next: advance)
                 case .notifications:
                     NotificationPermissionStepView(next: advance)
                 case .account:
                     AuthenticationStepView(next: advance)
@@
     private func advance() {
         switch step {
         case .welcome:
-            step = .microphone
-        case .microphone:
-            step = .notifications
-        case .notifications:
-            step = .account
-        case .account:
-            step = .habitSetup
+            step = .ideals
+        case .ideals:
+            step = .struggles
+        case .struggles:
+            step = .value
+        case .value:
+            step = .account
+        case .account:
+            step = .microphone
+        case .microphone:
+            step = .notifications
+        case .notifications:
+            step = .habitSetup
             // プロフィール完了時にオファリングをプリフェッチ（Paywall表示の準備）
             Task {
                 await SubscriptionManager.shared.refreshOfferings()
             }
@@
         }
         appState.setOnboardingStep(step)
     }

*** Update File: aniccaios/aniccaios/ContentView.swift
@@
         } else if !appState.isOnboardingComplete {
             OnboardingFlowView()
         } else {
             switch appState.authStatus {
             case .signedOut:
-                OnboardingFlowView()
+                // v3-ui.md: Sign in は Skip 可能。オンボーディング完了後はアプリに進める。
+                MainTabView()
             case .signingIn:
                 AuthenticationProcessingView()
             case .signedIn:
                 MainTabView()
             }
         }
     }
 }

*** Update File: aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
 "onboarding_welcome_title" = "Anicca";
 "onboarding_welcome_subtitle" = "Anicca is a voice guide that helps you change your habits and soften your suffering.";
 "onboarding_welcome_cta" = "Get started";
@@
 "onboarding_account_title" = "Sign in with Apple";
 "onboarding_account_description" = "Sign in to sync your data across devices.";
+"onboarding_account_skip" = "Skip for now";
@@
 "onboarding_microphone_title" = "Microphone access";
 "onboarding_microphone_description" = "Anicca listens to you through the microphone so you can talk freely. Your voice is processed securely on your device and servers.";
+"onboarding_microphone_allow" = "Allow microphone";
+"onboarding_permission_status_allowed" = "Allowed";
+"onboarding_permission_status_not_allowed" = "Not allowed";
@@
 "onboarding_notifications_title" = "Notifications";
 "onboarding_notifications_description" = "Anicca uses notifications to gently nudge you at the right moments — for waking up, putting your phone down, or taking a break.";
+"onboarding_notifications_allow" = "Allow notifications";
+
+"common_skip" = "Skip";
+"common_next" = "Next";
+"common_continue" = "Continue";
+
+"onboarding_ideals_title" = "Who do you want to become?";
+"onboarding_ideals_subtitle" = "Choose as many as you like.";
+
+"onboarding_struggles_title" = "What are you struggling with right now?";
+"onboarding_struggles_subtitle" = "Select everything that applies.";
+
+"onboarding_value_title" = "What Anicca can do for you";
+"onboarding_value_card1_title" = "Be there when you’re suffering";
+"onboarding_value_card1_body" = "Press one button when you feel stuck. Anicca speaks first and helps you untangle.";
+"onboarding_value_card2_body" = "Anicca quietly watches your sleep, screen time, and movement, and nudges you at the right moments.";
+"onboarding_value_card3_body" = "See how today’s choices shape your future self.";
+
+"ideal_trait_kind" = "Kind";
+"ideal_trait_honest" = "Honest";
+"ideal_trait_mindful" = "Mindful";
+"ideal_trait_confident" = "Confident";
+"ideal_trait_early_riser" = "Early Riser";
+"ideal_trait_runner" = "Runner";
+"ideal_trait_healthy" = "Healthy";
+"ideal_trait_calm" = "Calm";
+"ideal_trait_disciplined" = "Disciplined";
+"ideal_trait_open" = "Open";
+"ideal_trait_courageous" = "Courageous";
+
+"problem_self_loathing" = "Self-loathing";
+"problem_rumination" = "Rumination";
+"problem_anxiety" = "Anxiety";
+"problem_anger" = "Anger";
+"problem_jealousy" = "Jealousy";
+"problem_loneliness" = "Loneliness";
+"problem_night_scrolling" = "Night scrolling";
+"problem_cant_wake_up" = "Can't wake up";
+"problem_no_motivation" = "No motivation";
+"problem_procrastination" = "Procrastination";

*** Update File: aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
 "onboarding_welcome_title" = "Anicca";
 "onboarding_welcome_subtitle" = "音声ガイドとして、習慣を変え、苦しみをやわらげるお手伝いをします。";
 "onboarding_welcome_cta" = "はじめる";
@@
 "onboarding_account_title" = "Sign in with Apple";
+"onboarding_account_skip" = "今はスキップ";
@@
 "onboarding_microphone_title" = "マイクアクセス";
 "onboarding_microphone_description" = "Aniccaはマイクを通してあなたの声を聞き、自由に会話できるようにします。音声はデバイスとサーバーで安全に処理されます。";
+"onboarding_microphone_allow" = "マイクを許可";
+"onboarding_permission_status_allowed" = "許可済み";
+"onboarding_permission_status_not_allowed" = "未許可";
@@
 "onboarding_notifications_title" = "通知";
 "onboarding_notifications_description" = "Aniccaは、起床・スマホを置く・休憩するなど、適切なタイミングでやさしく促すために通知を使います。";
+"onboarding_notifications_allow" = "通知を許可";
+
+"common_skip" = "スキップ";
+"common_next" = "次へ";
+"common_continue" = "続ける";
+
+"onboarding_ideals_title" = "どんな自分になりたいですか？";
+"onboarding_ideals_subtitle" = "いくつでも選べます。";
+
+"onboarding_struggles_title" = "いま何に苦しんでいますか？";
+"onboarding_struggles_subtitle" = "当てはまるものをすべて選んでください。";
+
+"onboarding_value_title" = "Aniccaができること";
+"onboarding_value_card1_title" = "つらいときに寄り添う";
+"onboarding_value_card1_body" = "行き詰まったときにボタンを押すだけ。Aniccaが先に話し、ほどいていくのを助けます。";
+"onboarding_value_card2_body" = "睡眠・スクリーンタイム・動きを静かに見守り、適切なタイミングでそっと促します。";
+"onboarding_value_card3_body" = "今日の選択が未来の自分にどうつながるかを見える化します。";

*** End Patch
```

---

### 4.3-3 ContentView: 「Sign-in を Skip しても進める」ためのルーティング整合

一次情報（v3-ui.md）
- Sign in with Apple は `Skip for now` が存在する（任意）

現状一次情報（ContentView.swift）
- `isOnboardingComplete == true` でも `authStatus == .signedOut` の場合 `OnboardingFlowView()` を表示し続ける
  - これだと `Skip for now` 後にアプリへ進めない

最小の整合（UI/UXを増やさず、v3-ui の “Skip” を成立させる）
- `isOnboardingComplete == true` の場合は `MainTabView()` を表示（ただし Talk は既に `AuthRequiredPlaceholderView` があるため破綻しない）

対象: `aniccaios/aniccaios/ContentView.swift`

```diff
diff --git a/aniccaios/aniccaios/ContentView.swift b/aniccaios/aniccaios/ContentView.swift
--- a/aniccaios/aniccaios/ContentView.swift
+++ b/aniccaios/aniccaios/ContentView.swift
@@
         } else if !appState.isOnboardingComplete {
             OnboardingFlowView()
         } else {
             switch appState.authStatus {
             case .signedOut:
-                OnboardingFlowView()
+                // v3-ui.md: Sign in は Skip 可能。オンボーディング完了後はアプリに進める。
+                MainTabView()
             case .signingIn:
                 AuthenticationProcessingView()
             case .signedIn:
                 MainTabView()
             }
         }
     }
 }
```

---

## 実装後の確認観点（フェーズ4の範囲）

- **コピー一致（英語）**: `v3-ui.md` の文言が `en.lproj/Localizable.strings` に **完全一致**していること
- **フロー順**: `welcome → ideals → struggles → value → account → microphone → notifications → habitSetup`
- **rawValue移行**: 旧 `onboardingStepKey(Int)` を保持している端末でクラッシュせず、意図したステップに解決されること
- **Skip動作**:
  - Ideals/Struggles: Skip で空保存 → 次へ
  - Account: Skip for now → 次へ（Onboarding完了後にMainへ到達可能）


