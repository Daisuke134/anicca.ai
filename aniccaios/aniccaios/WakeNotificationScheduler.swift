import Foundation
import UserNotifications

final class WakeNotificationScheduler {
    static let shared = WakeNotificationScheduler()

    private let center = UNUserNotificationCenter.current()
    private let requestIdentifier = "wake.alarm"

    private init() {}

    func registerCategories() {
        var categories: [UNNotificationCategory] = []
        
        // Register category for each habit type
        for habit in HabitType.allCases {
            let action = UNNotificationAction(
                identifier: "start_conversation",
                title: "Start Conversation",
                options: [.foreground]
            )
            let category = UNNotificationCategory(
                identifier: habit.notificationIdentifier,
                actions: [action],
                intentIdentifiers: [],
                options: []
            )
            categories.append(category)
        }
        
        // Also register legacy category for backward compatibility
        let legacyAction = UNNotificationAction(
            identifier: "start_conversation",
            title: "Start Conversation",
            options: [.foreground]
        )
        let legacyCategory = UNNotificationCategory(
            identifier: requestIdentifier,
            actions: [legacyAction],
            intentIdentifiers: [],
            options: []
        )
        categories.append(legacyCategory)
        
        center.setNotificationCategories(Set(categories))
    }

    func requestAuthorization() async -> Bool {
        do {
            let options: UNAuthorizationOptions = [.alert, .sound, .badge]
            return try await center.requestAuthorization(options: options)
        } catch {
            return false
        }
    }

    func scheduleWakeNotification(for components: DateComponents) async {
        await cancelWakeNotification()

        let content = UNMutableNotificationContent()
        content.title = "Wake-Up Call"
        content.body = "Tap to talk with Anicca."
        content.categoryIdentifier = requestIdentifier
        content.sound = UNNotificationSound.default

        var triggerComponents = components
        triggerComponents.second = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: true)

        let request = UNNotificationRequest(identifier: requestIdentifier, content: content, trigger: trigger)
        do {
            try await center.add(request)
        } catch {
            // 失敗時はログ出力のみ。ここでは処理継続。
            NSLog("Failed to schedule wake notification: %@", error.localizedDescription)
        }
    }

    func cancelWakeNotification() async {
        center.removePendingNotificationRequests(withIdentifiers: [requestIdentifier])
    }

    // New method for multiple habits
    func scheduleNotifications(for schedules: [HabitType: DateComponents]) async {
        // Cancel all existing habit notifications
        await cancelAllNotifications()
        
        // Schedule new notifications for each habit
        for (habit, components) in schedules {
            let content = UNMutableNotificationContent()
            content.title = habit.title
            content.body = "Tap to talk with Anicca about your \(habit.title.lowercased()) routine."
            content.categoryIdentifier = habit.notificationIdentifier
            content.sound = UNNotificationSound.default
            
            var triggerComponents = components
            triggerComponents.second = 0
            let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: true)
            
            let request = UNNotificationRequest(
                identifier: habit.notificationIdentifier,
                content: content,
                trigger: trigger
            )
            
            do {
                try await center.add(request)
            } catch {
                NSLog("Failed to schedule notification for \(habit.rawValue): %@", error.localizedDescription)
            }
        }
    }

    func cancelAllNotifications() async {
        var identifiers: [String] = [requestIdentifier] // Legacy
        for habit in HabitType.allCases {
            identifiers.append(habit.notificationIdentifier)
        }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}
