承知しました。各問題の擬似パッチを順番に示します。[[memory:11283936]]

---

## ① Stickyモードの回数を10回に変更 + ログ強化

**ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`

```diff
--- a/aniccaios/aniccaios/VoiceSessionController.swift
+++ b/aniccaios/aniccaios/VoiceSessionController.swift
@@ -26,7 +26,7 @@ final class VoiceSessionController: NSObject, ObservableObject {
     // Sticky mode (applies to all habits when enabled)
     private var stickyActive = false
     private var stickyUserReplyCount = 0
-    private let stickyReleaseThreshold = 5
+    private let stickyReleaseThreshold = 10
     
     private var isStickyEnabled: Bool {
         AppState.shared.userProfile.stickyModeEnabled
@@ -548,10 +548,10 @@ private extension VoiceSessionController {
                 role == "user"
             {
                 self.stickyUserReplyCount += 1
-                logger.info("Sticky reply count: \(self.stickyUserReplyCount, privacy: .public)")
+                logger.info("Sticky reply \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold) from user")
                 if self.stickyUserReplyCount >= stickyReleaseThreshold {
                     stickyActive = false
-                    logger.info("Sticky released after \(self.stickyUserReplyCount, privacy: .public) replies")
+                    logger.info("Sticky mode released after \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold) replies - session now free")
                 }
             }
         case "response.completed":
```

---

## ② iOS 26未満でAlarmKitトグル非表示

**結果**: **既に正しく実装済み** ✅

`HabitsSectionView.swift` の510-520行目で以下のように制御されています：

```swift
// AlarmKit設定（iOS 26+ のみ）
#if canImport(AlarmKit)
if #available(iOS 26.0, *) {
    Section(String(localized: "settings_alarmkit_section_title")) {
        alarmKitToggle
        // ...
    }
}
#endif
```

iOS 26未満では表示されません。**修正不要**です。

---

## ③ カスタム習慣のAlarmKitデフォルトをOFFに変更

**ファイル**: `aniccaios/aniccaios/Models/UserProfile.swift`

```diff
--- a/aniccaios/aniccaios/Models/UserProfile.swift
+++ b/aniccaios/aniccaios/Models/UserProfile.swift
@@ -59,7 +59,7 @@ struct UserProfile: Codable {
         useAlarmKitForWake: Bool = true,
         useAlarmKitForTraining: Bool = true,
         useAlarmKitForBedtime: Bool = true,
-        useAlarmKitForCustom: Bool = true,
+        useAlarmKitForCustom: Bool = false,
         stickyModeEnabled: Bool = true
     ) {
         // ...
@@ -105,7 +105,7 @@ struct UserProfile: Codable {
         useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? true
         useAlarmKitForTraining = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForTraining) ?? true
         useAlarmKitForBedtime = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForBedtime) ?? true
-        useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? true
+        useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? false
```

---

## ④ ${PROBLEMS}プレースホルダーの紐付け確認

**結果**: **既に正しく実装済み** ✅

`WakePromptBuilder.swift` の145-150行目で正しく処理されています：

```swift
if !profile.problems.isEmpty {
    let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
    replacements["PROBLEMS"] = "今抱えている問題: " + localizedProblems.joined(separator: "、")
} else {
    replacements["PROBLEMS"] = ""
}
```

設定画面で選択された問題は `UserProfile.problems` に保存され、プロンプト生成時に正しく置換されます。**修正不要**です。

---

## ⑤ サインイン後の「習慣を設定」画面フラッシュ問題

**ファイル**: `aniccaios/aniccaios/AppState.swift`

**原因**: `bootstrapProfileFromServerIfAvailable()` が非同期で実行されるため、`authStatus` が先に `.signedIn` になり、ContentViewがオンボーディング画面を一瞬表示してしまう。

```diff
--- a/aniccaios/aniccaios/AppState.swift
+++ b/aniccaios/aniccaios/AppState.swift
@@ -10,6 +10,9 @@ final class AppState: ObservableObject {
 
     @Published private(set) var authStatus: AuthStatus = .signedOut
     @Published private(set) var userProfile: UserProfile = UserProfile()
+    
+    // サーバーからのプロファイル取得中フラグ（UIフラッシュ防止用）
+    @Published private(set) var isBootstrappingProfile: Bool = false
     @Published private(set) var subscriptionInfo: SubscriptionInfo = .free
     // ... 省略 ...
 
@@ -515,6 +518,7 @@ final class AppState: ObservableObject {
     
     func bootstrapProfileFromServerIfAvailable() async {
         guard case .signedIn(let credentials) = authStatus else { return }
+        isBootstrappingProfile = true
         
         var request = URLRequest(url: AppConfig.profileSyncURL)
         request.httpMethod = "GET"
@@ -533,6 +537,8 @@ final class AppState: ObservableObject {
         } catch {
             // ネットワークがない場合などは無視してローカル状態を継続
         }
+        
+        isBootstrappingProfile = false
     }
```

**ファイル**: `aniccaios/aniccaios/ContentView.swift` (または該当のルートビュー)

```diff
--- a/aniccaios/aniccaios/ContentView.swift
+++ b/aniccaios/aniccaios/ContentView.swift
@@ -XX,XX @@ struct ContentView: View {
     var body: some View {
-        if appState.isOnboardingComplete {
+        // プロファイル取得中は何も表示しない（フラッシュ防止）
+        if appState.isBootstrappingProfile {
+            // ローディング表示またはスプラッシュ
+            ProgressView()
+                .frame(maxWidth: .infinity, maxHeight: .infinity)
+                .background(AppBackground())
+        } else if appState.isOnboardingComplete {
             MainTabView()
         } else {
             OnboardingFlowView()
```

---

## ⑥⑦ 習慣トグルOFF時の状態が保存されない問題

**ファイル**: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

**原因**: トグルOFF時に `activeHabits.remove(habit)` のみ呼んでおり、`AppState.habitSchedules` から削除していない。

```diff
--- a/aniccaios/aniccaios/Habits/HabitsSectionView.swift
+++ b/aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@ -301,17 +301,19 @@ struct HabitsSectionView: View {
             Toggle("", isOn: Binding(
                 get: { isActive },
                 set: { isOn in
                     if isOn {
                         if let date = date {
                             activeHabits.insert(habit)
                             habitTimes[habit] = date
+                            // 時刻が既にある場合はAppStateにも反映
+                            Task {
+                                await appState.updateHabit(habit, time: date)
+                            }
                         } else {
                             sheetTime = Calendar.current.date(from: habit.defaultTime) ?? Date()
                             activeSheet = .habit(habit)
                         }
                     } else {
+                        // トグルOFF時はAppStateからも削除して永続化
                         activeHabits.remove(habit)
                         habitTimes.removeValue(forKey: habit)
+                        appState.removeHabitSchedule(habit)
                     }
                 }
             ))
@@ -352,12 +354,15 @@ struct HabitsSectionView: View {
                     if isOn {
                         if let date = date {
                             activeCustomHabits.insert(id)
                             customHabitTimes[id] = date
+                            // AppStateにも反映
+                            appState.updateCustomHabitSchedule(id: id, time: Calendar.current.dateComponents([.hour, .minute], from: date))
                         } else {
                             sheetTime = Date()
                             activeSheet = .custom(id)
                         }
                     } else {
+                        // トグルOFF時はAppStateからも削除
                         activeCustomHabits.remove(id)
+                        customHabitTimes.removeValue(forKey: id)
+                        appState.removeCustomHabitSchedule(id: id)
                     }
                 }
```

**ファイル**: `aniccaios/aniccaios/AppState.swift` (カスタム習慣用の削除メソッド追加)

```diff
--- a/aniccaios/aniccaios/AppState.swift
+++ b/aniccaios/aniccaios/AppState.swift
@@ -245,6 +245,16 @@ final class AppState: ObservableObject {
         }
     }
 
+    /// カスタム習慣のスケジュールを削除（通知も更新）
+    func removeCustomHabitSchedule(id: UUID) {
+        customHabitSchedules.removeValue(forKey: id)
+        saveCustomHabitSchedules()
+        Task {
+            await applyCustomSchedulesToScheduler()
+        }
+    }
+
     private func saveHabitSchedules() {
```

---

## ⑧ AlarmKitアラームのSnooze/リピート対応

**ファイル**: `aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`

**現状の問題**: `HabitAlarmStopIntent` がすべてのアラームをキャンセルしてしまう。また、Snooze機能を使っていない。

```diff
--- a/aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
+++ b/aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
@@ -8,6 +8,13 @@ import SwiftUI
 // MARK: - AlarmButton Extension
 @available(iOS 26.0, *)
 extension AlarmButton {
+    static var snoozeButton: AlarmButton {
+        AlarmButton(
+            text: LocalizedStringResource("Snooze"),
+            textColor: .orange,
+            systemImageName: "bell.and.waves.left.and.right"
+        )
+    }
+    
     static var stopButton: AlarmButton {
         AlarmButton(
             text: LocalizedStringResource("Stop"),
@@ -83,14 +90,27 @@ final class AlarmKitHabitCoordinator {
             
             for offset in 0..<iterations {
                 let (fireHour, fireMinute) = offsetMinutes(baseHour: hour, baseMinute: minute, offsetMinutes: offset)
                 let time = Alarm.Schedule.Relative.Time(hour: fireHour, minute: fireMinute)
                 let schedule = Alarm.Schedule.relative(.init(
                     time: time,
                     repeats: .weekly(Locale.Weekday.allWeekdays)
                 ))
                 
+                // 最後のアラーム以外はSnoozeボタン付き
+                let isLastAlarm = (offset == iterations - 1)
+                let secondaryButton: AlarmButton? = isLastAlarm ? .openAppButton : .snoozeButton
+                let secondaryBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior? = isLastAlarm ? .custom : .countdown
+                
                 let alert = AlarmPresentation.Alert(
                     title: localizedTitle(for: habit),
                     stopButton: .stopButton,
-                    secondaryButton: .openAppButton,
-                    secondaryButtonBehavior: .custom
+                    secondaryButton: secondaryButton,
+                    secondaryButtonBehavior: secondaryBehavior
                 )
                 let presentation = AlarmPresentation(alert: alert)
                 let metadata = HabitAlarmMetadata(habit: habit.rawValue)
                 let tintColor = tintColor(for: habit)
                 let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: tintColor)
                 
+                // Snooze用のカウントダウン設定（60秒後にリピート）
+                let countdownDuration: Alarm.CountdownDuration? = isLastAlarm ? nil : Alarm.CountdownDuration(postAlert: 60)
+                
                 var secondary = StartConversationIntent()
                 secondary.habitType = habit
                 
                 let identifier = UUID()
                 let configuration = AlarmManager.AlarmConfiguration(
-                    countdownDuration: nil,
+                    countdownDuration: countdownDuration,
                     schedule: schedule,
                     attributes: attributes,
                     stopIntent: HabitAlarmStopIntent(alarmID: identifier.uuidString, habitRawValue: habit.rawValue),
                     secondaryIntent: secondary
                 )
```

**注意**: `HabitAlarmStopIntent` の `perform()` も修正が必要です。現在は全アラームをキャンセルしていますが、個別のアラームのみをキャンセルするように変更：

```diff
--- a/aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
+++ b/aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
@@ -226,9 +226,12 @@ struct HabitAlarmStopIntent: LiveActivityIntent {
     
     func perform() async throws -> some IntentResult {
-        if let habit = HabitType(rawValue: habitRawValue) {
-            await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
-            NotificationScheduler.shared.cancelHabit(habit)
+        // 個別のアラームのみを停止（全アラームをキャンセルしない）
+        if let uuid = UUID(uuidString: alarmID) {
+            do {
+                try AlarmManager.shared.stop(id: uuid)
+            } catch {
+                // 既に停止済みの場合は無視
+            }
         }
         return .result()
     }
```

---

## ⑨ アプリがアクティブ時（画面オン時）のAlarmKit動作

**調査結果**: AlarmKitは「Lock Screen」「Dynamic Island」「StandBy」に表示される設計で、**画面操作中のフルスクリーン表示は仕様上ない**。時計アプリも同様に、画面操作中はバナー通知として表示される。

**問題の原因**: 現在の実装では、AlarmKitが有効な場合に通常のTime Sensitive通知をスキップしているため、画面ON時に何も表示されない。

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

```diff
--- a/aniccaios/aniccaios/Notifications/NotificationScheduler.swift
+++ b/aniccaios/aniccaios/Notifications/NotificationScheduler.swift
@@ -113,14 +113,16 @@ final class NotificationScheduler {
     // MARK: Scheduling
     func applySchedules(_ schedules: [HabitType: DateComponents]) async {
         await removePending(withPrefix: "HABIT_")
         for (habit, components) in schedules {
             guard let hour = components.hour, let minute = components.minute else { continue }
-            if await scheduleWithAlarmKitIfNeeded(habit: habit, hour: hour, minute: minute) {
-                continue
-            }
+            
+            // AlarmKitをスケジュール（ロック画面用フルスクリーンアラート）
+            _ = await scheduleWithAlarmKitIfNeeded(habit: habit, hour: hour, minute: minute)
+            
+            // 通常のTime Sensitive通知も必ずスケジュール（画面ON時のバナー通知用）
             await scheduleMain(habit: habit, hour: hour, minute: minute)
             scheduleFollowupLoop(for: habit, baseComponents: components)
         }
     }
```

**動作結果**:
- **ロック画面**: AlarmKitのフルスクリーンアラート
- **画面操作中**: Time Sensitive通知のバナー（上部に表示）

---

## ⑩ オンボーディングのPaywall非表示

**要件**: オンボーディングフローでPaywallを表示しない。無料ユーザーは30分使用後にPaywallへ誘導されるため、オンボーディングでは不要。

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

```diff
--- a/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
+++ b/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
@@ -68,14 +68,12 @@ struct OnboardingFlowView: View {
         case .habitSetup:
-            // フォローアップを削除（直接Paywall/Completionへ）
             appState.clearHabitFollowUps()
             
-            // 購入状態を再確認してから分岐
             Task {
                 await SubscriptionManager.shared.syncNow()
             }
             
-            step = appState.subscriptionInfo.isEntitled ? .completion : .paywall
+            // Paywallをスキップして全員completionへ
+            step = .completion
             appState.setOnboardingStep(step)
             return
```

---

## ⑪ iOS 26未満のAlarmKitトグル非表示

**結果**: 問題②と同じ。**既に正しく実装済み** ✅

---

以上が全11問題の擬似パッチです。実装を開始してよろしいでしょうか？