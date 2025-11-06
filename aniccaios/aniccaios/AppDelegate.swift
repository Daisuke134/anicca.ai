import UIKit
import UserNotifications
import AVFoundation

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let proxy = Bundle.main.object(forInfoDictionaryKey: "ANICCA_PROXY_BASE_URL") as? String ?? "nil"
        print("ANICCA_PROXY_BASE_URL =", proxy)
        
        if ProcessInfo.processInfo.arguments.contains("-resetOnLaunch") {
            UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier ?? "")
            UserDefaults.standard.synchronize()
            AppState.shared.resetState()
        }
        UNUserNotificationCenter.current().delegate = self
        WakeNotificationScheduler.shared.registerCategories()
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        defer { completionHandler() }

        let identifier = response.actionIdentifier
        let notificationIdentifier = response.notification.request.identifier
        
        // Check if this is a habit notification or legacy wake notification
        var habit: HabitType?
        if notificationIdentifier == "wake.alarm" {
            habit = .wake
        } else {
            // Try to find matching habit from notification identifier
            for h in HabitType.allCases {
                if notificationIdentifier == h.notificationIdentifier {
                    habit = h
                    break
                }
            }
        }
        
        if identifier == "start_conversation" || identifier == UNNotificationDefaultActionIdentifier, let habit = habit {
            Task {
                try? AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
                await MainActor.run {
                    AppState.shared.prepareForImmediateSession(habit: habit)
                }
            }
        }
    }
}
