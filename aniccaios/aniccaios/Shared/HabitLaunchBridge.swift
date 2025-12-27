import Foundation
import OSLog

enum HabitLaunchBridge {
    static let notificationName = "com.anicca.habit.launch" as CFString
    private static let logger = Logger(subsystem: "com.anicca.ios", category: "HabitLaunchBridge")

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
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil,
            { _, _, _, _, _ in callback() },
            notificationName,
            nil,
            .deliverImmediately
        )
        logger.info("HabitLaunchBridge observer attached")
    }
}

