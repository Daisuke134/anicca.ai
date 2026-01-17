import Foundation
import UserNotifications
import OSLog

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

            // cant_wake_up はアラームとして別途処理されるのでスキップ
            if problem == .cantWakeUp { continue }

            for time in problem.notificationSchedule {
                allSchedules.append((time: time, problem: problem))
            }
        }

        // 時刻でソート
        allSchedules.sort { $0.time.hour * 60 + $0.time.minute < $1.time.hour * 60 + $1.time.minute }

        // 30分以上間隔を空けてスケジュール
        var lastScheduledMinutes: Int?
        var scheduledCount = 0

        for schedule in allSchedules {
            let currentMinutes = schedule.time.hour * 60 + schedule.time.minute

            // 30分以上間隔が空いているか確認
            if let last = lastScheduledMinutes {
                let diff = currentMinutes - last
                if diff < minimumIntervalMinutes && diff >= 0 {
                    logger.info("Skipping \(schedule.problem.rawValue) at \(schedule.time.hour):\(schedule.time.minute) (too close to previous)")
                    continue
                }
            }

            await scheduleNotification(
                for: schedule.problem,
                hour: schedule.time.hour,
                minute: schedule.time.minute
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

    // MARK: - Private Methods

    private func scheduleNotification(for problem: ProblemType, hour: Int, minute: Int) async {
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
