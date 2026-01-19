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
        // 既存の問題通知をクリア
        await removeAllProblemNotifications()

        // 各問題の通知時刻を収集
        var allSchedules: [(time: (hour: Int, minute: Int), problem: ProblemType)] = []

        for problemRaw in problems {
            guard let problem = ProblemType(rawValue: problemRaw) else { continue }

            for time in problem.notificationSchedule {
                allSchedules.append((time: time, problem: problem))
            }
        }

        // 時刻でソート
        allSchedules.sort { $0.time.hour * 60 + $0.time.minute < $1.time.hour * 60 + $1.time.minute }

        // 30分以内に被る場合は15分ずらしてスケジュール
        var lastScheduledMinutes: Int?
        var scheduledCount = 0

        for schedule in allSchedules {
            var hour = schedule.time.hour
            var minute = schedule.time.minute
            var currentMinutes = hour * 60 + minute

            if let last = lastScheduledMinutes {
                // 前回スケジュール時刻 + 最小間隔より前なら、15分ずらす
                if currentMinutes < last + minimumIntervalMinutes {
                    currentMinutes = last + 15
                    hour = (currentMinutes / 60) % 24
                    minute = currentMinutes % 60
                    logger.info("Shifted \(schedule.problem.rawValue) to \(hour):\(minute)")
                }
            }

            // 有効時間帯のチェック（時間帯制限がある問題のみ）
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
        let content = NudgeContent.contentForToday(for: problem)

        let notificationContent = UNMutableNotificationContent()
        notificationContent.title = problem.notificationTitle
        notificationContent.body = content.notificationText
        notificationContent.categoryIdentifier = Category.problemNudge.rawValue
        notificationContent.sound = .default

        notificationContent.userInfo = [
            "problemType": problem.rawValue,
            "notificationText": content.notificationText,
            "detailText": content.detailText,
            "variantIndex": content.variantIndex
        ]

        if #available(iOS 15.0, *) {
            notificationContent.interruptionLevel = .active
        }

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let identifier = "TEST_PROBLEM_\(problem.rawValue)_\(Date().timeIntervalSince1970)"
        let request = UNNotificationRequest(
            identifier: identifier,
            content: notificationContent,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Test notification scheduled for \(problem.rawValue)")
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
                    // 6:00の呼び出し時のみAlarmKitに委譲
                    // AlarmKit側で6:00と6:05の両方をスケジュールする
                    if hour == 6 && minute == 0 {
                        await ProblemAlarmKitScheduler.shared.scheduleCantWakeUp(hour: hour, minute: minute)
                    }
                    // 6:05の呼び出しは無視（AlarmKit側で既にスケジュール済み）
                    // 通常通知はスケジュールしない
                    return
                }
            }
            #endif
        }

        let content = NudgeContent.contentForToday(for: problem)

        let notificationContent = UNMutableNotificationContent()
        notificationContent.title = problem.notificationTitle
        notificationContent.body = content.notificationText
        notificationContent.categoryIdentifier = Category.problemNudge.rawValue
        notificationContent.sound = .default

        // userInfo に問題タイプと表示用データを保存
        notificationContent.userInfo = [
            "problemType": problem.rawValue,
            "notificationText": content.notificationText,
            "detailText": content.detailText,
            "variantIndex": content.variantIndex
        ]

        if #available(iOS 15.0, *) {
            notificationContent.interruptionLevel = .active
        }

        // 毎日繰り返し
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
            logger.info("Scheduled problem notification: \(problem.rawValue) at \(hour):\(minute)")
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
              let notificationText = userInfo["notificationText"] as? String,
              let detailText = userInfo["detailText"] as? String,
              let variantIndex = userInfo["variantIndex"] as? Int else {
            return nil
        }

        return NudgeContent(
            problemType: problem,
            notificationText: notificationText,
            detailText: detailText,
            variantIndex: variantIndex
        )
    }

    /// 通知がProblem Nudgeかどうか判定
    static func isProblemNudge(identifier: String) -> Bool {
        return identifier.hasPrefix("PROBLEM_")
    }
}
