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
    private init() {}

    // MARK: Authorization
    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge, .timeSensitive])
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
            title: "今すぐ対話を開始",
            options: [.foreground]
        )

        let dismiss = UNNotificationAction(
            identifier: Action.dismissAll.rawValue,
            title: "止める",
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
            scheduleFollowups(for: habit, baseComponents: components)
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

    private func scheduleFollowups(for habit: HabitType, baseComponents: DateComponents, count: Int = 10, intervalSeconds: Int = 60) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            guard count > 0, let first = nextFireDate(from: baseComponents) else { return }
            for index in 1...count {
                guard let fireDate = Calendar.current.date(byAdding: .second, value: intervalSeconds * index, to: first) else { continue }
                let triggerComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
                let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: false)
                let request = UNNotificationRequest(
                    identifier: keyFollow(for: habit, timestamp: Int(fireDate.timeIntervalSince1970)),
                    content: baseContent(for: habit, isFollowup: true),
                    trigger: trigger
                )

                center.add(request) { error in
                    if let error {
                        self.logger.error("Follow-up scheduling error: \(error.localizedDescription, privacy: .public)")
                    }
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
        content.sound = wakeSound()
        return content
    }

    private func wakeSound() -> UNNotificationSound {
        if Bundle.main.url(forResource: "AniccaWake", withExtension: "caf") != nil {
            return UNNotificationSound(named: UNNotificationSoundName(rawValue: "AniccaWake.caf"))
        }
        logger.error("Wake sound missing in bundle; falling back to default alert")
        return .default
    }

    private func primaryBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return "Aniccaが起床を促します。"
        case .training:
            return "筋トレの時間です。一緒に始めましょう。"
        case .bedtime:
            return "就寝準備を始めましょう。深い眠りを作ります。"
        }
    }

    private func followupTitle(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return "起床（再通知）"
        case .training:
            return "筋トレ（再通知）"
        case .bedtime:
            return "就寝（再通知）"
        }
    }

    private func followupBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return "そろそろ起きましょう。深呼吸からスタートです。"
        case .training:
            return "体を動かす準備はできています。フォームを意識していきましょう。"
        case .bedtime:
            return "今日一日の疲れを手放しましょう。リラックスして眠りに入ります。"
        }
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
}

