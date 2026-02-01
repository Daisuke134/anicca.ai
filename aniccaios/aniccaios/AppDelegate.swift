// v1.6.0 — Phase 5 Learning Loop
import UIKit
import UserNotifications
import OSLog
import BackgroundTasks

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

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
        AnalyticsManager.shared.configure()
        SuperwallManager.shared.configure()
        SingularManager.shared.configure(launchOptions: launchOptions)
        SingularManager.shared.trackAppLaunch()

        // ASA Attribution取得 → app_opened トラック（この順序が重要）
        Task {
            await ASAAttributionManager.shared.fetchAttributionIfNeeded()
            AnalyticsManager.shared.track(.appOpened)
        }

        // Phase-7: register BGTask handlers
        Task {
            if AppState.shared.isOnboardingComplete {
                _ = await NotificationScheduler.shared.requestAuthorizationIfNeeded()
            }
            await SubscriptionManager.shared.refreshOfferings()
            await AuthHealthCheck.shared.warmBackend()
        }
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // no-op
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
        let content = response.notification.request.content

        // Proactive Agent: Problem Nudge通知のハンドリング
        if ProblemNotificationScheduler.isProblemNudge(identifier: notificationIdentifier) {
            switch identifier {
            case UNNotificationDefaultActionIdentifier,
                 NotificationScheduler.Action.startConversation.rawValue:
                if let nudgeContent = ProblemNotificationScheduler.nudgeContent(from: content.userInfo) {
                    // nudge_tapped を記録
                    let scheduledHour = content.userInfo["scheduledHour"] as? Int ?? 0
                    Task { @MainActor in
                        // NudgeStats に記録（isAIGeneratedとllmNudgeIdを含む）
                        NudgeStatsManager.shared.recordTapped(
                            problemType: nudgeContent.problemType.rawValue,
                            variantIndex: nudgeContent.variantIndex,
                            scheduledHour: scheduledHour,
                            isAIGenerated: nudgeContent.isAIGenerated,
                            llmNudgeId: nudgeContent.llmNudgeId
                        )

                        // Phase 7+8: hookFeedback "tapped" をサーバーに送信
                        if let nudgeId = nudgeContent.llmNudgeId {
                            Task {
                                do {
                                    try await NudgeFeedbackService.shared.handleNudgeTapped(nudgeId: nudgeId)
                                } catch {
                                    // エラーは無視（ユーザー体験を妨げない）
                                    print("Failed to send tapped feedback: \(error)")
                                }
                            }
                        }

                        // NudgeCard を表示
                        AppState.shared.showNudgeCard(nudgeContent)
                    }
                }
            case NotificationScheduler.Action.dismissAll.rawValue,
                 UNNotificationDismissActionIdentifier:
                break
            default:
                break
            }
            return
        }

        // Server-driven Nudge
        if let nudgeId = NotificationScheduler.shared.nudgeId(fromIdentifier: notificationIdentifier) {
            Task {
                switch identifier {
                case UNNotificationDismissActionIdentifier,
                     NotificationScheduler.Action.dismissAll.rawValue:
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
