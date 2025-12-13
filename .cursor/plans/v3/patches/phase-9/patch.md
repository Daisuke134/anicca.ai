# Anicca v0.3 フェーズ9 擬似パッチ

## 概要
- 対象フェーズ: 9
- 対象タスク: `9.1`〜`9.4`
- 目的（フェーズ9）:
  - **Info.plist の権限目的文言**を v0.3 仕様に揃える（Health/Motion/Mic/AlarmKit）
  - **手動テストチェックリスト**を 1 ファイルで提供する
  - **未許可/未連携時の Fallback UX**（「それでもTalkは使える」を明示）を追加する
  - **Wake サイレント説明**を Just-in-time で **1回だけ**出す（v3-ui仕様準拠）

## 対象タスク（todolist.md から）
- `.cursor/plans/v3/todolist.md`（フェーズ9）
  - `9.1 Info.plist 権限文言更新`
  - `9.2 手動動作確認チェックリスト作成`
  - `9.3 Fallback/未許可UX文言確認`
  - `9.4 Wakeサイレント説明モーダル`

## 参照仕様（v3）
- `.cursor/plans/v3/v3-ui.md`（「Wake Silent 説明モーダル（Just-in-time）」）
- `.cursor/plans/v3/v3-stack.md`（セクション 14.5「失敗時の fallback UX」）
- `.cursor/plans/v3/migration-patch-v3.md`（セクション 4「Info.plist の変更（計画）」）
- 既存コード:
  - `aniccaios/aniccaios/Info.plist`
  - `aniccaios/aniccaios/Resources/*/InfoPlist.strings`
  - `aniccaios/aniccaios/SettingsView.swift`
  - `aniccaios/aniccaios/SessionView.swift`（Wakeサイレント表示の既存実装あり）
  - `aniccaios/aniccaios/AppState.swift`

## 参照した公式URL一覧（妄想禁止のための一次情報）
> **UsageDescription のキー要件**は Apple の一次情報（Information Property List Key）を根拠にする。

### Apple: Info.plist の UsageDescription（キー定義）
- `https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription/`
- `https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription/`
- `https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthupdateusagedescription/`
- `https://developer.apple.com/documentation/bundleresources/information-property-list/nsmotionusagedescription/`
- `https://developer.apple.com/documentation/bundleresources/information-property-list/nsalarmkitusagedescription/`

### Apple: 通知の許諾（重要: Info.plist に UsageDescription キーがある前提にしない）
- `https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications`

### Apple: FamilyControls / DeviceActivity（フェーズ7依存の前提の一次情報）
- `https://developer.apple.com/documentation/familycontrols/`
- `https://developer.apple.com/documentation/deviceactivity`

## 注意（妄想/誤キー混入の防止）
- このリポジトリには `NSUserNotificationsUsageDescription` が既に存在するが、Apple の Info.plist Key 一覧（BundleResources）として一次情報で確認できないため、**「OSが表示するUsageDescriptionとして必須」とは断定しない**。
  - 通知の権限は、一次情報（上記）に従い `UNUserNotificationCenter.requestAuthorization` の文脈で取得する。
- FamilyControls についても同様に、一次情報上は entitlement / API が中心であり、**「NSFamilyControlsUsageDescription」という Info.plist キーの存在を一次情報で確認できない**ため、フェーズ9では Info.plist キー追加ではなく、**アプリ内の説明コピー（Settings）**で透明性を確保する。

---

## 完全パッチ（apply_patch 互換）

### 9.1 Info.plist 権限文言更新（Health/Motion/Mic/AlarmKit）
> 既存の `Info.plist` は一部が `INFOPLIST_KEY_*` プレースホルダ（Build Settings）経由。  
> フェーズ9では **pbxproj の差分を避ける**ため、新規キー（Health/Motion）は **Info.plist に直書きのデフォルト英語**を置き、`InfoPlist.strings` で `en/ja` を上書きする。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Info.plist
@@
 	<key>NSUserNotificationsUsageDescription</key>
 	<string>$(INFOPLIST_KEY_NSUserNotificationsUsageDescription)</string>
 	<key>NSMicrophoneUsageDescription</key>
 	<string>$(INFOPLIST_KEY_NSMicrophoneUsageDescription)</string>
 	<key>NSCameraUsageDescription</key>
 	<string>$(INFOPLIST_KEY_NSCameraUsageDescription)</string>
+	<key>NSHealthShareUsageDescription</key>
+	<string>Anicca reads sleep and step data from Health to generate insights and timely nudges.</string>
+	<key>NSHealthUpdateUsageDescription</key>
+	<string>Anicca can write limited data to Health only when you explicitly choose to share it.</string>
+	<key>NSMotionUsageDescription</key>
+	<string>Anicca uses motion data to detect inactivity and send gentle reminders.</string>
 	<key>NSAlarmKitUsageDescription</key>
 	<string>$(INFOPLIST_KEY_NSAlarmKitUsageDescription)</string>
@@
 </dict>
 </plist>
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/en.lproj/InfoPlist.strings
@@
 /* Microphone permission description */
-"NSMicrophoneUsageDescription" = "Anicca needs the microphone to talk with you in real time.";
+"NSMicrophoneUsageDescription" = "Anicca uses the microphone for real-time voice conversations.";
@@
 /* Notification permission description */
-"NSUserNotificationsUsageDescription" = "Anicca uses notifications to remind you about wake-up calls and routine start times.";
+"NSUserNotificationsUsageDescription" = "Anicca uses notifications to gently nudge you for waking up and routines. (This text may not appear in the system prompt.)";
@@
 /* AlarmKit permission description */
-"NSAlarmKitUsageDescription" = "Anicca uses full-screen alarms to remind you of your habits and help you take action.";
+"NSAlarmKitUsageDescription" = "Anicca schedules alarms to wake you up and remind you of routines.";
+
+/* Health permission descriptions */
+"NSHealthShareUsageDescription" = "Anicca reads sleep and step data from Health to generate insights and timely nudges.";
+"NSHealthUpdateUsageDescription" = "Anicca writes data to Health only when you explicitly choose to share it.";
+
+/* Motion permission description */
+"NSMotionUsageDescription" = "Anicca uses motion data to detect inactivity and send gentle reminders.";
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/ja.lproj/InfoPlist.strings
@@
 /* Microphone permission description */
-"NSMicrophoneUsageDescription" = "Aniccaはリアルタイムで会話するためにマイクが必要です。";
+"NSMicrophoneUsageDescription" = "Aniccaはリアルタイム音声対話のためにマイクを使用します。";
@@
 /* Notification permission description */
-"NSUserNotificationsUsageDescription" = "Aniccaは起床コールやルーティンの開始時刻をリマインドするために通知を使用します。";
+"NSUserNotificationsUsageDescription" = "Aniccaは起床やルーティンのタイミングで、やさしく促す通知を送ります。（この文言はOSの権限ダイアログに表示されない場合があります）";
@@
 /* AlarmKit permission description */
-"NSAlarmKitUsageDescription" = "Aniccaは、習慣のリマインダーをフルスクリーンアラームとして表示し、確実に行動を促すために使用します。";
+"NSAlarmKitUsageDescription" = "Aniccaは起床やルーティンのためにアラームをスケジュールします。";
+
+/* Health permission descriptions */
+"NSHealthShareUsageDescription" = "Aniccaは睡眠や歩数などのデータを読み取り、インサイトや適切な促しの生成に使用します。";
+"NSHealthUpdateUsageDescription" = "Aniccaは、あなたが明示的に共有を選んだ場合にのみ、Healthへ限定的な書き込みを行います。";
+
+/* Motion permission description */
+"NSMotionUsageDescription" = "Aniccaは動作データを用いて、長時間の静止を検知しやさしいリマインドを行います。";
*** End Patch
```

---

### 9.2 手動動作確認チェックリスト作成（新規）
```text
*** Begin Patch
*** Add File: docs/checklists/v0.3-manual-test.md
+# Anicca v0.3 手動テストチェックリスト（Phase 9）
+
+> 目的: v0.3 の主要フロー（Talk / 習慣通知 / セッション開始停止 / 課金/上限 / 権限フォールバック）を、人手で再現可能な形で検証する。
+
+## 前提
+- ビルド: Debug / Staging / Production のどれで実行したかを記録
+- 端末: iPhone 実機（OSバージョンを記録）
+- ネットワーク: オンライン（機内モードのテスト項目は別途）
+
+## 0. 初回起動（クリーン状態）
+- [ ] `-resetOnLaunch` 相当で UserDefaults を初期化できること（またはアプリ削除→再インストール）
+- [ ] オンボーディングが `.welcome` から開始すること
+
+## 1. 認証
+- [ ] Sign in with Apple → 成功してメイン画面に遷移する
+- [ ] サインアウト後にローカル状態が消える（設定画面の Sign Out）
+
+## 2. マイク権限（許可/拒否）
+- [ ] 初回: マイク許可を求める導線が「文脈のあるタイミング」で表示される（Onboarding または Talk 開始時）
+- [ ] 許可: Talk/Session が開始できる
+- [ ] 拒否: Session開始時に「Open Settings」導線が表示され、クラッシュしない
+- [ ] 設定アプリで許可→アプリ復帰後に Session が開始できる
+
+## 3. 通知権限（許可/拒否）
+- [ ] 通知許可: 習慣通知が予定時刻に届く
+- [ ] 通知拒否: アプリ内で「通知が無効でも Talk は使える」ことが明示され、クラッシュしない
+- [ ] 設定アプリで許可→アプリ復帰後に通知が届く
+
+## 4. 習慣スケジュール（Wake / Training / Bedtime）
+- [ ] 各習慣の時刻を保存すると、通知が再登録される
+- [ ] 既存スケジュールを変更すると、古い通知が残らない
+
+## 5. 通知タップ → セッション開始
+- [ ] 習慣通知をタップすると、`pendingHabitTrigger` が立ち Session が開始する
+- [ ] セッション終了（End）で `/session/stop` が呼ばれ、利用量が反映される
+
+## 6. Wake サイレント説明（Just-in-time / 1回だけ）
+- [ ] Wake 通知 → Session 開始のタイミングで、Wakeサイレント説明が **1回だけ**表示される
+- [ ] `OK, got it` 押下で以降は出ない
+- [ ] 端末/OS 条件（AlarmKit利用可否等）により、出る/出ないが仕様通りである
+
+## 7. 利用量上限 / Paywall
+- [ ] 無料枠の上限到達で `UsageLimitModal` が表示される
+- [ ] `Upgrade` → Paywall 表示、`Manage` → Settings 表示
+- [ ] 課金/復元後、`syncNow()` により上限状態が解除される
+
+## 8. Fallback UX（未許可でも継続可能）
+- [ ] 通知/各種データ連携が未許可でも、Talk を開始できる
+- [ ] Behavior（将来実装）でデータが不足する場合、説明コピーが表示される
+- [ ] 「Open Settings」導線があり、自己解決できる
+
+## 9. 回帰確認（最低限）
+- [ ] 設定画面が開ける（SessionView の gear）
+- [ ] アカウント削除フローが動作し、失敗時にエラーが表示される
+- [ ] アプリがクラッシュしない（権限拒否/オフライン/復元失敗の代表ケース）
+
*** End Patch
```

---

### 9.3 Fallback/未許可UX文言確認（Settings）
> v3-stack 14.5 に合わせ、**「センサー/通知が未許可でもTalkは使える」**を Settings に表示する。  
> ※現状コードベースには HealthKit / DeviceActivity / CoreMotion の実装が未導入のため、フェーズ9では **“概念としての説明コピー”** を追加し、実装はフェーズ7側で状態表示を拡張する。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
                 VStack(spacing: AppTheme.Spacing.md) {
                     subscriptionSection
                     personalizationSection
+                    dataIntegrationFallbackSection
                     alarmSettingsSection
                     problemsSection
                     idealTraitsSection
                     signOutSection
                     deleteAccountSection
                 }
@@
     // MARK: - Alarm Settings Section
@@
     }
+
+    // MARK: - Fallback UX (Permissions / Data)
+    @ViewBuilder
+    private var dataIntegrationFallbackSection: some View {
+        CardView {
+            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                Text(String(localized: "settings_data_optional_title"))
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+                    .padding(.bottom, AppTheme.Spacing.xs)
+
+                Text(String(localized: "settings_data_optional_description"))
+                    .font(AppTheme.Typography.caption1Dynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
+
+                Button(String(localized: "common_open_settings")) {
+                    if let url = URL(string: UIApplication.openSettingsURLString) {
+                        UIApplication.shared.open(url)
+                    }
+                }
+                .font(AppTheme.Typography.subheadlineDynamic)
+                .foregroundStyle(AppTheme.Colors.accent)
+                .buttonStyle(.plain)
+            }
+        }
+    }
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
 "settings_personalization" = "Personalization";
+"settings_data_optional_title" = "Data Integration (Optional)";
+"settings_data_optional_description" = "Sleep, Steps, Screen Time, and Motion are optional. Even if you keep them OFF, you can always use Talk. Behavior insights may be limited until you connect data.";
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
 "settings_personalization" = "パーソナライズ";
+"settings_data_optional_title" = "データ連携（任意）";
+"settings_data_optional_description" = "睡眠・歩数・スクリーンタイム・動作データの連携は任意です。未許可でもTalkはいつでも使えます。連携するとBehaviorのインサイト精度が向上します。";
*** End Patch
```

---

### 9.4 Wakeサイレント説明モーダル（Just-in-time / 1回だけ）
> `v3-ui.md` の「Wake Silent 説明モーダル」に合わせ、**“起床DPで初回に介入するタイミング”**（= `pendingHabitTrigger == .wake` のタイミング）で表示する。  
> 既存の `SessionView` は `habitSchedules[.wake] != nil` で常時表示しているため、**常時カード表示を廃止**し、**1回だけのモーダル**に置き換える。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/AppState.swift
@@
     private let subscriptionKey = "com.anicca.subscription"
     private let customHabitsKey = "com.anicca.customHabits"
     private let customHabitSchedulesKey = "com.anicca.customHabitSchedules"
+    private let hasSeenWakeSilentTipKey = "com.anicca.hasSeenWakeSilentTip"
+
+    @Published private(set) var hasSeenWakeSilentTip: Bool = false
@@
     private init() {
@@
+        self.hasSeenWakeSilentTip = defaults.bool(forKey: hasSeenWakeSilentTipKey)
@@
     }
+
+    func markHasSeenWakeSilentTip() {
+        hasSeenWakeSilentTip = true
+        defaults.set(true, forKey: hasSeenWakeSilentTipKey)
+    }
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
 struct SessionView: View {
     @EnvironmentObject private var appState: AppState
     @ObservedObject private var controller = VoiceSessionController.shared
     @State private var isShowingSettings = false
     @State private var isShowingLimitModal = false
     @State private var isShowingPaywall = false
     @State private var showMicAlert = false
+    @State private var showWakeSilentTip = false
@@
             VStack(spacing: AppTheme.Spacing.xl) {
                 Text("Anicca")
                     .font(AppTheme.Typography.appTitle)
                     .fontWeight(.heavy)
                     .foregroundStyle(AppTheme.Colors.label)
-
-                if shouldShowWakeSilentNotice {
-                    Text(String(localized: "session_wake_silent_notice"))
-                        .multilineTextAlignment(.center)
-                        .font(AppTheme.Typography.subheadlineDynamic)
-                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
-                        .padding(AppTheme.Spacing.lg)
-                        .frame(maxWidth: .infinity)
-                        .background(
-                            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
-                                .fill(AppTheme.Colors.cardBackground)
-                                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
-                        )
-                }
@@
             .onChange(of: appState.pendingHabitTrigger) { newValue in
                 guard newValue != nil else { return }
+                maybePresentWakeSilentTip(trigger: newValue)
                 ensureMicrophonePermissionAndStart(shouldResumeImmediately: appState.shouldStartSessionImmediately)
             }
@@
             .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
@@
             } message: {
                 Text(String(localized: "session_mic_permission_message"))
             }
+            .alert(String(localized: "wake_silent_modal_title"), isPresented: $showWakeSilentTip) {
+                Button(String(localized: "wake_silent_modal_ok")) {
+                    appState.markHasSeenWakeSilentTip()
+                }
+            } message: {
+                Text(String(localized: "wake_silent_modal_message"))
+            }
         }
     }
+
+    private func maybePresentWakeSilentTip(trigger: PendingHabitTrigger?) {
+        guard let trigger else { return }
+        guard trigger.habit == .wake else { return }
+        guard !appState.hasSeenWakeSilentTip else { return }
+
+        // v3-ui: AlarmKit 非対応等「確実に鳴らす保証がない」デバイスでのみ表示
+        let isEligible: Bool = {
+            #if canImport(AlarmKit)
+            if #available(iOS 26.0, *) {
+                // AlarmKitを使わない起床（通知/音に依存）なら説明対象
+                return !appState.userProfile.useAlarmKitForWake
+            }
+            #endif
+            return true
+        }()
+
+        guard isEligible else { return }
+        showWakeSilentTip = true
+    }
@@
-    private var shouldShowWakeSilentNotice: Bool {
-        appState.habitSchedules[HabitType.wake] != nil
-    }
 }
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
 "session_wake_silent_notice" = "To guarantee the wake alarm plays, flip the side silent switch back up before going to bed so that silent mode is off.";
+"wake_silent_modal_title" = "Wake alarms & Silent mode";
+"wake_silent_modal_message" = "Anicca can gently wake you at the right time, based on your routines.\n\nTo make sure you actually hear the alarm, please turn Silent mode off before going to sleep and keep your volume high enough to wake you.";
+"wake_silent_modal_ok" = "OK, got it";
*** End Patch
```

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
 "session_wake_silent_notice" = "起床アラームを確実に鳴らすために、寝る前に端末左側のサイレントスイッチを上げてマナーモードを解除してください。";
+"wake_silent_modal_title" = "起床アラームとサイレントモード";
+"wake_silent_modal_message" = "Aniccaはあなたの習慣に合わせて、ちょうど良いタイミングでやさしく起床を促します。\n\nアラームを確実に聞くために、寝る前にサイレントモードをOFFにし、起きられる音量に設定してください。";
+"wake_silent_modal_ok" = "OK、わかりました";
*** End Patch
```


