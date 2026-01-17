import UIKit
import UserNotifications
import OSLog
import BackgroundTasks

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private let habitLaunchLogger = Logger(subsystem: "com.anicca.ios", category: "HabitLaunch")
    override init() {
        super.init()
        HabitLaunchBridge.startObserver { [weak self] in
            Task { await self?.consumePendingHabitLaunch(retry: true) }
        }
    }
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
        // Jake Mor #51: キーワード別の課金率を追跡するため、attributionを先に取得
        Task {
            await ASAAttributionManager.shared.fetchAttributionIfNeeded()
            AnalyticsManager.shared.track(.appOpened)
        }
        
        // Phase-7: register BGTask handlers (must complete before launch ends).
        // See Apple docs: BGTaskScheduler.register(...) must finish before end of launch.
        // NOTE: Requires Info.plist BGTaskSchedulerPermittedIdentifiers entry (done in phase-9 / Info.plist).
        MetricsUploader.shared.registerBGTask()
        
        Task {
            // オンボーディング完了済みの場合のみ、通知許可の状態を確認
            // オンボーディング未完了の場合は、NotificationPermissionStepViewでユーザーがボタンを押したときにのみリクエストする
            if AppState.shared.isOnboardingComplete {
                // 既存のAlarmKitアラームを全てキャンセル（古い設定を無効化）
                #if canImport(AlarmKit)
                if #available(iOS 26.0, *) {
                    await AlarmKitHabitCoordinator.shared.cancelAllAlarms()
                }
                #endif
                
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

    func applicationDidBecomeActive(_ application: UIApplication) {
        Task {
            // AlarmKit / LiveActivityIntent からの「起動して会話開始」要求を回収
            // （IntentプロセスでAppStateを書いてもアプリ本体に反映されないケースがあるため）
            await consumePendingHabitLaunch(retry: true)
            await SensorAccessSyncService.shared.fetchLatest()
            await AppState.shared.refreshSensorAccessAuthorizations(
                forceReauthIfNeeded: AppState.shared.isOnboardingComplete
            )
            await AppState.shared.scheduleSensorRepairIfNeeded(source: .foreground)

            // ★ 事前通知のパーソナライズメッセージを更新（24時間ごと）
            await NotificationScheduler.shared.refreshPreRemindersIfNeeded()
        }
    }
    
    private func consumePendingHabitLaunch(retry: Bool = false) async {
        let appGroupDefaults = AppGroup.userDefaults
        guard let entry = (appGroupDefaults.array(forKey: "pending_habit_launch_queue") as? [[String: Any]])?.first,
              let rawHabit = entry["habit"] as? String,
              let habit = HabitType(rawValue: rawHabit) else { return }
        
        // ★ カスタム習慣IDを取得
        let customHabitId = (entry["customHabitId"] as? String).flatMap { UUID(uuidString: $0) }
        
        var queue = appGroupDefaults.array(forKey: "pending_habit_launch_queue") as? [[String: Any]] ?? []
        queue.removeFirst()
        appGroupDefaults.set(queue, forKey: "pending_habit_launch_queue")
        
        do {
            try AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
        } catch {
            habitLaunchLogger.error("Audio session configure failed: \(error.localizedDescription, privacy: .public)")
        }
        await MainActor.run {
            // ★ customHabitId を渡す
            AppState.shared.prepareForImmediateSession(habit: habit, customHabitId: customHabitId)
        }
        
        if retry && !queue.isEmpty {
            Task { await consumePendingHabitLaunch(retry: false) }
        }
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
                // 通知タップ → NudgeCardView表示
                if let nudgeContent = ProblemNotificationScheduler.nudgeContent(from: content.userInfo) {
                    Task { @MainActor in
                        AppState.shared.showNudgeCard(nudgeContent)
                    }
                }
            case NotificationScheduler.Action.dismissAll.rawValue,
                 UNNotificationDismissActionIdentifier:
                // 無視
                break
            default:
                break
            }
            return
        }

        // 1) Habit alarm（既存）
        if let habit = NotificationScheduler.shared.habit(fromIdentifier: notificationIdentifier) {
            let customHabitId = NotificationScheduler.shared.customHabitId(fromIdentifier: notificationIdentifier)
            switch identifier {
            case NotificationScheduler.Action.startConversation.rawValue,
                 UNNotificationDefaultActionIdentifier:
                handleHabitLaunch(notificationId: notificationIdentifier, habit: habit, customHabitId: customHabitId)
            case NotificationScheduler.Action.dismissAll.rawValue:
                NotificationScheduler.shared.cancelFollowups(for: habit)
                if let customId = customHabitId {
                    NotificationScheduler.shared.cancelCustomFollowups(id: customId)
                }
            default:
                break
            }
            return
        }

        if content.categoryIdentifier == NotificationScheduler.Category.preReminder.rawValue,
           let (habit, customHabitId) = habitContext(from: content.userInfo) {
            switch identifier {
            case NotificationScheduler.Action.startConversation.rawValue,
                 UNNotificationDefaultActionIdentifier:
                NotificationScheduler.shared.cancelPreReminder(for: habit, customHabitId: customHabitId)
                handleHabitLaunch(notificationId: notificationIdentifier, habit: habit, customHabitId: customHabitId)
            case NotificationScheduler.Action.dismissAll.rawValue:
                NotificationScheduler.shared.cancelPreReminder(for: habit, customHabitId: customHabitId)
            default:
                break
            }
            return
        }

        // 2) Nudge（既存サーバー駆動型）
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

    private func handleHabitLaunch(notificationId: String, habit: HabitType, customHabitId: UUID?) {
        NotificationScheduler.shared.cancelFollowups(for: habit)
        if let customId = customHabitId {
            NotificationScheduler.shared.cancelCustomFollowups(id: customId)
        }
        Task {
            habitLaunchLogger.info("Notification accepted for habit \(habit.rawValue, privacy: .public) id=\(notificationId, privacy: .public)")
            do {
                try AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
                habitLaunchLogger.info("Audio session configured for realtime")
            } catch {
                habitLaunchLogger.error("Audio session configure failed: \(error.localizedDescription, privacy: .public)")
            }
            await MainActor.run {
                AppState.shared.selectedRootTab = .habits
                AppState.shared.prepareForImmediateSession(habit: habit, customHabitId: customHabitId)
                habitLaunchLogger.info("AppState prepared immediate session for habit \(habit.rawValue, privacy: .public)")
            }
        }
    }

    private func habitContext(from userInfo: [AnyHashable: Any]) -> (HabitType, UUID?)? {
        guard let rawHabit = userInfo["habitType"] as? String else { return nil }
        let habit: HabitType
        if let parsed = HabitType(rawValue: rawHabit) {
            habit = parsed
        } else if rawHabit == "custom" {
            habit = .custom
        } else {
            return nil
        }
        let customHabitId = (userInfo["customHabitId"] as? String).flatMap(UUID.init(uuidString:))
        return (habit, customHabitId)
    }
}
