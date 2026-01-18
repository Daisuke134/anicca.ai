// ============================================================
// ⚠️ UNUSED - 現在このファイルは使用されていません
// ============================================================
// AlarmKitによるフルスクリーンアラーム機能のために準備しています。
// App Store審査リスク（Guideline 4.5.4）を回避するため、
// 現在は無効化しています。
//
// 将来の実装予定:
// - Profile画面に「アラーム機能」トグルを追加
// - トグルON時のみ、cantWakeUp(起きれない)でAlarmKitを使用
// - 6:00と6:05にフルスクリーンアラームを表示
//
// 次のリファクタリング時にMDファイルに移して削除予定
// ============================================================

#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import Foundation
import OSLog
import SwiftUI

// MARK: - Metadata
@available(iOS 26.0, *)
struct ProblemAlarmMetadata: AlarmMetadata {
    let problemType: String

    init(problemType: String) {
        self.problemType = problemType
    }
}

@available(iOS 26.0, *)
final class ProblemAlarmKitScheduler {
    static let shared = ProblemAlarmKitScheduler()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "ProblemAlarmKit")
    private let manager = AlarmManager.shared
    private let storageKey = "com.anicca.alarmkit.cantWakeUp.id"

    private init() {}

    /// cantWakeUp用のAlarmKitアラームをスケジュール
    func scheduleCantWakeUp(hour: Int, minute: Int) async {
        await cancelCantWakeUp()

        let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
        let schedule = Alarm.Schedule.relative(.init(
            time: time,
            repeats: .weekly(Locale.Weekday.allWeekdays)
        ))

        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource("problem_cant_wake_up_notification_title"),
            stopButton: AlarmButton(
                text: LocalizedStringResource("problem_cant_wake_up_negative_button"),
                textColor: Color.red,
                systemImageName: "bed.double"
            ),
            secondaryButton: AlarmButton(
                text: LocalizedStringResource("problem_cant_wake_up_positive_button"),
                textColor: Color.white,
                systemImageName: "sun.max"
            ),
            secondaryButtonBehavior: .custom
        )

        let presentation = AlarmPresentation(alert: alert)
        let metadata = ProblemAlarmMetadata(problemType: "cant_wake_up")
        let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: Color.orange)

        let identifier = UUID()
        let secondary = OpenProblemOneScreenIntent(problemType: "cant_wake_up")

        let configuration = AlarmManager.AlarmConfiguration(
            countdownDuration: nil,
            schedule: schedule,
            attributes: attributes,
            stopIntent: CantWakeUpStopIntent(alarmID: identifier.uuidString),
            secondaryIntent: secondary
        )

        do {
            _ = try await manager.schedule(id: identifier, configuration: configuration)
            UserDefaults.standard.set(identifier.uuidString, forKey: storageKey)
            logger.info("Scheduled AlarmKit alarm for cantWakeUp at \(hour):\(minute)")
        } catch {
            logger.error("Failed to schedule AlarmKit for cantWakeUp: \(error.localizedDescription)")
        }
    }

    /// cantWakeUp用のAlarmKitアラームをキャンセル
    func cancelCantWakeUp() async {
        guard let idString = UserDefaults.standard.string(forKey: storageKey),
              let id = UUID(uuidString: idString) else { return }

        do {
            try manager.cancel(id: id)
            UserDefaults.standard.removeObject(forKey: storageKey)
            logger.info("Cancelled AlarmKit for cantWakeUp")
        } catch {
            logger.error("Failed to cancel AlarmKit for cantWakeUp: \(error.localizedDescription)")
        }
    }
}

// MARK: - Intents

@available(iOS 26.0, *)
struct OpenProblemOneScreenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Open Problem OneScreen"

    @Parameter(title: "Problem Type")
    var problemType: String

    init() {
        self.problemType = "cant_wake_up"
    }

    init(problemType: String) {
        self.problemType = problemType
    }

    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(
            name: Notification.Name("OpenProblemOneScreen"),
            object: nil,
            userInfo: ["problemType": problemType]
        )
        return .result()
    }
}

@available(iOS 26.0, *)
struct CantWakeUpStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop CantWakeUp Alarm"

    @Parameter(title: "Alarm ID")
    var alarmID: String

    init() {
        self.alarmID = ""
    }

    init(alarmID: String) {
        self.alarmID = alarmID
    }

    func perform() async throws -> some IntentResult {
        let logger = Logger(subsystem: "com.anicca.ios", category: "ProblemAlarmKit")
        logger.info("CantWakeUp alarm stopped: id=\(self.alarmID)")
        return .result()
    }
}
#endif
