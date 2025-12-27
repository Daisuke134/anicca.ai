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

    static func postFromExtension(habitRawValue: String) {
        let defaults = AppGroup.userDefaults
        defaults.set(habitRawValue, forKey: "pending_habit_launch_habit")
        defaults.set(Date().timeIntervalSince1970, forKey: "pending_habit_launch_ts")
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
        handler?()
    }
}

