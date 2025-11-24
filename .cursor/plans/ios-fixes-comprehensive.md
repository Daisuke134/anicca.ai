# Anicca iOS – Habits/Settings fixes and follow-up
## Scope

- Correct localization usage/strings (placeholders, titles, labels). Replace “Set %@ Time” with “Set Time”. Rename displayed “Bedtime” to “Sleep”.
- Sort habits by time in onboarding; keep Habits tab sorted (already implemented) and ensure consistent ordering.
- Fix Add Habit placeholder and duplicate-creation bug; remove delete confirmation.
- Tap habit row in Habits tab opens unified editor (time + follow-ups). Reuse existing onboarding step UIs.
- Settings: restore Subscription section (above `settings_personalization`), add Sign Out, fix language/name label keys.
- Backend: make DELETE /api/mobile/account accept `device-id` + `user-id` like other mobile endpoints to stop 401.
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

### Backend – accept device-id + user-id for deletion

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

## Notes

- Ideal traits grounding is already wired: `HabitPromptBuilder.render()` injects `${IDEAL_TRAITS}` from `userProfile` into `Resources/Prompts/common.txt`.
- We only change displayed labels; `HabitType.bedtime` and prompt filenames remain unchanged.