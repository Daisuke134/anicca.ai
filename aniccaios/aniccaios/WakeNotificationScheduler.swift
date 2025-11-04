import Foundation
import UserNotifications

final class WakeNotificationScheduler {
    static let shared = WakeNotificationScheduler()

    private let center = UNUserNotificationCenter.current()
    private let requestIdentifier = "wake.alarm"

    private init() {}

    func registerCategories() {
        let action = UNNotificationAction(
            identifier: "start_conversation",
            title: "Start Conversation",
            options: [.foreground]
        )
        let category = UNNotificationCategory(
            identifier: requestIdentifier,
            actions: [action],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
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
}
