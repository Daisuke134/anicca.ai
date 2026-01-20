import Foundation
import UserNotifications
import OSLog
#if canImport(AlarmKit)
import AlarmKit
#endif

/// 問題ベースの通知スケジューラ
/// ユーザーが選択した問題に基づいて通知をスケジュール
final class ProblemNotificationScheduler {
    static let shared = ProblemNotificationScheduler()

    private let center = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ProblemNotificationScheduler")

    /// 通知カテゴリID
    enum Category: String {
        case problemNudge = "PROBLEM_NUDGE"
    }

    /// 最小通知間隔（分）
    private let minimumIntervalMinutes = 30

    private init() {}

    // MARK: - Public API

    /// ユーザーの選択した問題に基づいて通知をスケジュール
    func scheduleNotifications(for problems: [String]) async {
        await removeAllProblemNotifications()

        // ★ 重要: Free プランかつ月間上限到達済みの場合はスケジュールしない
        let canSchedule = await MainActor.run { AppState.shared.canReceiveNudge }

        if !canSchedule {
            logger.info("Monthly nudge limit reached (Free plan). No notifications scheduled.")
            return
        }

        var allSchedules: [(time: (hour: Int, minute: Int), problem: ProblemType)] = []

        for problemRaw in problems {
            guard let problem = ProblemType(rawValue: problemRaw) else { continue }

            for time in problem.notificationSchedule {
                var adjustedHour = time.hour
                var adjustedMinute = time.minute

                // タイミング最適化: 2日連続ignoredならシフト
                let consecutiveIgnored = await MainActor.run {
                    NudgeStatsManager.shared.getConsecutiveIgnoredDays(problemType: problemRaw, hour: time.hour)
                }

                if consecutiveIgnored >= 2 {
                    // 30分後ろにシフト
                    adjustedMinute += 30
                    if adjustedMinute >= 60 {
                        adjustedMinute -= 60
                        adjustedHour = (adjustedHour + 1) % 24
                    }
                    logger.info("Shifted \(problemRaw) from \(time.hour):\(time.minute) to \(adjustedHour):\(adjustedMinute) due to \(consecutiveIgnored) consecutive ignored days")
                }

                allSchedules.append((time: (adjustedHour, adjustedMinute), problem: problem))
            }
        }

        // 時刻でソート
        allSchedules.sort { $0.time.hour * 60 + $0.time.minute < $1.time.hour * 60 + $1.time.minute }

        // 30分以内に被る場合は15分ずらしてスケジュール（既存ロジック）
        var lastScheduledMinutes: Int?
        var scheduledCount = 0

        for schedule in allSchedules {
            var hour = schedule.time.hour
            var minute = schedule.time.minute
            var currentMinutes = hour * 60 + minute

            if let last = lastScheduledMinutes {
                if currentMinutes < last + minimumIntervalMinutes {
                    currentMinutes = last + 15
                    hour = (currentMinutes / 60) % 24
                    minute = currentMinutes % 60
                    logger.info("Shifted \(schedule.problem.rawValue) to \(hour):\(minute) to avoid collision")
                }
            }

            guard schedule.problem.isValidTime(hour: hour, minute: minute) else {
                logger.info("Skipped \(schedule.problem.rawValue) at \(hour):\(minute) - outside valid time range")
                continue
            }

            await scheduleNotification(
                for: schedule.problem,
                hour: hour,
                minute: minute
            )

            lastScheduledMinutes = currentMinutes
            scheduledCount += 1
        }

        logger.info("Scheduled \(scheduledCount) problem notifications")
    }

    /// すべての問題通知をキャンセル
    func cancelAllNotifications() async {
        await removeAllProblemNotifications()
    }

    #if DEBUG
    /// テスト用: 指定した問題の通知を5秒後に発火
    func testNotification(for problem: ProblemType) async {
        await testNotification(for: problem, scheduledHour: nil)
    }

    /// テスト用: 指定した問題・時刻の通知を5秒後に発火
    func testNotification(for problem: ProblemType, scheduledHour: Int?) async {
        // scheduledHour が指定されていれば、その時刻用のバリアントを選択
        let variantIndex: Int
        if let hour = scheduledHour {
            variantIndex = await MainActor.run {
                NudgeContentSelector.shared.selectVariant(for: problem, scheduledHour: hour)
            }
        } else {
            variantIndex = NudgeContent.contentForToday(for: problem).variantIndex
        }

        let notificationTextKey = "nudge_\(problem.rawValue)_notification_\(variantIndex + 1)"
        let detailTextKey = "nudge_\(problem.rawValue)_detail_\(variantIndex + 1)"

        let notificationContent = UNMutableNotificationContent()
        notificationContent.title = problem.notificationTitle
        notificationContent.body = NSLocalizedString(notificationTextKey, comment: "")
        notificationContent.categoryIdentifier = Category.problemNudge.rawValue
        notificationContent.sound = .default

        notificationContent.userInfo = [
            "problemType": problem.rawValue,
            "notificationTextKey": notificationTextKey,
            "detailTextKey": detailTextKey,
            "variantIndex": variantIndex,
            "scheduledHour": scheduledHour ?? 0,
            "scheduledMinute": 0
        ]

        if #available(iOS 15.0, *) {
            notificationContent.interruptionLevel = .active
        }

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let identifier = "TEST_PROBLEM_\(problem.rawValue)_\(Date().timeIntervalSince1970)"
        let request = UNNotificationRequest(identifier: identifier, content: notificationContent, trigger: trigger)

        do {
            try await center.add(request)
            logger.info("Test notification scheduled for \(problem.rawValue) variant:\(variantIndex) hour:\(scheduledHour ?? -1)")
        } catch {
            logger.error("Failed to schedule test notification: \(error.localizedDescription)")
        }
    }
    #endif

    // MARK: - Private Methods

    private func scheduleNotification(for problem: ProblemType, hour: Int, minute: Int) async {
        // cantWakeUp + AlarmKit許可済み + トグルON → AlarmKitに委譲
        if problem == .cantWakeUp {
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                let manager = AlarmManager.shared
                if manager.authorizationState == .authorized,
                   AppState.shared.userProfile.useAlarmKitForCantWakeUp {
                    if hour == 6 && minute == 0 {
                        await ProblemAlarmKitScheduler.shared.scheduleCantWakeUp(hour: hour, minute: minute)
                    }
                    return
                }
            }
            #endif
        }

        // NudgeContentSelectorでバリアント選択（Task 7で実装）
        let variantIndex = await MainActor.run {
            NudgeContentSelector.shared.selectVariant(for: problem, scheduledHour: hour)
        }

        // キーを生成（文字列ではなくキーを保存）
        let notificationTextKey = "nudge_\(problem.rawValue)_notification_\(variantIndex + 1)"
        let detailTextKey = "nudge_\(problem.rawValue)_detail_\(variantIndex + 1)"
        let titleKey = "problem_\(problem.rawValue)_notification_title"

        let notificationContent = UNMutableNotificationContent()
        // 通知のtitle/bodyはスケジュール時に解決（iOS通知センターに表示されるため）
        notificationContent.title = NSLocalizedString(titleKey, comment: "")
        notificationContent.body = NSLocalizedString(notificationTextKey, comment: "")
        notificationContent.categoryIdentifier = Category.problemNudge.rawValue
        notificationContent.sound = .default

        // userInfo にキーを保存（表示時に再解決）
        notificationContent.userInfo = [
            "problemType": problem.rawValue,
            "notificationTextKey": notificationTextKey,
            "detailTextKey": detailTextKey,
            "variantIndex": variantIndex,
            "scheduledHour": hour,
            "scheduledMinute": minute
        ]

        if #available(iOS 15.0, *) {
            notificationContent.interruptionLevel = .active
        }

        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        let identifier = "PROBLEM_\(problem.rawValue)_\(hour)_\(minute)"
        let request = UNNotificationRequest(
            identifier: identifier,
            content: notificationContent,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled problem notification: \(problem.rawValue) at \(hour):\(minute) variant:\(variantIndex)")

            // スケジュール成功時にNudgeStatsに記録（Task 6で実装）
            await MainActor.run {
                NudgeStatsManager.shared.recordScheduled(
                    problemType: problem.rawValue,
                    variantIndex: variantIndex,
                    scheduledHour: hour
                )
            }
        } catch {
            logger.error("Failed to schedule problem notification: \(error.localizedDescription)")
        }
    }

    private func removeAllProblemNotifications() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            center.getPendingNotificationRequests { requests in
                let identifiers = requests
                    .map(\.identifier)
                    .filter { $0.hasPrefix("PROBLEM_") }
                if !identifiers.isEmpty {
                    self.center.removePendingNotificationRequests(withIdentifiers: identifiers)
                }
                continuation.resume()
            }
        }
    }

    // MARK: - Notification Parsing

    /// 通知からNudgeContentを復元
    static func nudgeContent(from userInfo: [AnyHashable: Any]) -> NudgeContent? {
        guard let problemRaw = userInfo["problemType"] as? String,
              let problem = ProblemType(rawValue: problemRaw),
              let variantIndex = userInfo["variantIndex"] as? Int else {
            return nil
        }

        // 新形式: キーから解決
        if let notificationTextKey = userInfo["notificationTextKey"] as? String,
           let detailTextKey = userInfo["detailTextKey"] as? String {
            let notificationText = NSLocalizedString(notificationTextKey, comment: "")
            let detailText = NSLocalizedString(detailTextKey, comment: "")

            return NudgeContent(
                problemType: problem,
                notificationText: notificationText,
                detailText: detailText,
                variantIndex: variantIndex
            )
        }

        // 後方互換: 古い形式（文字列直接保存）
        if let notificationText = userInfo["notificationText"] as? String,
           let detailText = userInfo["detailText"] as? String {
            return NudgeContent(
                problemType: problem,
                notificationText: notificationText,
                detailText: detailText,
                variantIndex: variantIndex
            )
        }

        return nil
    }

    /// 通知がProblem Nudgeかどうか判定
    static func isProblemNudge(identifier: String) -> Bool {
        return identifier.hasPrefix("PROBLEM_") || identifier.hasPrefix("TEST_PROBLEM_")
    }
}
