// v1.6.1 — ATT Implementation
import UIKit
import UserNotifications
import OSLog
import BackgroundTasks
import AppTrackingTransparency

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    
    // launchOptionsを保持（ATT後のSingular初期化に使用）
    private var storedLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
    private var singularInitialized = false

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

        // launchOptionsを保持（ATT後のSingular初期化に使用）
        storedLaunchOptions = launchOptions

        UNUserNotificationCenter.current().delegate = self
        NotificationScheduler.shared.registerCategories()
        SubscriptionManager.shared.configure()
        
        // Mixpanelは常に初期化（ファーストパーティAnalytics、IDFAを使用しない）
        AnalyticsManager.shared.configure()
        
        // ATT完了通知を購読
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleATTCompleted(_:)),
            name: .attAuthorizationCompleted,
            object: nil
        )
        
        // ATTステータスを確認し、SingularはATT許可後のみ初期化
        if #available(iOS 14.5, *) {
            let status = ATTrackingManager.trackingAuthorizationStatus
            if status == .authorized {
                initializeSingular()
            }
            // status == .notDetermined → オンボーディングで許可を取得してから初期化
            // status == .denied/.restricted → Singularは初期化しない
        } else {
            // iOS 14.5未満 → ATT不要、即座にSingular初期化
            initializeSingular()
        }

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
    
    @objc private func handleATTCompleted(_ notification: Notification) {
        guard let statusRaw = notification.userInfo?["status"] as? UInt,
              let status = ATTrackingManager.AuthorizationStatus(rawValue: statusRaw) else {
            return
        }
        
        if status == .authorized {
            initializeSingular()
        }
        // ATT非許可時はSingularを初期化しない（Mixpanelは既に初期化済み）
    }
    
    private func initializeSingular() {
        guard !singularInitialized else { return }
        singularInitialized = true
        
        // storedLaunchOptionsを使用してアトリビューション/ディープリンク情報を保持
        SingularManager.shared.configure(launchOptions: storedLaunchOptions)
        SingularManager.shared.trackAppLaunch()
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
