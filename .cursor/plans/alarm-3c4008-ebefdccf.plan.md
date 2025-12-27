<!-- ebefdccf-d6fd-42f6-aecc-dcab8504dc36 ed7e608e-14ed-4d0a-9729-571e6cd60391 -->
# 目的 / 出すもの（As-Is / 2B / Patch）

### As-Is（現状のコードの事実）

- **アラーム→会話開始の意図**: 通知タップ時は `AppDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)` が `AppState.shared.selectedRootTab = .talk` と `prepareForImmediateSession(...)` を呼び、習慣のプロンプトを仕込みます（`aniccaios/aniccaios/AppDelegate.swift`）。
- **AlarmKit（iOS 26+）の経路**: AlarmKitの「起動して会話開始」相当は `StartConversationIntent` が AppGroup に `pending_habit_launch_*` を書き込み、アプリ本体が起動時/active復帰時に回収します（`aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`, `aniccaios/aniccaios/Intents/StartConversationIntent.swift`, `aniccaios/aniccaios/AppState.swift`, `aniccaios/aniccaios/AppDelegate.swift`）。
- **“セッション画面を出す”責務がTalkタブに寄っている**: いま「習慣セッションを fullScreenCover で出す」のは `TalkView` のみで、`pendingHabitTrigger`+`shouldStartSessionImmediately` を検知した時に `HabitSessionView` を出します（`aniccaios/aniccaios/Views/Talk/TalkView.swift`）。
  - つまり、**TalkViewが画面ツリー上にいない/まだ表示されていない瞬間**があると、ユーザー体感として「アプリは開いたがセッション画面が出ない（結果、直前に開いていた“習慣/週間”が見える）」が起きえます。
- **Behaviorタブが遅い原因候補（コード上）**: `BehaviorView.load()` が Screen Time 有効時に最大5秒 `Task.sleep` で待ちます（`screenTime_lastUpdate` をAppGroupでポーリング、`0.2s * 25`）（`aniccaios/aniccaios/Views/Behavior/BehaviorView.swift`）。これが「毎回ローディングが長い」の主因になりえます。
- **Appleサインイン後が遅い原因候補（コード上）**: `AuthCoordinator` がサインイン成功後に `bootstrapProfileFromServerIfAvailable()` を実行し、その間 `AppState.isBootstrappingProfile=true` となり、`ContentRouterView` が全画面 `ProgressView` に切り替わります（`aniccaios/aniccaios/Authentication/AuthCoordinator.swift`, `aniccaios/aniccaios/ContentView.swift`, `aniccaios/aniccaios/AppState.swift`）。オンボーディング中でも容赦なく覆うので、体感2–3秒の「謎ローディング」になりえます。

### 2B（To-Be / 目標状態）

- **2B-1（アラーム→セッション）**: 通知/AlarmKit/LiveActivity 経由で起床アクションが来たら、現在のタブに関係なく**必ず即座にセッション画面（HabitSessionView）をフルスクリーン表示**し、`VoiceSessionController.start(...)` が走って **aniicha が先に話し始める**。
- **2B-2（体感速度）**:
  - Behaviorタブは**最初の描画をブロックしない**（5秒待ちを撤廃/短縮し、必要な更新はバックグラウンドで追従）。
  - Appleサインイン完了→理想入力（ideals）への遷移は**UIをネットワーク待ちで覆わない**（オンボーディング中は即遷移）。

---

# 実装方針（重複実装を避ける）

### 1) アラーム→セッション画面が出ない問題を“根本から潰す”

- **方針**: `TalkView` にだけある「習慣セッション fullScreenCover」を、より上位（`MainTabView` か `ContentRouterView`）に引き上げ、**どのタブ表示中でも** `pendingHabitTrigger` を検知したら `HabitSessionView` を提示する。
- **理由**: 既存の `AppDelegate`/`AppState` は「トリガー状態を作る」まではできているので、表示責務を上位に移すのが最小差分かつ堅牢。
- **変更対象候補**:
  - `aniccaios/aniccaios/MainTabView.swift`: アプリ本体のタブ表示を包んでいるので、ここに “Global Habit Session Presenter” を置く。
  - `aniccaios/aniccaios/Views/Talk/TalkView.swift`: 二重提示を避けるため、習慣セッション用の `.fullScreenCover` と検知ロジックを削除 or 無効化。

### 2) Behaviorタブのローディングを短縮

- **方針**: `BehaviorView.load()` を「待ってから取りに行く」から「取りに行って描画しつつ、必要な更新だけ短時間で追う」へ。
- **具体策**:
  - Screen Time 有効時のポーリング（最大5秒）を**上限0.6秒程度**に縮める、または `screenTime_lastUpdate` が十分新しい場合は待たない。
  - さらに、`MetricsUploader.runUploadIfDue(force:false)` を UI ブロックしない形（並行 or 後段）にする。

### 3) Appleサインイン後の“2–3秒Progress”を撤廃

- **方針**: オンボーディング中は `isBootstrappingProfile` をルーティングの最上段条件にしない。
- **具体策**:
  - `ContentRouterView` の先頭条件を `if appState.isBootstrappingProfile && appState.isOnboardingComplete { ... }` のように絞る。
  - これでオンボーディング中（`OnboardingFlowView` 表示中）は `bootstrapProfileFromServerIfAvailable()` が走っても画面遷移を邪魔しない。

---

# Patch（提案パッチ / チャット提示用）

### Patch-1: 習慣セッションの提示を `MainTabView` に移して「どのタブでも必ず出る」

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/MainTabView.swift
@@
 struct MainTabView: View {
     @EnvironmentObject private var appState: AppState
+    @State private var habitSessionActive = false
+    @State private var pendingHabit: HabitType?
@@
     var body: some View {
         // コンテンツエリア
         Group {
             switch appState.selectedRootTab {
@@
         }
         .frame(maxWidth: .infinity, maxHeight: .infinity)
+        .fullScreenCover(isPresented: $habitSessionActive) {
+            if let habit = pendingHabit {
+                HabitSessionView(habit: habit)
+                    .environmentObject(appState)
+            }
+        }
+        .onAppear { checkPendingHabitTrigger() }
+        .onChange(of: appState.pendingHabitTrigger) { _ in checkPendingHabitTrigger() }
         .safeAreaInset(edge: .bottom) {
@@
         }
         .background(AppBackground())
         .ignoresSafeArea(.keyboard, edges: .bottom)
     }
+
+    private func checkPendingHabitTrigger() {
+        guard let trigger = appState.pendingHabitTrigger,
+              appState.shouldStartSessionImmediately else { return }
+        pendingHabit = trigger.habit
+        habitSessionActive = true
+        appState.clearShouldStartSessionImmediately()
+    }
 }
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Views/Talk/TalkView.swift
@@
 struct TalkView: View {
@@
-    // ★ アラームからのセッション起動用
-    @State private var habitSessionActive = false
-    @State private var pendingHabit: HabitType?
@@
             .fullScreenCover(item: $selectedTopic) { topic in
                 SessionView(topic: topic)
                     .environmentObject(appState)
             }
-            // ★ 習慣セッション用のfullScreenCover
-            .fullScreenCover(isPresented: $habitSessionActive) {
-                if let habit = pendingHabit {
-                    HabitSessionView(habit: habit)
-                        .environmentObject(appState)
-                }
-            }
-            .onAppear {
-                checkPendingHabitTrigger()
-            }
-            .onChange(of: appState.pendingHabitTrigger) { _ in
-                checkPendingHabitTrigger()
-            }
-            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
-                // アプリがアクティブになったときもチェック（通知からアプリに遷移した場合など）
-                checkPendingHabitTrigger()
-            }
         }
     }
-    
-    private func checkPendingHabitTrigger() {
-        guard let trigger = appState.pendingHabitTrigger,
-              appState.shouldStartSessionImmediately else { return }
-        pendingHabit = trigger.habit
-        habitSessionActive = true
-        appState.clearShouldStartSessionImmediately()
-    }
+
*** End Patch
```

### Patch-2: Behaviorタブの5秒待ちを短縮（ブロック時間を削る）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Views/Behavior/BehaviorView.swift
@@
     private func load() async {
         guard !isLoading else { return }
         isLoading = true
@@
-        if appState.sensorAccess.screenTimeEnabled {
+        if appState.sensorAccess.screenTimeEnabled {
             showScreenTimeReport = true
             logger.info("BehaviorView: Waiting for DeviceActivityReport...")
-            // 固定sleepではなく、extensionがAppGroupへ書き込む lastUpdate を短時間待つ
+            // extensionがAppGroupへ書き込む lastUpdate を“短時間だけ”待つ（最大5秒→短縮）
             let startTs = appGroupDefaults?.double(forKey: "screenTime_lastUpdate") ?? 0
-            for _ in 0..<25 { // 最大5秒（0.2s * 25）
+            for _ in 0..<3 { // 最大0.6秒（0.2s * 3）
                 try? await Task.sleep(nanoseconds: 200_000_000)
                 let nowTs = appGroupDefaults?.double(forKey: "screenTime_lastUpdate") ?? 0
                 if nowTs > startTs { break }
             }
             showScreenTimeReport = false
         }
*** End Patch
```

### Patch-3: Appleサインイン後の“オンボーディング中ProgressView”を抑止

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/ContentView.swift
@@
 struct ContentRouterView: View {
@@
     var body: some View {
-        // プロファイル取得中は何も表示しない（フラッシュ防止）
-        if appState.isBootstrappingProfile {
+        // プロファイル取得中のProgressは、オンボーディング完了後のみ（オンボーディング中の遷移を邪魔しない）
+        if appState.isBootstrappingProfile && appState.isOnboardingComplete {
             ProgressView()
                 .frame(maxWidth: .infinity, maxHeight: .infinity)
                 .background(AppBackground())
         } else if !appState.isOnboardingComplete {
             OnboardingFlowView()
         } else {
*** End Patch
```

---

# 検証観点（最小）

- **アラーム→セッション**: (A) 通知の「今すぐ対話」 (B) AlarmKitのSecondaryボタン（LiveActivity/アラームUI） どちらでも、アプリがどのタブを開いていても `HabitSessionView` が即フルスクリーン表示され、`session.update`→`response.create` で aniicha が話し始める。
- **Behaviorタブ**: Screen Time ON でもローディングが体感で短くなる（最大0.6秒+ネットワークのみ）。
- **サインイン後**: Sign in with Apple 完了→`IdealsStepView` へ即遷移（オンボーディング中に全画面Progressに奪われない）。

---

# 実装Todo

- alarm-routing: `MainTabView` に習慣セッション提示を移し、`TalkView` から重複ロジックを削除
- behavior-perf: `BehaviorView.load()` の ScreenTime wait を短縮し、必要なら“再訪時にブロックしない”改善
- signin-perf: `ContentRouterView` の `isBootstrappingProfile` ガードをオンボーディング完了後のみに限定

### To-dos

- [ ] `MainTabView`に習慣セッションのfullScreenCoverを移し、`TalkView`内の重複提示ロジックを削除して、どのタブからでもアラーム起動で必ずセッション画面を出す。
- [ ] `BehaviorView.load()`のScreen Time待ち(最大5秒ポーリング)を短縮/非ブロッキング化して、行動タブの体感ローディングを短くする。
- [ ] オンボーディング中に`isBootstrappingProfile`が全画面ProgressViewで画面遷移を塞がないよう、`ContentRouterView`の条件を絞る（サインイン直後の2-3秒待ちを解消）。