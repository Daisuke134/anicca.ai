import Foundation
import UserNotifications
import OSLog
#if canImport(AlarmKit)
import AlarmKit
#endif

final class NotificationScheduler {
    static let shared = NotificationScheduler()

    enum Category: String {
        case habitAlarm = "HABIT_ALARM"
        case nudge = "NUDGE"
    }

    enum Action: String {
        case startConversation = "START_CONVERSATION"
        case dismissAll = "DISMISS_ALL"
    }

    private let center = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "NotificationScheduler")
    
    private enum AlarmLoop {
        /// 8秒サウンド + 2秒休止 = 10秒ごとに再通知
        static let intervalSeconds = 10
    }
    
    private func repeatCount(for habit: HabitType) -> Int {
        return AppState.shared.followupCount(for: habit)
    }
    
    private init() {}
    
    // MARK: - Localization Helper
    
    private func localizedString(_ key: String, comment: String = "") -> String {
        let language = AppState.shared.userProfile.preferredLanguage
        guard let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            // Fallback to system localization
            return NSLocalizedString(key, comment: comment)
        }
        return NSLocalizedString(key, tableName: nil, bundle: bundle, value: key, comment: comment)
    }

    // MARK: Authorization
    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            // .timeSensitive は iOS 15 以降で非推奨。テスト済みのエンタイトルメント
            // (com.apple.developer.usernotifications.time-sensitive) を利用する。
            let notificationsGranted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
#if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                _ = await AlarmKitHabitCoordinator.shared.requestAuthorizationIfNeeded()
            }
#endif
            return notificationsGranted
        } catch {
            logger.error("Notification authorization error: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    func requestAuthorizationIfNeeded() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            return await requestAuthorization()
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    func isAuthorizedForAlerts() async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    // MARK: Categories
    func registerCategories() {
        let start = UNNotificationAction(
            identifier: Action.startConversation.rawValue,
            title: localizedString("notification_action_start_conversation"),
            options: [.foreground]
        )

        let dismiss = UNNotificationAction(
            identifier: Action.dismissAll.rawValue,
            title: localizedString("notification_action_dismiss"),
            options: [.destructive]
        )

        let category = UNNotificationCategory(
            identifier: Category.habitAlarm.rawValue,
            actions: [start, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let nudgeCategory = UNNotificationCategory(
            identifier: Category.nudge.rawValue,
            actions: [start, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        center.setNotificationCategories([category, nudgeCategory])
    }

    // MARK: Scheduling
    func applySchedules(_ schedules: [HabitType: DateComponents]) async {
        await removePending(withPrefix: "HABIT_")
        for (habit, components) in schedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            
            // AlarmKitをスケジュール（iOS 26+ かつユーザーがONにしている場合）
            let alarmKitScheduled = await scheduleWithAlarmKitIfNeeded(habit: habit, hour: hour, minute: minute)
            
            // AlarmKitがOFFの場合のみ、通常のTime Sensitive通知をスケジュール
            // AlarmKitがONの場合、画面操作中でもDynamic Island/バナーでアラーム通知が表示される
            if !alarmKitScheduled {
                await scheduleMain(habit: habit, hour: hour, minute: minute)
                scheduleFollowupLoop(for: habit, baseComponents: components)
            }
            
            logger.info("Scheduled \(habit.rawValue, privacy: .public): AlarmKit=\(alarmKitScheduled, privacy: .public)")
        }
    }

    func cancelHabit(_ habit: HabitType) {
        Task {
            await removePending(withPrefix: mainPrefix(for: habit))
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
#if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
#endif
        }
    }

    func cancelAll() async {
        await removePending(withPrefix: "HABIT_")
        await removeDelivered(withPrefix: "HABIT_")
    }

    /// フォローアップ通知をキャンセル
    /// - Parameter habit: キャンセルする習慣タイプ
    /// - Parameter includeAlarmKit: AlarmKitアラームもキャンセルするかどうか（デフォルトtrue）
    func cancelFollowups(for habit: HabitType, includeAlarmKit: Bool = true) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            
#if canImport(AlarmKit)
            if #available(iOS 26.0, *), includeAlarmKit {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
#endif
        }
    }

    func cancelAllFollowups() {
        Task {
            await removePending(withPrefix: "HABIT_FOLLOW_")
            await removeDelivered(withPrefix: "HABIT_FOLLOW_")
        }
    }

    /// 特定のカスタム習慣(UUID)に紐づくフォローアップ通知のみをキャンセル
    func cancelCustomFollowups(id: UUID) {
        Task {
            await removePending(withPrefix: keyCustomFollowPrefix(id: id))
            await removeDelivered(withPrefix: keyCustomFollowPrefix(id: id))
        }
    }

    func habit(fromIdentifier identifier: String) -> HabitType? {
        let parts = identifier.split(separator: "_")
        guard parts.count >= 3, parts[0] == "HABIT" else { return nil }

        // カスタム習慣: HABIT_CUSTOM_MAIN_..., HABIT_CUSTOM_FOLLOW_... は .custom にマップ
        if parts.count >= 2, parts[1] == "CUSTOM" {
            return .custom
        }

        // デフォルト習慣: HABIT_MAIN_wake_..., HABIT_FOLLOW_bedtime_...
        return HabitType(rawValue: String(parts[2]))
    }

    /// カスタム習慣通知の識別子から UUID を抽出する
    /// 期待フォーマット:
    /// - HABIT_CUSTOM_MAIN_<UUID>_...
    /// - HABIT_CUSTOM_FOLLOW_<UUID>_...
    func customHabitId(fromIdentifier identifier: String) -> UUID? {
        let parts = identifier.split(separator: "_")
        guard parts.count >= 4,
              parts[0] == "HABIT",
              parts[1] == "CUSTOM" else { return nil }
        return UUID(uuidString: String(parts[3]))
    }

    // MARK: Private helpers
    private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
        let triggerComponents = DateComponents(hour: hour, minute: minute, second: 0)
        let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: true)
        let request = UNNotificationRequest(
            identifier: keyMain(for: habit, hour: hour, minute: minute),
            content: baseContent(for: habit, isFollowup: false),
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled main notification for \(habit.rawValue, privacy: .public) at \(hour):\(minute)")
        } catch {
            logger.error("Failed to schedule main notification: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// メイン通知の 0 秒起点から 10 秒間隔で AppState 設定回数ぶんのフォローアップを登録
    private func scheduleFollowupLoop(for habit: HabitType, baseComponents: DateComponents) {
        Task {
            await removePending(withPrefix: followPrefix(for: habit))
            await removeDelivered(withPrefix: followPrefix(for: habit))
            guard let firstFireDate = nextFireDate(from: baseComponents) else { return }

            let totalCount = repeatCount(for: habit)
            // メイン通知1回 + フォローアップ通知（totalCount - 1）回 = 合計totalCount回
            for index in 1..<totalCount {
                guard let fireDate = Calendar.current.date(
                    byAdding: .second,
                    value: index * AlarmLoop.intervalSeconds,
                    to: firstFireDate
                ) else { continue }

                let triggerComponents = Calendar.current.dateComponents(
                    [.year, .month, .day, .hour, .minute, .second],
                    from: fireDate
                )
                let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: false)
                let request = UNNotificationRequest(
                    identifier: keyFollow(for: habit, timestamp: Int(fireDate.timeIntervalSince1970)),
                    content: baseContent(for: habit, isFollowup: true),
                    trigger: trigger
                )

                do {
                    try await center.add(request)
                } catch {
                    logger.error("Follow-up scheduling error: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func baseContent(for habit: HabitType, isFollowup: Bool) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = isFollowup ? followupTitle(for: habit) : habit.title
        content.body = isFollowup ? followupBody(for: habit) : primaryBody(for: habit)
        content.categoryIdentifier = Category.habitAlarm.rawValue
        content.interruptionLevel = .timeSensitive
        content.sound = wakeSound()  // フォローアップでも必ず 8 秒サウンド
        return content
    }

    private func wakeSound() -> UNNotificationSound {
        // UNNotificationSound は aiff / wav / caf のみサポート（mp3は非対応）。
        // 起床・フォローアップ通知では、Defaul.caf が必ずバンドルされている前提で使用する。
        if Bundle.main.url(forResource: "Defaul", withExtension: "caf") != nil {
            return UNNotificationSound(named: UNNotificationSoundName("Defaul.caf"))
        }

        // ここに到達するのはビルド設定ミスの場合のみ。
        // その場合はログを出してシステムデフォルト音でフォールバックする。
        logger.error("Wake sound Defaul.caf missing in bundle; falling back to default alert")
        return .default
    }

    private func primaryBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_body")
        case .training:
            return localizedString("notification_training_body")
        case .bedtime:
            return localizedString("notification_bedtime_body")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_body_format"), name)
        }
    }

    private func followupTitle(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_followup_title")
        case .training:
            return localizedString("notification_training_followup_title")
        case .bedtime:
            return localizedString("notification_bedtime_followup_title")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_followup_title_format"), name)
        }
    }

    private func followupBody(for habit: HabitType) -> String {
        switch habit {
        case .wake:
            return localizedString("notification_wake_followup_body")
        case .training:
            return localizedString("notification_training_followup_body")
        case .bedtime:
            return localizedString("notification_bedtime_followup_body")
        case .custom:
            let name = customHabitDisplayName()
            return String(format: localizedString("notification_custom_followup_body_format"), name)
        }
    }

    private func customHabitDisplayName() -> String {
        CustomHabitStore.shared.displayName(
            fallback: localizedString("habit_title_custom_fallback")
        )
    }

    private func nextFireDate(from components: DateComponents) -> Date? {
        var nextComponents = DateComponents()
        nextComponents.hour = components.hour
        nextComponents.minute = components.minute
        nextComponents.second = 0
        return Calendar.current.nextDate(
            after: Date(),
            matching: nextComponents,
            matchingPolicy: .nextTimePreservingSmallerComponents,
            direction: .forward
        )
    }

    private func keyMain(for habit: HabitType, hour: Int, minute: Int) -> String {
        "HABIT_MAIN_\(habit.rawValue)_\(hour)_\(minute)"
    }

    private func keyFollow(for habit: HabitType, timestamp: Int) -> String {
        "HABIT_FOLLOW_\(habit.rawValue)_\(timestamp)"
    }

    private func mainPrefix(for habit: HabitType) -> String {
        "HABIT_MAIN_\(habit.rawValue)_"
    }

    private func followPrefix(for habit: HabitType) -> String {
        "HABIT_FOLLOW_\(habit.rawValue)_"
    }

    private func removePending(withPrefix prefix: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            center.getPendingNotificationRequests { requests in
                let identifiers = requests
                    .map(\.identifier)
                    .filter { $0.hasPrefix(prefix) }
                if !identifiers.isEmpty {
                    self.center.removePendingNotificationRequests(withIdentifiers: identifiers)
                }
                continuation.resume()
            }
        }
    }

    private func removeDelivered(withPrefix prefix: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            center.getDeliveredNotifications { notifications in
                let identifiers = notifications
                    .map(\.request.identifier)
                    .filter { $0.hasPrefix(prefix) }
                if !identifiers.isEmpty {
                    self.center.removeDeliveredNotifications(withIdentifiers: identifiers)
                }
                continuation.resume()
            }
        }
    }
    
    private func shouldUseAlarmKit(for habit: HabitType) -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let profile = AppState.shared.userProfile
            switch habit {
            case .wake:
                return profile.useAlarmKitForWake
            case .training:
                return profile.useAlarmKitForTraining
            case .bedtime:
                return profile.useAlarmKitForBedtime
            case .custom:
                return profile.useAlarmKitForCustom
            }
        }
#endif
        return false
    }
    
    private func scheduleWithAlarmKitIfNeeded(habit: HabitType, hour: Int, minute: Int) async -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard shouldUseAlarmKit(for: habit) else {
                // AlarmKit無効の場合、既存のAlarmKitアラームをキャンセル
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
                return false
            }
            let followups = repeatCount(for: habit)
            let scheduled = await AlarmKitHabitCoordinator.shared.scheduleHabit(habit, hour: hour, minute: minute, followupCount: followups)
            if !scheduled {
                await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            }
            return scheduled
        }
#endif
        return false
    }
    
    // MARK: - Custom Habit (UUID) support
    func applyCustomSchedules(_ schedules: [UUID: (name: String, time: DateComponents)]) async {
        // いったん全カスタムの pending/delivered を掃除（簡易実装）
        await removePending(withPrefix: "HABIT_CUSTOM_MAIN_")
        await removePending(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        await removeDelivered(withPrefix: "HABIT_CUSTOM_FOLLOW_")
        
        for (id, entry) in schedules {
            guard let hour = entry.time.hour, let minute = entry.time.minute else { continue }
            
            // AlarmKitをスケジュール（iOS 26+ かつユーザーがONにしている場合）
            let alarmKitScheduled = await scheduleCustomWithAlarmKitIfNeeded(
                id: id,
                name: entry.name,
                hour: hour,
                minute: minute
            )
            
            // AlarmKitがOFFの場合のみ、通常通知をスケジュール
            if !alarmKitScheduled {
                await scheduleCustomMain(id: id, name: entry.name, time: entry.time)
                scheduleCustomFollowups(id: id, name: entry.name, baseComponents: entry.time)
            }
            
            logger.info("Scheduled custom habit \(id.uuidString, privacy: .public): AlarmKit=\(alarmKitScheduled, privacy: .public)")
        }
    }
    
    private func scheduleCustomWithAlarmKitIfNeeded(id: UUID, name: String, hour: Int, minute: Int) async -> Bool {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard AppState.shared.userProfile.useAlarmKitForCustom else {
                // AlarmKit無効の場合、既存のAlarmKitアラームをキャンセル
                await AlarmKitHabitCoordinator.shared.cancelCustomHabitAlarms(id)
                return false
            }
            let followups = AppState.shared.customFollowupCount(for: id)
            let scheduled = await AlarmKitHabitCoordinator.shared.scheduleCustomHabit(id, name: name, hour: hour, minute: minute, followupCount: followups)
            if !scheduled {
                await AlarmKitHabitCoordinator.shared.cancelCustomHabitAlarms(id)
            }
            return scheduled
        }
#endif
        return false
    }
    
    private func scheduleCustomMain(id: UUID, name: String, time: DateComponents) async {
        let trigger = UNCalendarNotificationTrigger(dateMatching: time, repeats: true)
        let req = UNNotificationRequest(
            identifier: keyCustomMain(id: id, time: time),
            content: customBaseContent(name: name, isFollowup: false),
            trigger: trigger
        )
        try? await center.add(req)
    }
    
    private func scheduleCustomFollowups(id: UUID, name: String, baseComponents: DateComponents) {
        Task {
            await removePending(withPrefix: keyCustomFollowPrefix(id: id))
            await removeDelivered(withPrefix: keyCustomFollowPrefix(id: id))
            guard let first = nextFireDate(from: baseComponents) else { return }
            let repeats = AppState.shared.customFollowupCount(for: id)
            for index in 1...max(1, min(10, repeats)) {
                guard let fireDate = Calendar.current.date(byAdding: .second, value: index * AlarmLoop.intervalSeconds, to: first) else { continue }
                let comps = Calendar.current.dateComponents([.year,.month,.day,.hour,.minute,.second], from: fireDate)
                let trig = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                let req = UNNotificationRequest(
                    identifier: keyCustomFollow(id: id, ts: Int(fireDate.timeIntervalSince1970)),
                    content: customBaseContent(name: name, isFollowup: true),
                    trigger: trig
                )
                try? await center.add(req)
            }
        }
    }
    
    private func customBaseContent(name: String, isFollowup: Bool) -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = isFollowup ? String(format: localizedString("notification_custom_followup_title_format"), name) : name
        c.body  = isFollowup ? String(format: localizedString("notification_custom_followup_body_format"), name) : String(format: localizedString("notification_custom_body_format"), name)
        c.categoryIdentifier = Category.habitAlarm.rawValue
        c.interruptionLevel = .timeSensitive
        c.sound = wakeSound()
        return c
    }
    
    private func keyCustomMain(id: UUID, time: DateComponents) -> String {
        let hour = time.hour ?? 0
        let minute = time.minute ?? 0
        return "HABIT_CUSTOM_MAIN_\(id.uuidString)_\(hour)_\(minute)"
    }
    
    private func keyCustomFollow(id: UUID, ts: Int) -> String {
        "HABIT_CUSTOM_FOLLOW_\(id.uuidString)_\(ts)"
    }
    
    private func keyCustomFollowPrefix(id: UUID) -> String {
        "HABIT_CUSTOM_FOLLOW_\(id.uuidString)_"
    }

    // MARK: - Nudge scheduling (v0.3)
    /// /mobile/nudge/trigger の応答を「即時ローカル通知」として提示する。
    /// - 注意: 頻度/クールダウン/優先度/延期はサーバ側で制御する（iOSは提示のみ）。
    func scheduleNudgeNow(nudgeId: String, domain: String, message: String, userInfo: [String: Any]) async {
        guard !nudgeId.isEmpty, !message.isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = "Anicca"
        content.body = message
        content.categoryIdentifier = Category.nudge.rawValue
        content.userInfo = userInfo

        // v0.3: Nudge は habit alarm と異なり「連続リピート音」なし（gentle）
        content.sound = .default
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .active
        }

        // 即時（1秒後）に提示
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: keyNudgeMain(nudgeId: nudgeId),
            content: content,
            trigger: trigger
        )
        do {
            try await center.add(request)
        } catch {
            logger.error("Failed to schedule nudge notification: \(error.localizedDescription, privacy: .public)")
        }
    }

    func nudgeId(fromIdentifier identifier: String) -> String? {
        // NUDGE_MAIN_<nudgeId>
        let parts = identifier.split(separator: "_")
        guard parts.count >= 3, parts[0] == "NUDGE", parts[1] == "MAIN" else { return nil }
        return String(parts[2])
    }

    private func keyNudgeMain(nudgeId: String) -> String {
        "NUDGE_MAIN_\(nudgeId)"
    }
}

