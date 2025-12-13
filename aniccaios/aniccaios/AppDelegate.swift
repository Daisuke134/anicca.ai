import UIKit
import UserNotifications
import OSLog
import BackgroundTasks

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
        
        // Phase-7: register BGTask handlers (must complete before launch ends).
        // See Apple docs: BGTaskScheduler.register(...) must finish before end of launch.
        // NOTE: Requires Info.plist BGTaskSchedulerPermittedIdentifiers entry (done in phase-9 / Info.plist).
        _ = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: MetricsUploader.taskId,
            using: nil
        ) { task in
            // task.expirationHandler = { ... }
            Task { @MainActor in
                await MetricsUploader.shared.runUploadIfDue()
                // task.setTaskCompleted(success: true)
                MetricsUploader.shared.scheduleNextIfPossible()
            }
        }
        
        Task {
            // オンボーディング完了済みの場合のみ、通知許可の状態を確認
            // オンボーディング未完了の場合は、NotificationPermissionStepViewでユーザーがボタンを押したときにのみリクエストする
            if AppState.shared.isOnboardingComplete {
                // 既に許可されている場合は何もしない（requestAuthorizationIfNeededは.notDeterminedの場合のみリクエストする）
            _ = await NotificationScheduler.shared.requestAuthorizationIfNeeded()
                // Phase-7: Configure HealthKit observers if user already enabled + authorized.
                HealthKitManager.shared.configureOnLaunchIfEnabled()
                // Phase-7: Schedule daily metrics upload best-effort.
                MetricsUploader.shared.scheduleNextIfPossible()
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
        
        // 1) Habit alarm（既存）
        if let habit = NotificationScheduler.shared.habit(fromIdentifier: notificationIdentifier) {
            let customHabitId = NotificationScheduler.shared.customHabitId(fromIdentifier: notificationIdentifier)

            switch identifier {
            case NotificationScheduler.Action.startConversation.rawValue,
                 UNNotificationDefaultActionIdentifier:
                // ユーザーが通知から会話に入ったので、その習慣の後続フォローアップはすべてキャンセル
                NotificationScheduler.shared.cancelFollowups(for: habit)
                if let customId = customHabitId {
                    NotificationScheduler.shared.cancelCustomFollowups(id: customId)
                }
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
                // 「止める」アクション時も、その習慣の後続フォローアップを完全にキャンセル
                NotificationScheduler.shared.cancelFollowups(for: habit)
                if let customId = customHabitId {
                    NotificationScheduler.shared.cancelCustomFollowups(id: customId)
                }
            default:
                break
            }
            return
        }

        // 2) Nudge（新規）
        if let nudgeId = NotificationScheduler.shared.nudgeId(fromIdentifier: notificationIdentifier) {
            Task {
                switch identifier {
                case UNNotificationDismissActionIdentifier:
                    await NudgeTriggerService.shared.recordDismissed(nudgeId: nudgeId)
                case NotificationScheduler.Action.dismissAll.rawValue:
                    await NudgeTriggerService.shared.recordDismissed(nudgeId: nudgeId)
                case NotificationScheduler.Action.startConversation.rawValue,
                     UNNotificationDefaultActionIdentifier:
                    await NudgeTriggerService.shared.recordOpened(nudgeId: nudgeId, actionIdentifier: identifier)
                default:
                    break
                }
            }
        }
    }
}
