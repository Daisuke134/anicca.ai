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
    
    /// Phase 5: 最大シフト量（分）- 2時間まで
    private let maxShiftMinutes = 120
    
    /// 現在のシフト量を保存するキー
    private let shiftStorageKey = "com.anicca.problemNotificationShifts"

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

                // タイミング最適化: 2日連続ignoredならシフト（最大maxShiftMinutesまで）
                let consecutiveIgnored = await MainActor.run {
                    NudgeStatsManager.shared.getConsecutiveIgnoredDays(problemType: problemRaw, hour: time.hour)
                }

                let currentShift = getCurrentShiftMinutes(problemType: problemRaw, originalHour: time.hour)
                let newShift = calculateNewShift(currentShift: currentShift, consecutiveIgnored: consecutiveIgnored)

                if newShift > currentShift {
                    // シフトが増加した場合
                    let totalMinutes = time.hour * 60 + time.minute + newShift
                    adjustedHour = (totalMinutes / 60) % 24
                    adjustedMinute = totalMinutes % 60

                    // シフト量を保存
                    recordShift(problemType: problemRaw, originalHour: time.hour, shiftMinutes: newShift)

                    logger.info("Shifted \(problemRaw) from \(time.hour):\(time.minute) to \(adjustedHour):\(adjustedMinute) (total shift: \(newShift)min, max: \(self.maxShiftMinutes)min)")
                } else if currentShift > 0 {
                    // 既存のシフトがある場合は維持
                    let totalMinutes = time.hour * 60 + time.minute + currentShift
                    adjustedHour = (totalMinutes / 60) % 24
                    adjustedMinute = totalMinutes % 60
                    logger.info("Keeping existing shift for \(problemRaw) at \(time.hour):\(time.minute), shift: \(currentShift)min")
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
            let selection = await MainActor.run {
                NudgeContentSelector.shared.selectVariant(for: problem, scheduledHour: hour)
            }
            variantIndex = selection.variantIndex
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

        // NudgeContentSelectorでバリアント選択（Phase 6: LLM生成対応）
        let selection = await MainActor.run {
            NudgeContentSelector.shared.selectVariant(for: problem, scheduledHour: hour)
        }

        let notificationContent = UNMutableNotificationContent()
        let titleKey = "problem_\(problem.rawValue)_notification_title"
        notificationContent.title = NSLocalizedString(titleKey, comment: "")
        notificationContent.categoryIdentifier = Category.problemNudge.rawValue
        notificationContent.sound = .default

        if selection.isAIGenerated, let llmNudge = selection.content {
            // LLM生成の場合
            notificationContent.body = llmNudge.hook
            notificationContent.userInfo = [
                "problemType": problem.rawValue,
                "isAIGenerated": true,
                "llmNudgeId": llmNudge.id,
                "notificationText": llmNudge.hook,
                "detailText": llmNudge.content,
                "scheduledHour": hour,
                "scheduledMinute": minute
            ]
        } else {
            // 既存バリアントの場合
            let notificationTextKey = "nudge_\(problem.rawValue)_notification_\(selection.variantIndex + 1)"
            let detailTextKey = "nudge_\(problem.rawValue)_detail_\(selection.variantIndex + 1)"
            notificationContent.body = NSLocalizedString(notificationTextKey, comment: "")
            notificationContent.userInfo = [
                "problemType": problem.rawValue,
                "isAIGenerated": false,
                "notificationTextKey": notificationTextKey,
                "detailTextKey": detailTextKey,
                "variantIndex": selection.variantIndex,
                "scheduledHour": hour,
                "scheduledMinute": minute
            ]
        }

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
            logger.info("Scheduled problem notification: \(problem.rawValue) at \(hour):\(minute) variant:\(selection.variantIndex) isAIGenerated:\(selection.isAIGenerated)")

            // スケジュール成功時にNudgeStatsに記録
            await MainActor.run {
                NudgeStatsManager.shared.recordScheduled(
                    problemType: problem.rawValue,
                    variantIndex: selection.variantIndex,
                    scheduledHour: hour,
                    isAIGenerated: selection.isAIGenerated,
                    llmNudgeId: selection.content?.id
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
    
    // MARK: - Phase 5: Shift Calculation (Testable)

    /// シフト量を計算（純粋関数、テスト可能）
    /// - Parameters:
    ///   - currentShift: 現在のシフト量（分）
    ///   - consecutiveIgnored: 連続無視日数
    /// - Returns: 新しいシフト量（分）、最大 maxShiftMinutes まで
    func calculateNewShift(currentShift: Int, consecutiveIgnored: Int) -> Int {
        guard consecutiveIgnored >= 2 else { return currentShift }
        return min(currentShift + 30, maxShiftMinutes)
    }

    // MARK: - Phase 5: Shift Management

    /// 現在のシフト量を取得
    private func getCurrentShiftMinutes(problemType: String, originalHour: Int) -> Int {
        let key = "\(problemType)_\(originalHour)"
        let shifts = UserDefaults.standard.dictionary(forKey: shiftStorageKey) as? [String: Int] ?? [:]
        return shifts[key] ?? 0
    }
    
    /// シフト量を保存
    private func recordShift(problemType: String, originalHour: Int, shiftMinutes: Int) {
        let key = "\(problemType)_\(originalHour)"
        var shifts = UserDefaults.standard.dictionary(forKey: shiftStorageKey) as? [String: Int] ?? [:]
        shifts[key] = shiftMinutes
        UserDefaults.standard.set(shifts, forKey: shiftStorageKey)
    }
    
    /// シフト量をリセット（タップ時に呼び出す）
    func resetShift(for problemType: String, originalHour: Int) {
        let key = "\(problemType)_\(originalHour)"
        var shifts = UserDefaults.standard.dictionary(forKey: shiftStorageKey) as? [String: Int] ?? [:]
        shifts.removeValue(forKey: key)
        UserDefaults.standard.set(shifts, forKey: shiftStorageKey)
        logger.info("Reset shift for \(problemType) at hour \(originalHour)")
    }
    
    #if DEBUG
    /// デバッグ用: 全シフトをリセット
    func resetAllShifts() {
        UserDefaults.standard.removeObject(forKey: shiftStorageKey)
        logger.info("All shifts reset")
    }
    
    /// デバッグ用: シフト状態を取得
    func getAllShifts() -> [String: Int] {
        return UserDefaults.standard.dictionary(forKey: shiftStorageKey) as? [String: Int] ?? [:]
    }
    #endif

    // MARK: - Notification Parsing

    /// 通知からNudgeContentを復元
    static func nudgeContent(from userInfo: [AnyHashable: Any]) -> NudgeContent? {
        guard let problemRaw = userInfo["problemType"] as? String,
              let problem = ProblemType(rawValue: problemRaw) else {
            return nil
        }

        // LLM生成Nudgeの場合
        if let isAIGenerated = userInfo["isAIGenerated"] as? Bool, isAIGenerated,
           let llmNudgeId = userInfo["llmNudgeId"] as? String,
           let notificationText = userInfo["notificationText"] as? String,
           let detailText = userInfo["detailText"] as? String {
            return NudgeContent(
                problemType: problem,
                notificationText: notificationText,
                detailText: detailText,
                variantIndex: -1,
                isAIGenerated: true,
                llmNudgeId: llmNudgeId
            )
        }

        // 既存バリアント: キーから解決
        if let variantIndex = userInfo["variantIndex"] as? Int,
           let notificationTextKey = userInfo["notificationTextKey"] as? String,
           let detailTextKey = userInfo["detailTextKey"] as? String {
            let notificationText = NSLocalizedString(notificationTextKey, comment: "")
            let detailText = NSLocalizedString(detailTextKey, comment: "")

            return NudgeContent(
                problemType: problem,
                notificationText: notificationText,
                detailText: detailText,
                variantIndex: variantIndex,
                isAIGenerated: false,
                llmNudgeId: nil
            )
        }

        // 後方互換: 古い形式（文字列直接保存）
        if let variantIndex = userInfo["variantIndex"] as? Int,
           let notificationText = userInfo["notificationText"] as? String,
           let detailText = userInfo["detailText"] as? String {
            return NudgeContent(
                problemType: problem,
                notificationText: notificationText,
                detailText: detailText,
                variantIndex: variantIndex,
                isAIGenerated: false,
                llmNudgeId: nil
            )
        }

        return nil
    }

    /// 通知がProblem Nudgeかどうか判定
    static func isProblemNudge(identifier: String) -> Bool {
        return identifier.hasPrefix("PROBLEM_") || identifier.hasPrefix("TEST_PROBLEM_")
    }
}
