import Foundation
import UserNotifications
import OSLog

final class NotificationScheduler {
    static let shared = NotificationScheduler()

    enum Category: String {
        case habitAlarm = "HABIT_ALARM"
    }

    enum Action: String {
        case startConversation = "START_CONVERSATION"
        case dismissAll = "DISMISS_ALL"
    }

    private let center = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "NotificationScheduler")
    
    private enum AlarmLoop {
        /// 8秒サウンド + 2秒休止 = 10秒ごとに再通知
        static let intervalSeconds = 10
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
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
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

        center.setNotificationCategories([category])
    }

    // MARK: Scheduling
    func applySchedules(_ schedules: [HabitType: DateComponents]) async {
        await removePending(withPrefix: "HABIT_")
        for (habit, components) in schedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            await scheduleMain(habit: habit, hour: hour, minute: minute)
            scheduleFollowupLoop(for: habit, baseComponents: components)
        }
    }

    func cancelHabit(_ habit: HabitType) {
        Task {
            await removePending(withPrefix: mainPrefix(for: habit))
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
        }
    }

    func cancelAll() async {
        await removePending(withPrefix: "HABIT_")
        await removeDelivered(withPrefix: "HABIT_")
    }

    func cancelFollowups(for habit: HabitType) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
        }
    }

    func cancelAllFollowups() {
        Task {
            await removePending(withPrefix: "HABIT_FOLLOW_")
            await removeDelivered(withPrefix: "HABIT_FOLLOW_")
        }
    }

    func habit(fromIdentifier identifier: String) -> HabitType? {
        let parts = identifier.split(separator: "_")
        guard parts.count >= 3, parts[0] == "HABIT" else { return nil }
        return HabitType(rawValue: String(parts[2]))
    }

    // MARK: Private helpers
    private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
        let triggerComponents = DateComponents(hour: hour, minute: minute, second: 0)
        let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: keyMain(for: habit, hour: hour, minute: minute),
            content: baseContent(for: habit, isFollowup: false),
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled main notification for \(habit.rawValue, privacy: .public) at \(hour):\(minute)")
        } catch {
            logger.error("Failed to schedule main notification: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// メイン通知の 0 秒起点から 10 秒間隔で AppState 設定回数ぶんのフォローアップを登録
    private func scheduleFollowupLoop(for habit: HabitType, baseComponents: DateComponents) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            guard let firstFireDate = nextFireDate(from: baseComponents) else { return }

            for index in 1...repeatCount(for: habit) {
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
                    content: baseContent(for: habit, isFollowup: true),
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

    private func baseContent(for habit: HabitType, isFollowup: Bool) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = isFollowup ? followupTitle(for: habit) : habit.title
        content.body = isFollowup ? followupBody(for: habit) : primaryBody(for: habit)
        content.categoryIdentifier = Category.habitAlarm.rawValue
        content.interruptionLevel = .timeSensitive
        content.sound = wakeSound()  // フォローアップでも必ず 8 秒サウンド
        return content
    }

    private func wakeSound() -> UNNotificationSound {
        if Bundle.main.url(forResource: "AniccaWake", withExtension: "caf") != nil {
            return UNNotificationSound(named: UNNotificationSoundName("AniccaWake.caf"))
        }
        logger.error("Wake sound missing in bundle; falling back to default alert")
        return .default
    }

    private func primaryBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_body")
        case .training:
            return localizedString("notification_training_body")
        case .bedtime:
            return localizedString("notification_bedtime_body")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_body_format"), name)
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

    private func followupBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_followup_body")
        case .training:
            return localizedString("notification_training_followup_body")
        case .bedtime:
            return localizedString("notification_bedtime_followup_body")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_followup_body_format"), name)
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

    private func keyMain(for habit: HabitType, hour: Int, minute: Int) -> String {
        "HABIT_MAIN_\(habit.rawValue)_\(hour)_\(minute)"
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
    
    // MARK: - Custom Habit (UUID) support
    func applyCustomSchedules(_ schedules: [UUID: (name: String, time: DateComponents)]) async {
        // いったん全カスタムの pending/delivered を掃除（簡易実装）
        await removePending(withPrefix: "HABIT_CUSTOM_MAIN_")
        await removePending(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        await removeDelivered(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        for (id, entry) in schedules {
            await scheduleCustomMain(id: id, name: entry.name, time: entry.time)
            scheduleCustomFollowups(id: id, name: entry.name, baseComponents: entry.time)
        }
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
                    content: customBaseContent(name: name, isFollowup: true),
                    trigger: trig
                )
                try? await center.add(req)
            }
        }
    }
    
    private func customBaseContent(name: String, isFollowup: Bool) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = isFollowup ? String(format: localizedString("notification_custom_followup_title_format"), name) : name
        c.body  = isFollowup ? String(format: localizedString("notification_custom_followup_body_format"), name) : String(format: localizedString("notification_custom_body_format"), name)
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
}

