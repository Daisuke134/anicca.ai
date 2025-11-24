# Anicca iOS – Habits/Settings fixes and follow-up

## 実装済み（2025-11-24）

### 1) iOS: 通知タップで必ず"トーク"タブへ遷移
**目的**: 通知（習慣アラーム）からアプリに遷移した際、最後に見ていたタブに関係なく、常に"トーク"タブを表示させる。

**実装内容**:
- `AppState`に`RootTab` enumと`selectedRootTab`を追加し、タブ選択状態を集中管理
- `MainTabView`の`TabView(selection:)`を`AppState.selectedRootTab`にバインド
- 通知タップ時（`AppDelegate`）と即時セッション準備時（`prepareForImmediateSession`）に`selectedRootTab = .talk`を設定
- `StartConversationIntent`でも同様に"トーク"タブを強制選択

**音（アラーム/通知サウンド）への影響**: なし。`NotificationScheduler`のカテゴリ/サウンド/フォローアップ登録ロジックは無変更。`AudioSessionCoordinator`も従来通り。通知鳴動・繰り返し挙動は変化しません。

### 2) Delete Account が 401（サーバー無ログ）の解消
**原因**: `apps/api/src/routes/mobile/account.js`はBearer必須（`requireAuth`）だったが、iOSの`SettingsView.deleteAccount()`は`device-id` + `user-id`ヘッダーのみを送信。プロジェクト規約（モバイルAPIはヘッダー方式）とズレて401が発生。

**実装内容**: Bearer優先＋`device-id`/`user-id`フォールバック対応
- Bearerがあれば従来通り検証（優先）
- Bearerがなければ`device-id` + `user-id`を許容（他モバイルAPIと同一方式）

---

## Scope（未実装・計画中）

- Correct localization usage/strings (placeholders, titles, labels). Replace "Set %@ Time" with "Set Time". Rename displayed "Bedtime" to "Sleep".
- Sort habits by time in onboarding; keep Habits tab sorted (already implemented) and ensure consistent ordering.
- Fix Add Habit placeholder and duplicate-creation bug; remove delete confirmation.
- Tap habit row in Habits tab opens unified editor (time + follow-ups). Reuse existing onboarding step UIs.
- Settings: restore Subscription section (above `settings_personalization`), add Sign Out, fix language/name label keys.
- Confirm trait grounding: `Resources/Prompts/common.txt` already consumes `${IDEAL_TRAITS}` via `HabitPromptBuilder` → no code change.

## Key edits (pseudo-diffs)

### iOS strings

```diff
--- aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
+++ aniccaios/aniccaios/Resources/en.lproj/Localizable.strings
@@
-"onboarding_habit_time_title_format" = "Set %@ Time";
+/* Not used anymore; keep for backward compat if referenced */
+"onboarding_habit_time_title_format" = "Set Time";
@@
-"habit_custom_name_placeholder" = "";
+"habit_custom_name_placeholder" = "Add your habit";
@@
-"habit_title_bedtime" = "Bedtime";
+"habit_title_bedtime" = "Sleep";
@@
-"next_schedule_habit_bedtime" = "bedtime";
+"next_schedule_habit_bedtime" = "sleep";
```
```diff
--- aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+++ aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@
-"onboarding_habit_time_title_format" = "%@の時刻を設定";
+/* 表示は統一で“時刻を設定” */
+"onboarding_habit_time_title_format" = "時刻を設定";
@@
-"habit_custom_name_placeholder" = "";
+"habit_custom_name_placeholder" = "習慣名を入力";
```

### Onboarding – placeholder/localization + sort + sheet title

```diff
--- aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
+++ aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
-                    // デフォルト習慣（wake, training, bedtime）
-                    ForEach([HabitType.wake, .training, .bedtime], id: \.
-self) { habit in
+                    // デフォルト習慣（時刻の早い順）
+                    ForEach(sortedDefaultHabits, id: \.self) { habit in
                         habitCard(for: habit, isCustom: false)
                     }
@@
-                        TextField("habit_custom_name_placeholder", text: $newCustomHabitName)
+                        TextField(String(localized: "habit_custom_name_placeholder"), text: $newCustomHabitName)
@@
-                Text(String(localized: "onboarding_habit_time_title_format"))
+                Text(String(localized: "common_set_time"))
@@
-                Text(String(format: NSLocalizedString("onboarding_habit_time_title_format", comment: ""), habit.title))
+                Text(String(localized: "common_set_time"))
@@
 struct HabitSetupStepView: View {
@@
     @State private var newCustomHabitName = ""
+
+    // 追加: デフォルト習慣を時刻昇順にソート
+    private var sortedDefaultHabits: [HabitType] {
+        let base: [HabitType] = [.wake, .training, .bedtime]
+        return base.sorted { a, b in
+            let ca = habitTimes[a] ?? Calendar.current.date(from: a.defaultTime) ?? Date.distantFuture
+            let cb = habitTimes[b] ?? Calendar.current.date(from: b.defaultTime) ?? Date.distantFuture
+            return ca < cb
+        }
+    }
```

### Habits tab – title text, no delete confirm, unified editor entry-point (skeleton)

```diff
--- aniccaios/aniccaios/Habits/HabitsSectionView.swift
+++ aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
-    @State private var habitToDelete: UUID?
-    @State private var showingDeleteAlert = false
+    // 削除確認を廃止（即時削除）
@@
-                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
-                            Button(role: .destructive) {
-                                habitToDelete = item.id
-                                showingDeleteAlert = true
-                            } label: {
-                                Label(String(localized: "common_delete"), systemImage: "trash")
-                            }
-                        }
+                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
+                            Button(role: .destructive) {
+                                appState.removeCustomHabit(id: item.id)
+                            } label: { Label(String(localized: "common_delete"), systemImage: "trash") }
+                        }
@@
-                Text(String(format: NSLocalizedString("onboarding_habit_time_title_format", comment: ""), habit.title))
+                Text(String(localized: "common_set_time"))
@@
-                Text(String(localized: "onboarding_habit_time_title_format"))
+                Text(String(localized: "common_set_time"))
@@
-        .alert(String(localized: "habit_delete_confirm"), isPresented: $showingDeleteAlert) { ... }
+        // 削除確認UIは廃止
+
+        // タップで統合エディタ（時刻＋フォローアップ）を開く
+        .sheet(item: $editorRoute) { route in
+            switch route { case .editor(let habit): HabitEditSheet(habit: habit) }
+        }
```

New inline view (skeleton; reuses onboarding views inside):

```diff
+--- aniccaios/aniccaios/Habits/HabitsSectionView.swift (append)
+@@
+private enum EditorRoute: Identifiable { case editor(HabitType); var id: String { "editor:\(String(describing: self))" } }
+
+struct HabitEditSheet: View {
+  @EnvironmentObject private var appState: AppState
+  let habit: HabitType
+  @State private var time = Date()
+  @Environment(\.dismiss) private var dismiss
+
+  var body: some View {
+    NavigationView {
+      Form {
+        // Time
+        DatePicker(String(localized: "common_time"), selection: $time, displayedComponents: [.hourAndMinute])
+
+        // Follow-ups
+        switch habit {
+        case .wake:
+          TextField(String(localized: "habit_wake_location"), text: Binding(
+            get: { appState.userProfile.wakeLocation },
+            set: { appState.updateWakeLocation($0) }
+          ))
+        case .bedtime:
+          TextField(String(localized: "habit_sleep_location"), text: Binding(
+            get: { appState.userProfile.sleepLocation },
+            set: { appState.updateSleepLocation($0) }
+          ))
+        case .training:
+          HabitTrainingFocusStepView(next: { }) // embed; saves via AppState
+        case .custom: EmptyView()
+        }
+      }
+      .navigationTitle(habit.title)
+      .toolbar {
+        ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common_cancel")) { dismiss() } }
+        ToolbarItem(placement: .confirmationAction) {
+          Button(String(localized: "common_save")) {
+            Task { await appState.updateHabit(habit, time: time) }
+            dismiss()
+          }
+        }
+      }
+    }
+  }
+}
```

### Prevent duplicate custom habits

```diff
--- aniccaios/aniccaios/AppState.swift
+++ aniccaios/aniccaios/AppState.swift
@@
-    func addCustomHabit(_ configuration: CustomHabitConfiguration) {
-        customHabits.append(configuration)
-        CustomHabitStore.shared.add(configuration)
-    }
+    func addCustomHabit(_ configuration: CustomHabitConfiguration) {
+        let name = configuration.name.trimmingCharacters(in: .whitespacesAndNewlines)
+        guard !name.isEmpty else { return }
+        let exists = customHabits.contains { $0.name.compare(name, options: .caseInsensitive) == .orderedSame }
+        guard !exists else { return }
+        customHabits.append(configuration)
+        CustomHabitStore.shared.add(configuration)
+    }
```
```diff
--- aniccaios/aniccaios/Models/CustomHabitConfiguration.swift
+++ aniccaios/aniccaios/Models/CustomHabitConfiguration.swift
@@
-    func add(_ configuration: CustomHabitConfiguration) {
-        var habits = loadAll()
-        habits.append(configuration)
-        saveAll(habits)
-    }
+    func add(_ configuration: CustomHabitConfiguration) {
+        var habits = loadAll()
+        let name = configuration.name.trimmingCharacters(in: .whitespacesAndNewlines)
+        if habits.contains(where: { $0.name.compare(name, options: .caseInsensitive) == .orderedSame }) { return }
+        habits.append(configuration)
+        saveAll(habits)
+    }
```

### Settings – restore Subscription, fix labels, add Sign Out

```diff
--- aniccaios/aniccaios/SettingsView.swift
+++ aniccaios/aniccaios/SettingsView.swift
@@
-            List {
-                // Personalization section (簡略化)
+            List {
+                // Subscription (復活)
+                Section(String(localized: "settings_subscription_title")) {
+                    Button(String(localized: "settings_subscription_manage")) { showingManageSubscription = true }
+                }
+
+                // Personalization
                 Section(String(localized: "settings_personalization")) {
-                    TextField(String(localized: "settings_name"), text: $displayName)
-                    Picker(String(localized: "settings_language"), selection: $preferredLanguage) {
+                    TextField(String(localized: "settings_name_label"), text: $displayName)
+                    Picker(String(localized: "settings_language_label"), selection: $preferredLanguage) {
                         Text(String(localized: "language_preference_ja")).tag(LanguagePreference.ja)
                         Text(String(localized: "language_preference_en")).tag(LanguagePreference.en)
                     }
                 }
@@
-                // Guideline 5.1.1(v)対応: アカウント削除
+                // Sign out
+                Section { Button(String(localized: "common_sign_out")) { appState.clearUserCredentials(); dismiss() } }
+
+                // Delete account
                 Section {
                     Button(role: .destructive) {
                         isShowingDeleteAlert = true
                     } label: {
                         Text("Delete Account")
                     }
                 }
             }
@@
-        }
+        }
+        .sheet(isPresented: $showingManageSubscription) { ManageSubscriptionSheet().environmentObject(appState) }
@@
     @State private var deleteAccountError: Error?
+    @State private var showingManageSubscription = false
```

## 実装済みの擬似パッチ

### iOS: 通知タップで必ず"トーク"タブへ

```diff
--- aniccaios/aniccaios/AppState.swift
+++ aniccaios/aniccaios/AppState.swift
@@
-    private(set) var shouldStartSessionImmediately = false
+    private(set) var shouldStartSessionImmediately = false
+    
+    enum RootTab: Int, Hashable {
+        case talk = 0
+        case habits = 1
+    }
+    @Published var selectedRootTab: RootTab = .talk
@@
     func prepareForImmediateSession(habit: HabitType) {
         let prompt = promptBuilder.buildPrompt(for: habit, scheduledTime: habitSchedules[habit], now: Date(), profile: userProfile)
         pendingHabitPrompt = (habit: habit, prompt: prompt)
         pendingHabitTrigger = PendingHabitTrigger(id: UUID(), habit: habit)
         shouldStartSessionImmediately = true
+        selectedRootTab = .talk
     }
```

```diff
--- aniccaios/aniccaios/MainTabView.swift
+++ aniccaios/aniccaios/MainTabView.swift
@@
-struct MainTabView: View {
-    @State private var selectedTab = 0
+struct MainTabView: View {
+    @EnvironmentObject private var appState: AppState
@@
-    TabView(selection: $selectedTab) {
+    TabView(selection: $appState.selectedRootTab) {
         TalkTabView()
             .tabItem {
                 Label(String(localized: "tab_talk"), systemImage: "message")
             }
-            .tag(0)
+            .tag(AppState.RootTab.talk)
         
         HabitsTabView()
             .tabItem {
                 Label(String(localized: "tab_habits"), systemImage: "list.bullet")
             }
-            .tag(1)
+            .tag(AppState.RootTab.habits)
     }
 }
```

```diff
--- aniccaios/aniccaios/AppDelegate.swift
+++ aniccaios/aniccaios/AppDelegate.swift
@@
                 await MainActor.run {
+                    AppState.shared.selectedRootTab = .talk
                     AppState.shared.prepareForImmediateSession(habit: habit)
                     habitLaunchLogger.info("AppState prepared immediate session for habit \(habit.rawValue, privacy: .public)")
                 }
```

```diff
--- aniccaios/aniccaios/Intents/StartConversationIntent.swift
+++ aniccaios/aniccaios/Intents/StartConversationIntent.swift
@@
         // Configure audio session
         try? AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
         
         // Prepare for immediate session
+        AppState.shared.selectedRootTab = .talk
         AppState.shared.prepareForImmediateSession(habit: habitType)
         
         return .result()
```

### Server: Delete Account 401解消（Bearer優先＋device-id/user-idフォールバック）

```diff
--- apps/api/src/routes/mobile/account.js
+++ apps/api/src/routes/mobile/account.js
@@
-router.delete('/', async (req, res, next) => {
+router.delete('/', async (req, res, next) => {
   try {
-    const auth = await requireAuth(req, res);
-    if (!auth) return;
-    const userId = auth.sub;
+    const authHeader = String(req.headers['authorization'] || '');
+    let userId = null;
+    
+    if (authHeader.startsWith('Bearer ')) {
+      // Bearer優先（将来のベストプラクティス移行を阻害しない）
+      const auth = await requireAuth(req, res);
+      if (!auth) return;
+      userId = auth.sub;
+    } else {
+      // モバイル規約ヘッダー（device-id + user-id）を許容（即効の401解消）
+      const deviceId = (req.get('device-id') || '').toString().trim();
+      userId = (req.get('user-id') || '').toString().trim();
+      if (!deviceId) {
+        return res.status(400).json({ error: 'device-id is required' });
+      }
+      if (!userId) {
+        return res.status(401).json({ error: 'user-id is required' });
+      }
+    }
@@
     return res.status(204).send();
   } catch (error) {
     console.error('[Account Deletion] Error:', error);
     next(error);
   }
 });
```

### Backend – accept device-id + user-id for deletion（旧版・簡略化版）

```diff
--- apps/api/src/routes/mobile/account.js
+++ apps/api/src/routes/mobile/account.js
@@
-import requireAuth from '../../middleware/requireAuth.js';
-import { deleteSubscriber } from '../../services/revenuecat/api.js';
+import { deleteSubscriber } from '../../services/revenuecat/api.js';
 import { pool } from '../../lib/db.js';
@@
-router.delete('/', async (req, res, next) => {
+router.delete('/', async (req, res, next) => {
   try {
-    const auth = await requireAuth(req, res);
-    if (!auth) return;
-    const userId = auth.sub;
+    const deviceId = (req.get('device-id') || '').toString().trim();
+    const userId = (req.get('user-id') || '').toString().trim();
+    if (!deviceId) return res.status(400).json({ error: 'device-id is required' });
+    if (!userId) return res.status(401).json({ error: 'user-id is required' });
@@
     return res.status(204).send();
   } catch (error) {
     console.error('[Account Deletion] Error:', error);
     next(error);
   }
 });
```

## 動作確認ポイント（実装済み）

- ✅ 通知タップ時に常に"トーク"タブが表示される（Habitsに居ても上書き）
- ✅ セッション開始/終了UIに即座にアクセス可能
- ✅ `DELETE /api/mobile/account` → 204（iOS側の401エラー表示は解消）
- ✅ サーバー: RevenueCat削除失敗はログ記録のみで処理継続、DBは正しく削除される
- ✅ 音: これまで通り鳴動（サウンド/フォローアップ挙動の変化なし）

## Notes

- Ideal traits grounding is already wired: `HabitPromptBuilder.render()` injects `${IDEAL_TRAITS}` from `userProfile` into `Resources/Prompts/common.txt`.
- We only change displayed labels; `HabitType.bedtime` and prompt filenames remain unchanged.
- 通知タップ→トーク固定: `TabView(selection:)`はバインドと`.tag(...)`の型一致が必須 → Enum化で破壊的変更を防止。
- Delete Account 401解消: ヘッダー方式は偽装リスクが相対的に高い（現行規約準拠のため短期許容）。将来は削除のみBearerへ統一推奨。