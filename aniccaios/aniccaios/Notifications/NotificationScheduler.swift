import Foundation
import UserNotifications
import OSLog
import UIKit
#if canImport(AlarmKit)
import AlarmKit
#endif

final class NotificationScheduler {
    static let shared = NotificationScheduler()

    enum Category: String {
        case habitAlarm = "HABIT_ALARM"
        case preReminder = "PRE_REMINDER"
        case nudge = "NUDGE"
    }

    enum Action: String {
        case startConversation = "START_CONVERSATION"
        case dismissAll = "DISMISS_ALL"
    }

    private let center = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "NotificationScheduler")
    private let mainSchedulingHorizonDays = 14  // 2週間ぶんの通知を先に登録
    
    private enum AlarmLoop {
        /// 30秒ごとに再通知
        static let intervalSeconds = 30
    }
    
    private func repeatCount(for habit: HabitType) -> Int {
        return AppState.shared.followupCount(for: habit)
    }
    
    private init() {}
    
    // MARK: - Localization Helper
    
    private func localizedString(_ key: String, comment: String = "") -> String {
        let language = AppState.shared.userProfile.preferredLanguage
        guard let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            // Fallback to system localization
            return NSLocalizedString(key, comment: comment)
        }
        return NSLocalizedString(key, tableName: nil, bundle: bundle, value: key, comment: comment)
    }

    // MARK: Authorization
    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            // .timeSensitive は iOS 15 以降で非推奨。テスト済みのエンタイトルメント
            // (com.apple.developer.usernotifications.time-sensitive) を利用する。
            let notificationsGranted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            return notificationsGranted
        } catch {
            logger.error("Notification authorization error: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    func requestAuthorizationIfNeeded() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            return await requestAuthorization()
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    func isAuthorizedForAlerts() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    // MARK: Categories
    func registerCategories() {
        let start = UNNotificationAction(
            identifier: Action.startConversation.rawValue,
            title: localizedString("notification_action_start_conversation"),
            options: [.foreground]
        )

        let dismiss = UNNotificationAction(
            identifier: Action.dismissAll.rawValue,
            title: localizedString("notification_action_dismiss"),
            options: [.destructive]
        )

        let category = UNNotificationCategory(
            identifier: Category.habitAlarm.rawValue,
            actions: [start, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let nudgeCategory = UNNotificationCategory(
            identifier: Category.nudge.rawValue,
            actions: [start, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        
        // PRE_REMINDER カテゴリ
        let preReminderCategory = UNNotificationCategory(
            identifier: Category.preReminder.rawValue,
            actions: [start, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        center.setNotificationCategories([category, nudgeCategory, preReminderCategory])
    }

    // MARK: Scheduling
    func applySchedules(_ schedules: [HabitType: DateComponents]) async {
        await removePending(withPrefix: "HABIT_")
#if canImport(AlarmKit)
        if #available(iOS 26.0, *), AlarmKitHabitCoordinator.shared.hasPendingSessions {
            await AlarmKitHabitCoordinator.shared.flushPendingStops()
        }
#endif
        await cancelAllPreReminders()  // 追加: 事前通知もクリア
        for (habit, components) in schedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            
            // AlarmKitをスケジュール（iOS 26+ かつユーザーがONにしている場合）
            let alarmKitScheduled = await scheduleWithAlarmKitIfNeeded(habit: habit, hour: hour, minute: minute)
            
            // AlarmKitがOFFの場合のみ、通常のTime Sensitive通知をスケジュール
            // AlarmKitがONの場合、画面操作中でもDynamic Island/バナーでアラーム通知が表示される
            if !alarmKitScheduled {
                await scheduleMain(habit: habit, hour: hour, minute: minute)
                scheduleFollowupLoop(for: habit, baseComponents: components)
            }
            
            // 事前通知をスケジュール（bedtime, training, customのみ）
            await schedulePreReminder(habit: habit, hour: hour, minute: minute)
            
            logger.info("Scheduled \(habit.rawValue, privacy: .public): AlarmKit=\(alarmKitScheduled, privacy: .public)")
        }
    }

    func cancelHabit(_ habit: HabitType) {
        Task {
            await removePending(withPrefix: mainPrefix(for: habit))
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
#if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
#endif
        }
    }

    func cancelAll() async {
        await removePending(withPrefix: "HABIT_")
        await removeDelivered(withPrefix: "HABIT_")
    }

    /// フォローアップ通知をキャンセル
    /// - Parameter habit: キャンセルする習慣タイプ
    /// - Parameter includeAlarmKit: AlarmKitアラームもキャンセルするかどうか（デフォルトtrue）
    func cancelFollowups(for habit: HabitType, includeAlarmKit: Bool = true) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            
#if canImport(AlarmKit)
            if #available(iOS 26.0, *), includeAlarmKit {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
#endif
        }
    }

    func cancelAllFollowups() {
        Task {
            await removePending(withPrefix: "HABIT_FOLLOW_")
            await removeDelivered(withPrefix: "HABIT_FOLLOW_")
        }
    }

    /// 特定のカスタム習慣(UUID)に紐づくフォローアップ通知のみをキャンセル
    func cancelCustomFollowups(id: UUID) {
        Task {
            await removePending(withPrefix: keyCustomFollowPrefix(id: id))
            await removeDelivered(withPrefix: keyCustomFollowPrefix(id: id))
        }
    }

    func habit(fromIdentifier identifier: String) -> HabitType? {
        let parts = identifier.split(separator: "_")
        guard parts.count >= 3, parts[0] == "HABIT" else { return nil }

        // カスタム習慣: HABIT_CUSTOM_MAIN_..., HABIT_CUSTOM_FOLLOW_... は .custom にマップ
        if parts.count >= 2, parts[1] == "CUSTOM" {
            return .custom
        }

        // デフォルト習慣: HABIT_MAIN_wake_..., HABIT_FOLLOW_bedtime_...
        return HabitType(rawValue: String(parts[2]))
    }

    /// カスタム習慣通知の識別子から UUID を抽出する
    /// 期待フォーマット:
    /// - HABIT_CUSTOM_MAIN_<UUID>_...
    /// - HABIT_CUSTOM_FOLLOW_<UUID>_...
    func customHabitId(fromIdentifier identifier: String) -> UUID? {
        let parts = identifier.split(separator: "_")
        guard parts.count >= 4,
              parts[0] == "HABIT",
              parts[1] == "CUSTOM" else { return nil }
        return UUID(uuidString: String(parts[3]))
    }

    // MARK: Private helpers
    private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
        await removePending(withPrefix: mainPrefix(for: habit))
        await removeDelivered(withPrefix: mainPrefix(for: habit))
        
        guard let firstFireDate = nextDate(hour: hour, minute: minute) else { return }
        for offset in 0..<mainSchedulingHorizonDays {
            guard let fireDate = Calendar.current.date(byAdding: .day, value: offset, to: firstFireDate) else { continue }
            
            let triggerComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: false)
            
            let content = UNMutableNotificationContent()
            content.title = habit.title
            content.body = primaryBody(for: habit, at: fireDate)
            content.categoryIdentifier = Category.habitAlarm.rawValue
            content.interruptionLevel = .timeSensitive
            content.sound = wakeSound()
            
            let request = UNNotificationRequest(
                identifier: keyMain(for: habit, timestamp: Int(fireDate.timeIntervalSince1970)),
                content: content,
                trigger: trigger
            )
            
            do {
                try await center.add(request)
            } catch {
                logger.error("Failed to schedule main notification: \(error.localizedDescription, privacy: .public)")
            }
        }
        
        logger.info("Scheduled rolling main notifications for \(habit.rawValue, privacy: .public) at \(hour):\(minute)")
    }

    /// メイン通知の 0 秒起点から 30 秒間隔で AppState 設定回数ぶんのフォローアップを登録
    private func scheduleFollowupLoop(for habit: HabitType, baseComponents: DateComponents) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            guard let firstFireDate = nextFireDate(from: baseComponents) else { return }

            let totalCount = repeatCount(for: habit)
            // メイン通知1回 + フォローアップ通知（totalCount - 1）回 = 合計totalCount回
            for index in 1..<totalCount {
                guard let fireDate = Calendar.current.date(
                    byAdding: .second,
                    value: index * AlarmLoop.intervalSeconds,
                    to: firstFireDate
                ) else { continue }

                let triggerComponents = Calendar.current.dateComponents(
                    [.year, .month, .day, .hour, .minute, .second],
                    from: fireDate
                )
                let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: false)
                let request = UNNotificationRequest(
                    identifier: keyFollow(for: habit, timestamp: Int(fireDate.timeIntervalSince1970)),
                    content: baseContent(for: habit, isFollowup: true, followupIndex: index),
                    trigger: trigger
                )

                do {
                    try await center.add(request)
                } catch {
                    logger.error("Follow-up scheduling error: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func baseContent(for habit: HabitType, isFollowup: Bool, followupIndex: Int = 1) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = isFollowup ? followupTitle(for: habit) : habit.title
        content.body = isFollowup ? followupBody(for: habit, index: followupIndex) : primaryBody(for: habit)
        content.categoryIdentifier = Category.habitAlarm.rawValue
        content.interruptionLevel = .timeSensitive
        content.sound = wakeSound()
        return content
    }

    private func wakeSound() -> UNNotificationSound {
        // UNNotificationSound は aiff / wav / caf のみサポート（mp3は非対応）。
        // 起床・フォローアップ通知では、Defaul.caf が必ずバンドルされている前提で使用する。
        if Bundle.main.url(forResource: "Defaul", withExtension: "caf") != nil {
            return UNNotificationSound(named: UNNotificationSoundName("Defaul.caf"))
        }

        // ここに到達するのはビルド設定ミスの場合のみ。
        // その場合はログを出してシステムデフォルト音でフォールバックする。
        logger.error("Wake sound Defaul.caf missing in bundle; falling back to default alert")
        return .default
    }

    private func primaryBody(for habit: HabitType, at date: Date = Date()) -> String {
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: date) ?? 1
        let index = ((dayOfYear - 1) % 10) + 1
        let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
        
        switch habit {
        case .wake:
            return formattedLocalized("notification_wake_main_\(index)", userName)
        case .training:
            return formattedLocalized("notification_training_main_\(index)", userName)
        case .bedtime:
            return formattedLocalized("notification_bedtime_main_\(index)", userName)
        case .custom:
            let habitName = customHabitDisplayName()
            return formattedLocalized("notification_custom_main_\(index)", habitName)
        }
    }

    private func followupTitle(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_followup_title")
        case .training:
            return localizedString("notification_training_followup_title")
        case .bedtime:
            return localizedString("notification_bedtime_followup_title")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_followup_title_format"), name)
        }
    }

    private func followupBody(for habit: HabitType, index: Int = 1) -> String {
        // インデックスベースでローテーション（1〜10）
        let rotationIndex = ((index - 1) % 10) + 1
        let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
        
        switch habit {
        case .wake:
            return formattedLocalized("notification_wake_followup_\(rotationIndex)", userName)
        case .training:
            return formattedLocalized("notification_training_followup_\(rotationIndex)", userName)
        case .bedtime:
            return formattedLocalized("notification_bedtime_followup_\(rotationIndex)", userName)
        case .custom:
            let habitName = customHabitDisplayName()
            return String(format: localizedString("notification_custom_followup_\(rotationIndex)"), habitName)
        }
    }

    private func customHabitDisplayName() -> String {
        CustomHabitStore.shared.displayName(
            fallback: localizedString("habit_title_custom_fallback")
        )
    }

    private func nextFireDate(from components: DateComponents) -> Date? {
        var nextComponents = DateComponents()
        nextComponents.hour = components.hour
        nextComponents.minute = components.minute
        nextComponents.second = 0
        return Calendar.current.nextDate(
            after: Date(),
            matching: nextComponents,
            matchingPolicy: .nextTimePreservingSmallerComponents,
            direction: .forward
        )
    }

    private func keyMain(for habit: HabitType, timestamp: Int) -> String {
        "HABIT_MAIN_\(habit.rawValue)_\(timestamp)"
    }

    private func keyFollow(for habit: HabitType, timestamp: Int) -> String {
        "HABIT_FOLLOW_\(habit.rawValue)_\(timestamp)"
    }

    private func mainPrefix(for habit: HabitType) -> String {
        "HABIT_MAIN_\(habit.rawValue)_"
    }

    private func followPrefix(for habit: HabitType) -> String {
        "HABIT_FOLLOW_\(habit.rawValue)_"
    }

    private func removePending(withPrefix prefix: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            center.getPendingNotificationRequests { requests in
                let identifiers = requests
                    .map(\.identifier)
                    .filter { $0.hasPrefix(prefix) }
                if !identifiers.isEmpty {
                    self.center.removePendingNotificationRequests(withIdentifiers: identifiers)
                }
                continuation.resume()
            }
        }
    }

    private func removeDelivered(withPrefix prefix: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            center.getDeliveredNotifications { notifications in
                let identifiers = notifications
                    .map(\.request.identifier)
                    .filter { $0.hasPrefix(prefix) }
                if !identifiers.isEmpty {
                    self.center.removeDeliveredNotifications(withIdentifiers: identifiers)
                }
                continuation.resume()
            }
        }
    }
    
    private func shouldUseAlarmKit(for habit: HabitType) -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let profile = AppState.shared.userProfile
            switch habit {
            case .wake:
                return profile.useAlarmKitForWake
            case .training:
                return profile.useAlarmKitForTraining
            case .bedtime:
                return profile.useAlarmKitForBedtime
            case .custom:
                return profile.useAlarmKitForCustom
            }
        }
#endif
        return false
    }
    
    private func scheduleWithAlarmKitIfNeeded(habit: HabitType, hour: Int, minute: Int) async -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard shouldUseAlarmKit(for: habit) else {
                // AlarmKit無効の場合、既存のAlarmKitアラームをキャンセル
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
                return false
            }
            let followups = repeatCount(for: habit)
            let scheduled = await AlarmKitHabitCoordinator.shared.scheduleHabit(habit, hour: hour, minute: minute, followupCount: followups)
            if !scheduled {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
            return scheduled
        }
#endif
        return false
    }
    
    // MARK: - Custom Habit (UUID) support
    func applyCustomSchedules(_ schedules: [UUID: (name: String, time: DateComponents)]) async {
        // いったん全カスタムの pending/delivered を掃除（簡易実装）
        await removePending(withPrefix: "HABIT_CUSTOM_MAIN_")
        await removePending(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        await removePending(withPrefix: "PRE_REMINDER_CUSTOM_")
        await removeDelivered(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        
        for (id, entry) in schedules {
            guard let hour = entry.time.hour, let minute = entry.time.minute else { continue }
            
            // v3.1: カスタム習慣の事前通知をスケジュール（15分前）
            await scheduleCustomPreReminder(id: id, name: entry.name, hour: hour, minute: minute)
            
            // AlarmKitをスケジュール（iOS 26+ かつユーザーがONにしている場合）
            let alarmKitScheduled = await scheduleCustomWithAlarmKitIfNeeded(
                id: id,
                name: entry.name,
                hour: hour,
                minute: minute
            )
            
            // AlarmKitがOFFの場合のみ、通常通知をスケジュール
            if !alarmKitScheduled {
                await scheduleCustomMain(id: id, name: entry.name, time: entry.time)
                scheduleCustomFollowups(id: id, name: entry.name, baseComponents: entry.time)
            }
            
            logger.info("Scheduled custom habit \(id.uuidString, privacy: .public): AlarmKit=\(alarmKitScheduled, privacy: .public)")
        }
    }
    
    private func scheduleCustomWithAlarmKitIfNeeded(id: UUID, name: String, hour: Int, minute: Int) async -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard AppState.shared.userProfile.useAlarmKitForCustom else {
                // AlarmKit無効の場合、既存のAlarmKitアラームをキャンセル
                await AlarmKitHabitCoordinator.shared.cancelCustomHabitAlarms(id)
                return false
            }
            let followups = AppState.shared.customFollowupCount(for: id)
            let scheduled = await AlarmKitHabitCoordinator.shared.scheduleCustomHabit(id, name: name, hour: hour, minute: minute, followupCount: followups)
            if !scheduled {
                await AlarmKitHabitCoordinator.shared.cancelCustomHabitAlarms(id)
            }
            return scheduled
        }
#endif
        return false
    }
    
    private func scheduleCustomMain(id: UUID, name: String, time: DateComponents) async {
        let trigger = UNCalendarNotificationTrigger(dateMatching: time, repeats: true)
        let req = UNNotificationRequest(
            identifier: keyCustomMain(id: id, time: time),
            content: customBaseContent(name: name, isFollowup: false),
            trigger: trigger
        )
        try? await center.add(req)
    }
    
    private func scheduleCustomFollowups(id: UUID, name: String, baseComponents: DateComponents) {
        Task {
            await removePending(withPrefix: keyCustomFollowPrefix(id: id))
            await removeDelivered(withPrefix: keyCustomFollowPrefix(id: id))
            guard let first = nextFireDate(from: baseComponents) else { return }
            let repeats = AppState.shared.customFollowupCount(for: id)
            for index in 1...max(1, min(10, repeats)) {
                guard let fireDate = Calendar.current.date(byAdding: .second, value: index * AlarmLoop.intervalSeconds, to: first) else { continue }
                let comps = Calendar.current.dateComponents([.year,.month,.day,.hour,.minute,.second], from: fireDate)
                let trig = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                let req = UNNotificationRequest(
                    identifier: keyCustomFollow(id: id, ts: Int(fireDate.timeIntervalSince1970)),
                    content: customBaseContent(name: name, isFollowup: true, followupIndex: index),
                    trigger: trig
                )
                try? await center.add(req)
            }
        }
    }
    
    private func customBaseContent(name: String, isFollowup: Bool, followupIndex: Int = 1) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = isFollowup ? String(format: localizedString("notification_custom_followup_title_format"), name) : name
        
        if isFollowup {
            // インデックスベースでローテーション（1〜10）
            let rotationIndex = ((followupIndex - 1) % 10) + 1
            let key = "notification_custom_followup_\(rotationIndex)"
            c.body = String(format: localizedString(key), name)
        } else {
            // 日付ベースでローテーション（1〜10）
            let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
            let index = ((dayOfYear - 1) % 10) + 1
            let key = "notification_custom_main_\(index)"
            c.body = String(format: localizedString(key), name)
        }
        
        c.categoryIdentifier = Category.habitAlarm.rawValue
        c.interruptionLevel = .timeSensitive
        c.sound = wakeSound()
        return c
    }
    
    private func keyCustomMain(id: UUID, time: DateComponents) -> String {
        let hour = time.hour ?? 0
        let minute = time.minute ?? 0
        return "HABIT_CUSTOM_MAIN_\(id.uuidString)_\(hour)_\(minute)"
    }
    
    private func keyCustomFollow(id: UUID, ts: Int) -> String {
        "HABIT_CUSTOM_FOLLOW_\(id.uuidString)_\(ts)"
    }
    
    private func keyCustomFollowPrefix(id: UUID) -> String {
        "HABIT_CUSTOM_FOLLOW_\(id.uuidString)_"
    }

    // MARK: - Nudge scheduling (v0.3)
    /// /mobile/nudge/trigger の応答を「即時ローカル通知」として提示する。
    /// - 注意: 頻度/クールダウン/優先度/延期はサーバ側で制御する（iOSは提示のみ）。
    func scheduleNudgeNow(nudgeId: String, domain: String, message: String, userInfo: [String: Any]) async {
        guard !nudgeId.isEmpty, !message.isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = "Anicca"
        content.body = message
        content.categoryIdentifier = Category.nudge.rawValue
        content.userInfo = userInfo

        // v0.3: Nudge は habit alarm と異なり「連続リピート音」なし（gentle）
        content.sound = .default
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .active
        }

        // 即時（1秒後）に提示
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: keyNudgeMain(nudgeId: nudgeId),
            content: content,
            trigger: trigger
        )
        do {
            try await center.add(request)
        } catch {
            logger.error("Failed to schedule nudge notification: \(error.localizedDescription, privacy: .public)")
        }
    }

    func nudgeId(fromIdentifier identifier: String) -> String? {
        // NUDGE_MAIN_<nudgeId>
        let parts = identifier.split(separator: "_")
        guard parts.count >= 3, parts[0] == "NUDGE", parts[1] == "MAIN" else { return nil }
        return String(parts[2])
    }

    private func keyNudgeMain(nudgeId: String) -> String {
        "NUDGE_MAIN_\(nudgeId)"
    }
    
    // MARK: - Pre-Reminder Scheduling (Personalized)
    
    // MARK: - Pre-Reminder Message Fetching
    
    /// サーバーからパーソナライズされた事前通知メッセージを取得
    private func fetchPreReminderMessage(
        habitType: HabitType,
        scheduledTime: String,
        habitName: String?
    ) async -> String? {
        let baseURL = AppConfig.proxyBaseURL
        let url = baseURL.appendingPathComponent("mobile/nudge/pre-reminder")
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // 認証ヘッダーを追加
        if let deviceId = UIDevice.current.identifierForVendor?.uuidString {
            request.setValue(deviceId, forHTTPHeaderField: "device-id")
        }
        if case .signedIn(let credentials) = AppState.shared.authStatus {
            request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        }
        
        request.timeoutInterval = 10
        
        var body: [String: Any] = [
            "habitType": habitType.rawValue,
            "scheduledTime": scheduledTime
        ]
        if let habitName = habitName {
            body["habitName"] = habitName
        }
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                logger.warning("Non-2xx response from pre-reminder endpoint")
                return nil
            }
            
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let message = json["message"] as? String, !message.isEmpty else {
                logger.warning("Empty or invalid message in response")
                return nil
            }
            
            logger.info("Fetched personalized pre-reminder: \(message.prefix(30))...")
            return message
            
        } catch {
            logger.error("Failed to fetch pre-reminder message: \(error.localizedDescription)")
            return nil
        }
    }
    
    /// 各習慣タイプの事前通知タイミング（分）
    private enum PreReminderTiming {
        static let bedtime = 15    // 就寝15分前
        static let training = 15   // トレーニング15分前
        static let custom = 15     // カスタム習慣15分前
        static let wake = 5        // 起床5分前
    }
    
    /// 習慣の事前通知をスケジュール
    /// - Parameters:
    ///   - habit: 習慣タイプ
    ///   - hour: 設定時刻（時）
    ///   - minute: 設定時刻（分）
    ///   - habitName: カスタム習慣の場合の名前（オプション）
    ///   - customHabitId: カスタム習慣のUUID（オプション）
    func schedulePreReminder(
        habit: HabitType,
        hour: Int,
        minute: Int,
        habitName: String? = nil,
        customHabitId: UUID? = nil
    ) async {
        let offsetMinutes: Int
        switch habit {
        case .bedtime:
            offsetMinutes = PreReminderTiming.bedtime
        case .training:
            offsetMinutes = PreReminderTiming.training
        case .custom:
            offsetMinutes = PreReminderTiming.custom
        case .wake:
            offsetMinutes = PreReminderTiming.wake  // 5分前の事前通知を追加
        }
        
        // 事前通知の時刻を計算
        let (preHour, preMinute) = calculateOffsetTime(
            baseHour: hour,
            baseMinute: minute,
            offsetMinutes: -offsetMinutes
        )
        
        // ★ サーバーからパーソナライズメッセージを取得（フォールバック付き）
        let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
        let message = await fetchPreReminderMessage(
            habitType: habit,
            scheduledTime: scheduledTimeStr,
            habitName: habitName
        ) ?? defaultPreReminderBody(for: habit, habitName: habitName)
        
        let content = UNMutableNotificationContent()
        content.title = "Anicca"
        content.body = message  // ★ パーソナライズ済みメッセージ
        content.categoryIdentifier = Category.preReminder.rawValue
        
        // Notification Service Extension 用のフラグ
        content.userInfo = [
            "habitType": habit.rawValue,
            "scheduledTime": String(format: "%02d:%02d", hour, minute),
            "habitName": habitName ?? "",
            "customHabitId": customHabitId?.uuidString ?? ""
        ]
        
        // ★ 注意: ローカル通知では Notification Service Extension は呼ばれない
        // mutable-content はリモート通知（APNs）専用のフラグ
        // ローカル通知では userInfo に情報を設定するだけで十分
        
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }
        content.sound = .default
        
        // 毎日繰り返し
        var dateComponents = DateComponents()
        dateComponents.hour = preHour
        dateComponents.minute = preMinute
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        
        let identifier: String
        if let customId = customHabitId {
            identifier = "PRE_REMINDER_CUSTOM_\(customId.uuidString)"
        } else {
            identifier = "PRE_REMINDER_\(habit.rawValue)"
        }
        
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        
        do {
            try await center.add(request)
            logger.info("Scheduled pre-reminder for \(habit.rawValue) at \(preHour):\(preMinute)")
        } catch {
            logger.error("Failed to schedule pre-reminder: \(error.localizedDescription)")
        }
    }
    
    /// カスタム習慣の事前通知をスケジュール（15分前）
    private func scheduleCustomPreReminder(id: UUID, name: String, hour: Int, minute: Int) async {
        let minutesBefore = 15 // カスタム習慣は一律15分前
        let (preHour, preMinute) = calculateOffsetTime(baseHour: hour, baseMinute: minute, offsetMinutes: -minutesBefore)
        
        // ★ サーバーからパーソナライズメッセージを取得（フォールバック付き）
        let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
        let message = await fetchPreReminderMessage(
            habitType: .custom,
            scheduledTime: scheduledTimeStr,
            habitName: name
        ) ?? String(format: localizedString("pre_reminder_custom_body_format"), minutesBefore, name)
        
        let content = UNMutableNotificationContent()
        content.title = "Anicca"
        content.body = message  // ★ パーソナライズ済みメッセージ
        content.categoryIdentifier = Category.preReminder.rawValue
        // ★ 注意: mutableContent はリモート通知（APNs）専用のフラグ
        // ローカル通知では userInfo に情報を設定するだけで十分
        content.userInfo = [
            "customHabitId": id.uuidString,
            "habitType": "custom",
            "type": "pre_reminder",
            "scheduledTime": scheduledTimeStr,
            "habitName": name,
            "minutesBefore": minutesBefore
        ]
        content.sound = .default
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .active
        }
        
        var dateComponents = DateComponents()
        dateComponents.hour = preHour
        dateComponents.minute = preMinute
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        
        let request = UNNotificationRequest(
            identifier: "PRE_REMINDER_CUSTOM_\(id.uuidString)_\(preHour)_\(preMinute)",
            content: content,
            trigger: trigger
        )
        
        do {
            try await center.add(request)
            logger.info("Scheduled custom pre-reminder for \(id.uuidString) at \(preHour):\(preMinute)")
        } catch {
            logger.error("Failed to schedule custom pre-reminder: \(error.localizedDescription)")
        }
    }
    
    /// 事前通知をキャンセル
    func cancelPreReminder(for habit: HabitType, customHabitId: UUID? = nil) {
        Task {
            if let customId = customHabitId {
                await removePending(withPrefix: "PRE_REMINDER_CUSTOM_\(customId.uuidString)")
            } else {
                await removePending(withPrefix: "PRE_REMINDER_\(habit.rawValue)")
            }
        }
    }
    
    /// 全ての事前通知をキャンセル
    func cancelAllPreReminders() async {
        await removePending(withPrefix: "PRE_REMINDER_")
    }
    
    // MARK: - Private Helpers
    
    private func calculateOffsetTime(baseHour: Int, baseMinute: Int, offsetMinutes: Int) -> (hour: Int, minute: Int) {
        var totalMinutes = baseHour * 60 + baseMinute + offsetMinutes
        
        // 日をまたぐ場合の処理
        if totalMinutes < 0 {
            totalMinutes += 24 * 60
        } else if totalMinutes >= 24 * 60 {
            totalMinutes -= 24 * 60
        }
        
        return (totalMinutes / 60, totalMinutes % 60)
    }
    
    private func defaultPreReminderBody(for habit: HabitType, habitName: String?) -> String {
        let language = AppState.shared.userProfile.preferredLanguage
        
        switch habit {
        case .bedtime:
            return language == .ja
                ? "そろそろ寝る準備を始めましょう。"
                : "Time to start winding down for bed."
        case .training:
            return language == .ja
                ? "トレーニングの時間が近づいています。"
                : "Your training time is coming up."
        case .custom:
            let name = habitName ?? (language == .ja ? "習慣" : "your habit")
            return language == .ja
                ? "\(name)の時間が近づいています。"
                : "Time for \(name) is approaching."
        case .wake:
            return language == .ja
                ? "おはようございます。"
                : "Good morning."
        }
    }
    
    // MARK: - Daily Pre-Reminder Refresh
    
    private let lastRefreshKey = "com.anicca.preReminder.lastRefresh"
    
    /// アプリ起動時に事前通知を更新（24時間ごと）
    /// これにより毎日違うパーソナライズメッセージが表示される
    func refreshPreRemindersIfNeeded() async {
        let lastRefresh = UserDefaults.standard.double(forKey: lastRefreshKey)
        let now = Date().timeIntervalSince1970
        
        // 24時間経過していなければスキップ
        guard now - lastRefresh >= 86400 else {
            logger.debug("Pre-reminder refresh skipped (last refresh within 24h)")
            return
        }
        
        logger.info("Refreshing pre-reminders with new personalized messages")
        
        // 現在の習慣スケジュールを再登録
        let schedules = AppState.shared.habitSchedules
        await cancelAllPreReminders()
        
        for (habit, components) in schedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            await schedulePreReminder(habit: habit, hour: hour, minute: minute)
        }
        
        UserDefaults.standard.set(now, forKey: lastRefreshKey)
        logger.info("Pre-reminder refresh completed")
    }
    
    // MARK: - Helper Functions
    
    private func formattedLocalized(_ key: String, _ value: String) -> String {
        let template = localizedString(key)
        guard template.contains("%@") else { return template }
        return String(format: template, value)
    }

    private func nextDate(hour: Int, minute: Int) -> Date? {
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        components.second = 0
        return Calendar.current.nextDate(
            after: Date(),
            matching: components,
            matchingPolicy: .nextTimePreservingSmallerComponents,
            direction: .forward
        )
    }
}

