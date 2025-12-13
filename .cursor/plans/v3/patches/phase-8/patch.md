# Anicca v0.3 フェーズ8 擬似パッチ

## 概要
- 対象フェーズ: 8（Nudge システム）
- 対象タスク: `8.1`〜`8.5`
- 目的:
  - iOS 側で **DP（Decision Point）イベント**を検知したら `/mobile/nudge/trigger` に送る
  - サーバーが返した Nudge（文言/ID）を **通知として提示**する（UNUserNotificationCenter）
  - 通知開封/dismiss 等の **最低限のシグナル**を `/mobile/nudge/feedback` に返す（＋センサー実装後に success/failure を確定）
  - 起床（AlarmKit）発火を Wake DP としてサーバーに通知する
  - Feeling EMI の開始/終了をサーバーへ送信し、Mental bandit（LinTS）の学習入力に乗せる

## 対象タスク（todolist.md から）
- `8.1 NudgeTriggerService実装`
- `8.2 NotificationSchedulerフォローアップ拡張`
- `8.3 AlarmKitHabitCoordinator起床DP連携`
- `8.4 Nudge結果フィードバック取得`
- `8.5 Talk Feeling bandit連携`

## 参照仕様（v3）
- `.cursor/plans/v3/todolist.md`（フェーズ8: 8.1〜8.5）
- `.cursor/plans/v3/tech-nudge-scheduling-v3.md`（頻度/クールダウン/優先度・stale>15分の扱い）
- `.cursor/plans/v3/tech-bandit-v3.md`（LinTS の扱い、v0.3で学習ON: Wake/Bedtime/Mental）
- `.cursor/plans/v3/tech-state-builder-v3.md`（state入力の固定順序・権限未許可は0埋め/quiet）
- `.cursor/plans/v3/migration-patch-v3.md`（`POST /api/mobile/nudge/feedback`（6.5）・`/nudge/trigger`（6.4）・Feeling API（6.2-6.3））
- `.cursor/plans/v3/v3-ui.md`（通知UXの位置づけ、Nudge strength の概念）
- 既存コード（現行導線の一次情報）:
  - `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`
  - `aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`
  - `aniccaios/aniccaios/VoiceSessionController.swift`
  - `aniccaios/aniccaios/AppDelegate.swift`（通知アクションの受け口）

## 参照した公式URL一覧（妄想禁止のための一次情報）
> **Apple通知（UNUserNotificationCenter）**と「通知→アプリ起動→アクション識別子」の制約を、Apple Developer Documentation の一次情報で固定する。

### UserNotifications（通知アクション/開封/dismiss）
- `https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/usernotificationcenter(_:didreceive:withcompletionhandler:)/`（通知へのユーザー反応をデリゲートで受け取る）
- `https://developer.apple.com/documentation/usernotifications/unnotificationresponse/`（`actionIdentifier` で分岐する一次情報）
- `https://developer.apple.com/documentation/usernotifications/unnotificationresponse/actionidentifier/`（`actionIdentifier` の意味）
- `https://developer.apple.com/documentation/usernotifications/unnotificationdefaultactionidentifier/`（通知本体タップで app を開いたことを示す識別子）
- `https://developer.apple.com/documentation/usernotifications/unnotificationdismissactionidentifier/`（通知UIを明示dismissした識別子）
- `https://developer.apple.com/documentation/usernotifications/unnotificationactionoptions/foreground/`（アクションが app をフォアグラウンド起動する）
- `https://developer.apple.com/documentation/usernotifications/unnotificationcategoryoptions/customdismissaction/`（dismiss をデリゲートへ送る）
- `https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types/`（カテゴリ/アクション登録の手順）
- `https://developer.apple.com/documentation/usernotifications/handling-notifications-and-notification-related-actions/`（通知/アクション処理のガイド）

### AlarmKit（起床DPフックの一次情報）
- `https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmupdates-swift.property/`（`AlarmManager.alarmUpdates` が AsyncSequence である一次情報）
- `https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmupdates-swift.struct/`（`alarmUpdates` の要素型/意味）

## 方針（決定）
### A. DP 検知とスケジューリング責務
- **DP 検知は iOS**（DeviceActivity/HealthKit/Motion/AlarmKit）で行い、イベントを `/mobile/nudge/trigger` に送る。
- **頻度・クールダウン・優先度・延期（30分窓/最大2窓）・日次上限・stale>15分**の判定は **サーバー側**で完結する（`tech-nudge-scheduling-v3.md` 準拠）。
  - iOS 側は「イベントが起きた」ことだけを送る（state や bandit feature は作らない）。

### B. iOS 通知のカテゴリ設計
- 既存 `HABIT_ALARM` に加え、Nudge 用に `NUDGE` カテゴリを追加する。
- `UNNotificationCategoryOptions.customDismissAction` を Nudge にも付け、dismiss を `AppDelegate.userNotificationCenter(_:didReceive:...)` で検出する（一次情報は上記URL）。

### C. フィードバック（/nudge/feedback）
- iOS が確実に取れるシグナル（開封/アクション/ dismiss）を `signals` に入れて即時送信する。
- success/failure を確定できる追加シグナル（SNS クローズ/再開なし、歩数増分 等）は、フェーズ7（センサー）実装後に `NudgeTriggerService` の API を通じて追加送信する。
  - 本フェーズの擬似パッチでは「後続シグナルの受け口（メソッド/保存）」までを作る。

### D. Wake DP
- AlarmKit の `alarmUpdates` で `.alerting` を検出したら **Wake DP** を `/mobile/nudge/trigger` に送る（サーバーで競合/上限/ログを一元管理）。

### E. Feeling bandit（Mental）
- Feeling EMI 開始時に `/mobile/feeling/start`、終了時に `/mobile/feeling/end`（EMA yes/no）を送る。
- v0.3 の LinTS 学習対象は **Mental** が ON（`tech-bandit-v3.md`）なので、`emaBetter` が reward のトリガになる設計に合わせる。

## ファイル別の変更概要
### iOS（Swift）
- `aniccaios/aniccaios/Services/NudgeTriggerService.swift`（新規）
  - DPイベント送信（/nudge/trigger）
  - サーバーレスポンスを通知としてスケジュール（NotificationScheduler呼び出し）
  - 通知開封/dismiss 等のフィードバック送信（/nudge/feedback）
- `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`
  - `NUDGE` カテゴリ追加 + Nudge 通知スケジュールAPI追加
  - 既存の habit 通知識別子と衝突しない `NUDGE_*` の identifier ルール
- `aniccaios/aniccaios/AppDelegate.swift`
  - Nudge 通知の actionIdentifier を解釈し、NudgeTriggerService にフィードバック連携
- `aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`
  - `.alerting` 検出時に wake DP を NudgeTriggerService に通知
- `aniccaios/aniccaios/Config.swift`
  - `/mobile/nudge/trigger` `/mobile/nudge/feedback` `/mobile/feeling/start` `/mobile/feeling/end` の URL 追加
- `aniccaios/aniccaios/VoiceSessionController.swift`
  - Feeling EMI の開始/終了 API 呼び出しのフック（サーバーへEMAを送る）

---

## 完全パッチ（apply_patch 互換）

### 8.1 NudgeTriggerService（新規）

```text
*** Begin Patch
*** Add File: aniccaios/aniccaios/Services/NudgeTriggerService.swift
+import Foundation
+import OSLog
+import UserNotifications
+
+/// v0.3: DP(Event) -> /mobile/nudge/trigger -> (必要なら) ローカル通知を提示
+/// - 送信頻度/クールダウン/優先度/延期/日次上限/metrics stale はサーバ側で判定（tech-nudge-scheduling-v3.md）
+/// - iOS は「イベントが起きた」ことと最低限の signals を送る
+final class NudgeTriggerService {
+    static let shared = NudgeTriggerService()
+
+    private let logger = Logger(subsystem: "com.anicca.ios", category: "NudgeTrigger")
+    private let iso8601 = ISO8601DateFormatter()
+
+    private init() {}
+
+    // MARK: - DP Event Types (todolist.md phase-8)
+    enum EventType: String {
+        case sns30Min = "sns_30min"
+        case sns60Min = "sns_60min"
+        case sedentary2h = "sedentary_2h"
+        case morningPhone = "morning_phone"
+        case bedtimePre = "bedtime_pre"
+        case wakeAlarmFired = "wake_alarm_fired"
+        case feeling = "feeling" // Feeling EMI DP（Mental）
+    }
+
+    // MARK: - Public entrypoints (called by sensors / AlarmKit / UI)
+    func trigger(eventType: EventType, payload: [String: Any] = [:]) async {
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+
+        var req = URLRequest(url: AppConfig.nudgeTriggerURL)
+        req.httpMethod = "POST"
+        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+
+        var body: [String: Any] = [
+            "eventType": eventType.rawValue,
+            "timestamp": iso8601.string(from: Date())
+        ]
+        if !payload.isEmpty { body["payload"] = payload }
+
+        do {
+            req.httpBody = try JSONSerialization.data(withJSONObject: body)
+            let (data, response) = try await NetworkSessionManager.shared.session.data(for: req)
+            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
+                logger.error("nudge/trigger failed: non-2xx")
+                return
+            }
+
+            // 期待レスポンス（migration-patch-v3.md 6.4）
+            // {
+            //   "nudgeId": "uuid",
+            //   "templateId": "...",
+            //   "message": "...",
+            //   "domain": "wake|screen|movement|mental|habit|morning_phone|sleep"
+            // }
+            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
+            let nudgeId = (json["nudgeId"] as? String) ?? ""
+            let message = (json["message"] as? String) ?? ""
+            let domain = (json["domain"] as? String) ?? ""
+
+            // サーバが do_nothing / 空メッセージを返した場合は通知しない（送信可否はサーバ責務）
+            guard !nudgeId.isEmpty, !message.isEmpty else {
+                return
+            }
+
+            await NotificationScheduler.shared.scheduleNudgeNow(
+                nudgeId: nudgeId,
+                domain: domain,
+                message: message,
+                userInfo: [
+                    "nudgeId": nudgeId,
+                    "domain": domain,
+                    "eventType": eventType.rawValue
+                ]
+            )
+        } catch {
+            logger.error("nudge/trigger error: \(error.localizedDescription, privacy: .public)")
+        }
+    }
+
+    /// AlarmKit からの wake DP
+    func triggerWakeAlarmFired() async {
+        await trigger(eventType: .wakeAlarmFired)
+    }
+
+    // MARK: - Feedback (minimum signals in v0.3)
+    enum FeedbackOutcome: String {
+        case success
+        case failed
+        case ignored
+    }
+
+    func sendFeedback(nudgeId: String, outcome: FeedbackOutcome, signals: [String: Any]) async {
+        guard !nudgeId.isEmpty else { return }
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+
+        var req = URLRequest(url: AppConfig.nudgeFeedbackURL)
+        req.httpMethod = "POST"
+        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+
+        let body: [String: Any] = [
+            "nudgeId": nudgeId,
+            "outcome": outcome.rawValue,
+            "signals": signals
+        ]
+
+        do {
+            req.httpBody = try JSONSerialization.data(withJSONObject: body)
+            _ = try await NetworkSessionManager.shared.session.data(for: req)
+        } catch {
+            logger.error("nudge/feedback error: \(error.localizedDescription, privacy: .public)")
+        }
+    }
+
+    // MARK: - Notification signals (called from AppDelegate)
+    func recordOpened(nudgeId: String, actionIdentifier: String) async {
+        await sendFeedback(
+            nudgeId: nudgeId,
+            outcome: .success, // v0.3: 「開封」は最低限の成功シグナルとして success 扱い（追加の成功/失敗確定はセンサー実装後に拡張）
+            signals: [
+                "notificationOpened": true,
+                "actionIdentifier": actionIdentifier
+            ]
+        )
+    }
+
+    func recordDismissed(nudgeId: String) async {
+        await sendFeedback(
+            nudgeId: nudgeId,
+            outcome: .ignored,
+            signals: [
+                "notificationOpened": false
+            ]
+        )
+    }
+}
+
*** End Patch
```

### 8.2 NotificationScheduler: Nudge カテゴリ追加 + Nudge 通知スケジュール API

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Notifications/NotificationScheduler.swift
@@
 final class NotificationScheduler {
@@
     enum Category: String {
         case habitAlarm = "HABIT_ALARM"
+        case nudge = "NUDGE"
     }
@@
     func registerCategories() {
@@
         let category = UNNotificationCategory(
             identifier: Category.habitAlarm.rawValue,
             actions: [start, dismiss],
             intentIdentifiers: [],
             options: [.customDismissAction]
         )
+
+        let nudgeCategory = UNNotificationCategory(
+            identifier: Category.nudge.rawValue,
+            actions: [start, dismiss],
+            intentIdentifiers: [],
+            options: [.customDismissAction]
+        )
 
-        center.setNotificationCategories([category])
+        center.setNotificationCategories([category, nudgeCategory])
     }
+
+    // MARK: - Nudge scheduling (v0.3)
+    /// /mobile/nudge/trigger の応答を「即時ローカル通知」として提示する。
+    /// - 注意: 頻度/クールダウン/優先度/延期はサーバ側で制御する（iOSは提示のみ）。
+    func scheduleNudgeNow(nudgeId: String, domain: String, message: String, userInfo: [String: Any]) async {
+        guard !nudgeId.isEmpty, !message.isEmpty else { return }
+
+        let content = UNMutableNotificationContent()
+        content.title = "Anicca"
+        content.body = message
+        content.categoryIdentifier = Category.nudge.rawValue
+        content.userInfo = userInfo
+
+        // v0.3: Nudge は habit alarm と異なり「連続リピート音」なし（gentle）
+        content.sound = .default
+        if #available(iOS 15.0, *) {
+            content.interruptionLevel = .active
+        }
+
+        // 即時（1秒後）に提示
+        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
+        let request = UNNotificationRequest(
+            identifier: keyNudgeMain(nudgeId: nudgeId),
+            content: content,
+            trigger: trigger
+        )
+        do {
+            try await center.add(request)
+        } catch {
+            logger.error("Failed to schedule nudge notification: \(error.localizedDescription, privacy: .public)")
+        }
+    }
+
+    func nudgeId(fromIdentifier identifier: String) -> String? {
+        // NUDGE_MAIN_<nudgeId>
+        let parts = identifier.split(separator: "_")
+        guard parts.count >= 3, parts[0] == "NUDGE", parts[1] == "MAIN" else { return nil }
+        return String(parts[2])
+    }
+
+    private func keyNudgeMain(nudgeId: String) -> String {
+        "NUDGE_MAIN_\(nudgeId)"
+    }
 }
*** End Patch
```

### 8.4 AppDelegate: Nudge 通知の開封/dismiss を feedback に変換

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/AppDelegate.swift
@@
 class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
@@
     func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
         defer { completionHandler() }
 
         let identifier = response.actionIdentifier
         let notificationIdentifier = response.notification.request.identifier
-        
-        guard let habit = NotificationScheduler.shared.habit(fromIdentifier: notificationIdentifier) else { return }
-        let customHabitId = NotificationScheduler.shared.customHabitId(fromIdentifier: notificationIdentifier)
+
+        // 1) Habit alarm（既存）
+        if let habit = NotificationScheduler.shared.habit(fromIdentifier: notificationIdentifier) {
+            let customHabitId = NotificationScheduler.shared.customHabitId(fromIdentifier: notificationIdentifier)
 
-        switch identifier {
-        case NotificationScheduler.Action.startConversation.rawValue,
-             UNNotificationDefaultActionIdentifier:
+            switch identifier {
+            case NotificationScheduler.Action.startConversation.rawValue,
+                 UNNotificationDefaultActionIdentifier:
             // ユーザーが通知から会話に入ったので、その習慣の後続フォローアップはすべてキャンセル
             NotificationScheduler.shared.cancelFollowups(for: habit)
             if let customId = customHabitId {
                 NotificationScheduler.shared.cancelCustomFollowups(id: customId)
             }
             Task {
                 habitLaunchLogger.info("Notification accepted for habit \(habit.rawValue, privacy: .public) id=\(notificationIdentifier, privacy: .public)")
                 do {
                     try AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
                     habitLaunchLogger.info("Audio session configured for realtime")
                 } catch {
                     habitLaunchLogger.error("Audio session configure failed: \(error.localizedDescription, privacy: .public)")
                 }
                 await MainActor.run {
                     AppState.shared.selectedRootTab = .talk
                     AppState.shared.prepareForImmediateSession(habit: habit, customHabitId: customHabitId)
                     habitLaunchLogger.info("AppState prepared immediate session for habit \(habit.rawValue, privacy: .public)")
                 }
             }
-        case NotificationScheduler.Action.dismissAll.rawValue:
+            case NotificationScheduler.Action.dismissAll.rawValue:
             // 「止める」アクション時も、その習慣の後続フォローアップを完全にキャンセル
             NotificationScheduler.shared.cancelFollowups(for: habit)
             if let customId = customHabitId {
                 NotificationScheduler.shared.cancelCustomFollowups(id: customId)
             }
-        default:
+            default:
             break
+            }
+            return
         }
+
+        // 2) Nudge（新規）
+        if let nudgeId = NotificationScheduler.shared.nudgeId(fromIdentifier: notificationIdentifier) {
+            Task {
+                switch identifier {
+                case UNNotificationDismissActionIdentifier:
+                    await NudgeTriggerService.shared.recordDismissed(nudgeId: nudgeId)
+                case NotificationScheduler.Action.dismissAll.rawValue:
+                    await NudgeTriggerService.shared.recordDismissed(nudgeId: nudgeId)
+                case NotificationScheduler.Action.startConversation.rawValue,
+                     UNNotificationDefaultActionIdentifier:
+                    await NudgeTriggerService.shared.recordOpened(nudgeId: nudgeId, actionIdentifier: identifier)
+                default:
+                    break
+                }
+            }
+        }
     }
 }
*** End Patch
```

### 8.3 AlarmKitHabitCoordinator: wake DP を /nudge/trigger に送る

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift
@@
     private func startAlarmMonitoring() {
         alarmMonitorTask = Task { [weak self] in
@@
             for await alarms in AlarmManager.shared.alarmUpdates {
                 guard let self = self else { break }
@@
                 for alarm in alarms {
                     if case .alerting = alarm.state {
@@
                         let habit = await MainActor.run {
                             self.findHabitForAlarmId(alarm.id)
                         }
                         await MainActor.run {
                             self.currentAlertingHabit = habit
@@
                         }
+
+                        // v0.3: wake の alerting を DP としてサーバに通知（頻度/上限はサーバ側）
+                        if habit == .wake {
+                            Task.detached(priority: .utility) {
+                                await NudgeTriggerService.shared.triggerWakeAlarmFired()
+                            }
+                        }
                         break
                     }
                 }
             }
         }
     }
*** End Patch
```

### 8.1/8.4: Config に nudge/feeling エンドポイント追加

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/Config.swift
@@
 enum AppConfig {
@@
     static var entitlementSyncURL: URL {
         proxyBaseURL.appendingPathComponent("mobile/entitlement")
     }
+
+    // MARK: - v0.3 Nudge / Feeling
+    static var nudgeTriggerURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/nudge/trigger")
+    }
+
+    static var nudgeFeedbackURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/nudge/feedback")
+    }
+
+    static var feelingStartURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/feeling/start")
+    }
+
+    static var feelingEndURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/feeling/end")
+    }
 }
*** End Patch
```

### 8.5 VoiceSessionController: Feeling EMI start/end をサーバへ送る（最小フック）
> UI（Feelingボタン/EMAモーダル）はフェーズ5で実装される前提。ここでは controller 側の API と送信処理だけを先に用意する。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/VoiceSessionController.swift
@@
 final class VoiceSessionController: NSObject, ObservableObject {
@@
     private var currentHabitType: HabitType?
+    private var activeFeelingSessionId: String?
+    private var pendingFeelingEmaBetter: Bool?
@@
     func stop() {
         logger.debug("Stopping realtime session")
+        Task { await self.endFeelingIfNeeded() }
         currentHabitType = nil
@@
     }
+
+    // MARK: - Feeling EMI (v0.3)
+    /// Feeling ボタン押下から呼ぶ（Talkタブ側で使用）
+    func startFeeling(feelingId: String, topic: String?) {
+        guard connectionStatus != .connecting else { return }
+        setStatus(.connecting)
+        Task { [weak self] in
+            await self?.beginFeelingIfNeeded(feelingId: feelingId, topic: topic)
+            await self?.establishSession(resumeImmediately: true)
+        }
+    }
+
+    /// EMA（楽になった？）回答を UI から受け取る（Session終了時に /mobile/feeling/end へ送る）
+    func setFeelingEmaBetter(_ better: Bool) {
+        pendingFeelingEmaBetter = better
+    }
+
+    private func beginFeelingIfNeeded(feelingId: String, topic: String?) async {
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+        var req = URLRequest(url: AppConfig.feelingStartURL)
+        req.httpMethod = "POST"
+        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+
+        let body: [String: Any] = [
+            "feelingId": feelingId,
+            "topic": topic ?? ""
+        ]
+        do {
+            req.httpBody = try JSONSerialization.data(withJSONObject: body)
+            let (data, response) = try await NetworkSessionManager.shared.session.data(for: req)
+            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
+                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
+            activeFeelingSessionId = json["sessionId"] as? String
+
+            // openingScript が返る設計（migration-patch-v3.md 6.2）なので、LLMが先に話すように consultPrompt に乗せる
+            if let opening = json["openingScript"] as? String, !opening.isEmpty {
+                await MainActor.run {
+                    AppState.shared.prepareExternalPrompt(opening, autoResponse: true)
+                }
+            }
+        } catch {
+            logger.error("feeling/start error: \(error.localizedDescription, privacy: .public)")
+        }
+    }
+
+    private func endFeelingIfNeeded() async {
+        guard let sessionId = activeFeelingSessionId else { return }
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+        var req = URLRequest(url: AppConfig.feelingEndURL)
+        req.httpMethod = "POST"
+        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+
+        let body: [String: Any] = [
+            "sessionId": sessionId,
+            "emaBetter": pendingFeelingEmaBetter ?? NSNull(),
+            "summary": "" // v0.3: まずは空（後続フェーズで要約を追加）
+        ]
+        do {
+            req.httpBody = try JSONSerialization.data(withJSONObject: body)
+            _ = try await NetworkSessionManager.shared.session.data(for: req)
+        } catch {
+            logger.error("feeling/end error: \(error.localizedDescription, privacy: .public)")
+        }
+        activeFeelingSessionId = nil
+        pendingFeelingEmaBetter = nil
+    }
*** End Patch
```

### （補助）AppState: 外部 prompt + autoResponse フラグを受け取る API
> Feeling EMI の openingScript を「LLMが先に話す」挙動に乗せるため、既存の `pendingConsultPrompt` と同等の仕組みで外部プロンプトを注入する。

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/AppState.swift
@@
 final class AppState: ObservableObject {
@@
     private var pendingHabitPrompt: (habit: HabitType, prompt: String)?
     private var pendingConsultPrompt: String?
+    private var pendingAutoResponse: Bool = false
@@
     func prepareConsultSessionPrompt() {
@@
         pendingHabitPrompt = nil
         pendingConsultPrompt = base + directive
+        pendingAutoResponse = false
     }
+
+    /// v0.3: サーバから返ってきた openingScript 等を、そのまま Realtime instructions に流す
+    /// - autoResponse=true の場合、VoiceSessionController が response.create を送って「Aniccaが先に話す」挙動にする
+    func prepareExternalPrompt(_ prompt: String, autoResponse: Bool) {
+        pendingHabitPrompt = nil
+        pendingConsultPrompt = prompt
+        pendingAutoResponse = autoResponse
+    }
@@
     func consumePendingConsultPrompt() -> String? {
         let prompt = pendingConsultPrompt
         pendingConsultPrompt = nil
         return prompt
     }
+
+    func consumePendingAutoResponse() -> Bool {
+        let v = pendingAutoResponse
+        pendingAutoResponse = false
+        return v
+    }
*** End Patch
```

### （補助）VoiceSessionController: consult/external prompt 時に autoResponse を反映

```text
*** Begin Patch
*** Update File: aniccaios/aniccaios/VoiceSessionController.swift
@@
     @MainActor
     func sendSessionUpdate() {
@@
         var shouldTriggerHabitResponse = false
+        var shouldAutoRespond = false
         var instructions: String?
         if let prompt = AppState.shared.consumePendingPrompt() {
             instructions = prompt
             shouldTriggerHabitResponse = true   // habit プロンプト送信を記録
         } else if let consultPrompt = AppState.shared.consumePendingConsultPrompt() {
             instructions = consultPrompt
+            shouldAutoRespond = AppState.shared.consumePendingAutoResponse()
         }
@@
         if shouldTriggerHabitResponse {
             sendWakeResponseCreate()
             Task { @MainActor in
                 AppState.shared.clearPendingHabitTrigger()
             }
+        } else if shouldAutoRespond {
+            // v0.3: Feeling openingScript 等で「Aniccaが先に話す」
+            sendWakeResponseCreate()
         }
     }
*** End Patch
```

---

## 追加メモ（実装時の注意）
- `tech-nudge-scheduling-v3.md` の「stale>15分なら送らない」「権限未許可は quiet 扱い」は **サーバ側**で判定し、`/nudge/trigger` が do_nothing/空レスポンスを返すことで iOS 表示を抑制する。
- iOS 側の success/failure 判定を強化する場合は、フェーズ7（センサー）で `NudgeTriggerService` に追加の `recordSnsClosed(...)` / `recordStepsDelta(...)` などの入力口を増やし、`/nudge/feedback` に `signals` を追加送信する（窓幅は `tech-nudge-scheduling-v3.md` の共通前提に固定）。


