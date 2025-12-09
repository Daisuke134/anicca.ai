import UIKit
import UserNotifications
import OSLog

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private let habitLaunchLogger = Logger(subsystem: "com.anicca.ios", category: "HabitLaunch")
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let proxy = Bundle.main.object(forInfoDictionaryKey: "ANICCA_PROXY_BASE_URL") as? String ?? "nil"
        print("ANICCA_PROXY_BASE_URL =", proxy)
        
        let resetFlag = (Bundle.main.object(forInfoDictionaryKey: "RESET_ON_LAUNCH") as? NSString)?.boolValue == true
        let shouldReset = resetFlag || ProcessInfo.processInfo.arguments.contains("-resetOnLaunch")
        if shouldReset {
            UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier ?? "")
            UserDefaults.standard.synchronize()
            AppState.shared.resetState()
        }
        
        UNUserNotificationCenter.current().delegate = self
        NotificationScheduler.shared.registerCategories()
        SubscriptionManager.shared.configure()
        Task {
            // オンボーディング完了済みの場合のみ、通知許可の状態を確認
            // オンボーディング未完了の場合は、NotificationPermissionStepViewでユーザーがボタンを押したときにのみリクエストする
            if AppState.shared.isOnboardingComplete {
                // 既に許可されている場合は何もしない（requestAuthorizationIfNeededは.notDeterminedの場合のみリクエストする）
            _ = await NotificationScheduler.shared.requestAuthorizationIfNeeded()
            }
            await SubscriptionManager.shared.refreshOfferings()
            await AuthHealthCheck.shared.warmBackend()
        }
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
        
        guard let habit = NotificationScheduler.shared.habit(fromIdentifier: notificationIdentifier) else { return }
        let customHabitId = NotificationScheduler.shared.customHabitId(fromIdentifier: notificationIdentifier)

        switch identifier {
        case NotificationScheduler.Action.startConversation.rawValue,
             UNNotificationDefaultActionIdentifier:
            NotificationScheduler.shared.cancelFollowups(for: habit)
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
        case NotificationScheduler.Action.dismissAll.rawValue:
            NotificationScheduler.shared.cancelFollowups(for: habit)
        default:
            break
        }
    }
}
