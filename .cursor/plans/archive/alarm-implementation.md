# AlarmKit Implementation Archive

削除前に記録。将来復活させる場合の参考資料。

---

## 概要

- **対象**: iOS 26+ の `cant_wake_up` 問題タイプ
- **機能**: 2段階アラーム（6:00 + 6:05）
- **削除理由**: AlarmKit が動作不安定のため、通知のみで対応

---

## ProblemAlarmKitScheduler.swift

```swift
#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import Foundation
import OSLog
import SwiftUI

// MARK: - Locale.Weekday Extension
@available(iOS 26.0, *)
extension Locale.Weekday {
    static var allWeekdays: [Locale.Weekday] {
        [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
    }
}

// MARK: - Metadata
@available(iOS 26.0, *)
struct ProblemAlarmMetadata: AlarmMetadata {
    let problemType: String
    let isFollowup: Bool

    init(problemType: String, isFollowup: Bool = false) {
        self.problemType = problemType
        self.isFollowup = isFollowup
    }
}

@available(iOS 26.0, *)
final class ProblemAlarmKitScheduler {
    static let shared = ProblemAlarmKitScheduler()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "ProblemAlarmKit")
    private let manager = AlarmManager.shared

    // 2段階アラーム用のストレージキー
    private let primaryStorageKey = "com.anicca.alarmkit.cantWakeUp.primaryId"
    private let followupStorageKey = "com.anicca.alarmkit.cantWakeUp.followupId"

    // フォローアップのオフセット（分）
    private let followupOffsetMinutes = 5

    private init() {}

    // MARK: - Authorization

    func requestAuthorizationIfNeeded() async -> Bool {
        do {
            let currentState = manager.authorizationState
            logger.info("Current AlarmKit authorization state: \(String(describing: currentState), privacy: .public)")

            if currentState == .authorized {
                return true
            }

            let state = try await manager.requestAuthorization()
            logger.info("AlarmKit authorization result: \(String(describing: state), privacy: .public)")
            return state == .authorized
        } catch {
            logger.error("AlarmKit authorization failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    // MARK: - Public API

    func scheduleCantWakeUp(hour: Int, minute: Int) async {
        await cancelCantWakeUp()

        // 1. Primary alarm (例: 6:00)
        let primaryId = UUID()
        await scheduleAlarm(
            id: primaryId,
            hour: hour,
            minute: minute,
            isFollowup: false
        )
        UserDefaults.standard.set(primaryId.uuidString, forKey: primaryStorageKey)

        // 2. Followup alarm (例: 6:05)
        let followupId = UUID()
        let followupMinute = (minute + followupOffsetMinutes) % 60
        let followupHour = minute + followupOffsetMinutes >= 60 ? (hour + 1) % 24 : hour
        await scheduleAlarm(
            id: followupId,
            hour: followupHour,
            minute: followupMinute,
            isFollowup: true
        )
        UserDefaults.standard.set(followupId.uuidString, forKey: followupStorageKey)

        logger.info("Scheduled 2-stage AlarmKit alarms for cantWakeUp: \(hour):\(minute) and \(followupHour):\(followupMinute)")
    }

    func cancelCantWakeUp() async {
        // Primary
        if let idString = UserDefaults.standard.string(forKey: primaryStorageKey),
           let id = UUID(uuidString: idString) {
            do {
                try manager.cancel(id: id)
                logger.info("Cancelled primary AlarmKit for cantWakeUp")
            } catch {
                logger.error("Failed to cancel primary AlarmKit: \(error.localizedDescription)")
            }
            UserDefaults.standard.removeObject(forKey: primaryStorageKey)
        }

        // Followup
        if let idString = UserDefaults.standard.string(forKey: followupStorageKey),
           let id = UUID(uuidString: idString) {
            do {
                try manager.cancel(id: id)
                logger.info("Cancelled followup AlarmKit for cantWakeUp")
            } catch {
                logger.error("Failed to cancel followup AlarmKit: \(error.localizedDescription)")
            }
            UserDefaults.standard.removeObject(forKey: followupStorageKey)
        }
    }

    func cancelFollowupAndReschedule() async {
        if let idString = UserDefaults.standard.string(forKey: followupStorageKey),
           let id = UUID(uuidString: idString) {
            do {
                try manager.cancel(id: id)
                logger.info("Cancelled today's followup alarm")
            } catch {
                logger.error("Failed to cancel followup: \(error.localizedDescription)")
            }
        }

        let followupId = UUID()
        await scheduleAlarm(
            id: followupId,
            hour: 6,
            minute: followupOffsetMinutes,
            isFollowup: true
        )
        UserDefaults.standard.set(followupId.uuidString, forKey: followupStorageKey)
        logger.info("Rescheduled followup alarm for tomorrow")
    }

    // MARK: - Private

    private func scheduleAlarm(id: UUID, hour: Int, minute: Int, isFollowup: Bool) async {
        let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
        let schedule = Alarm.Schedule.relative(.init(
            time: time,
            repeats: .weekly(Locale.Weekday.allWeekdays)
        ))

        let alert = AlarmPresentation.Alert(
            title: LocalizedStringResource("problem_cant_wake_up_alarm_title"),
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
        let metadata = ProblemAlarmMetadata(problemType: "cant_wake_up", isFollowup: isFollowup)
        let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: Color.orange)

        let secondary = OpenProblemOneScreenIntent(problemType: "cant_wake_up")

        let configuration = AlarmManager.AlarmConfiguration(
            countdownDuration: nil,
            schedule: schedule,
            attributes: attributes,
            stopIntent: CantWakeUpStopIntent(alarmID: id.uuidString),
            secondaryIntent: secondary
        )

        do {
            _ = try await manager.schedule(id: id, configuration: configuration)
            logger.info("Scheduled AlarmKit alarm at \(hour):\(minute) (followup: \(isFollowup))")
        } catch {
            logger.error("Failed to schedule AlarmKit alarm: \(error.localizedDescription)")
        }
    }
}
#endif
```

---

## Intents

```swift
@available(iOS 26.0, *)
struct OpenProblemOneScreenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Open Problem OneScreen"
    static var description = IntentDescription("Opens the Anicca app to show the nudge card")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Problem Type")
    var problemType: String

    init() {
        self.problemType = "cant_wake_up"
    }

    init(problemType: String) {
        self.problemType = problemType
    }

    func perform() async throws -> some IntentResult {
        await ProblemAlarmKitScheduler.shared.cancelFollowupAndReschedule()

        await MainActor.run {
            NotificationCenter.default.post(
                name: Notification.Name("OpenProblemOneScreen"),
                object: nil,
                userInfo: ["problemType": problemType]
            )
        }
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
        logger.info("CantWakeUp alarm stopped (stay in bed): id=\(self.alarmID)")
        return .result()
    }
}
```

---

## 2段階アラームの仕組み

```
6:00 Primary Alarm
  ├─ 「今日を始める」タップ → フォローアップキャンセル、アプリ起動
  └─ 「布団にいる」タップ → 何もしない（6:05が鳴る）

6:05 Followup Alarm
  ├─ 「今日を始める」タップ → アプリ起動
  └─ 「布団にいる」タップ → 何もしない
```

---

## プロジェクト設定

### Capabilities
- AlarmKit capability を追加

### Info.plist
```xml
<key>NSAlarmCapabilityRequestedReason</key>
<string>Anicca uses alarms to help you wake up at your desired time.</string>
```

### Intent Extension (もし存在する場合)
- aniccaiosIntents ターゲット
- Embed App Extensions に追加

---

## 復元手順

1. **ファイル復元**: このドキュメントからコードをコピー
2. **Capabilities 追加**: Project > Signing & Capabilities > + > AlarmKit
3. **Info.plist 追加**: `NSAlarmCapabilityRequestedReason`
4. **ビルド確認**: `#if canImport(AlarmKit)` で iOS 26+ のみ有効

---

## UserDefaults キー

| キー | 用途 |
|------|------|
| `com.anicca.alarmkit.cantWakeUp.primaryId` | Primary アラーム UUID |
| `com.anicca.alarmkit.cantWakeUp.followupId` | Followup アラーム UUID |

---

アーカイブ日: 2026-01-24
