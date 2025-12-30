import Foundation
import OSLog

enum HabitLaunchBridge {
    static let notificationName = "com.anicca.habit.launch" as CFString
    private static let logger = Logger(subsystem: "com.anicca.ios", category: "HabitLaunchBridge")
    private static var observerRegistered = false
    private static var handler: (() -> Void)?
    private static let notificationCallback: CFNotificationCallback = { _, _, _, _, _ in
        HabitLaunchBridge.handleNotification()
    }

    static func postFromExtension(habitRawValue: String, customHabitId: String? = nil) {
        let defaults = AppGroup.userDefaults
        var queue = defaults.array(forKey: "pending_habit_launch_queue") as? [[String: Any]] ?? []
        var entry: [String: Any] = [
            "habit": habitRawValue,
            "ts": Date().timeIntervalSince1970
        ]
        if let customId = customHabitId {
            entry["customHabitId"] = customId
        }
        queue.append(entry)
        defaults.set(queue, forKey: "pending_habit_launch_queue")
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(notificationName),
            nil,
            nil,
            true
        )
    }

    static func startObserver(callback: @escaping () -> Void) {
        handler = callback
        guard !observerRegistered else { return }
        observerRegistered = true
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil,
            notificationCallback,
            notificationName,
            nil,
            .deliverImmediately
        )
        logger.info("HabitLaunchBridge observer attached")
    }

    private static func handleNotification() {
        guard let handler else { return }
        Task { @MainActor in handler() }
    }
}

