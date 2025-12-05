#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import Foundation
import OSLog
import SwiftUI

// MARK: - AlarmButton Extension
@available(iOS 26.0, *)
extension AlarmButton {
    static var stopButton: AlarmButton {
        AlarmButton(
            text: LocalizedStringResource("Stop"),
            textColor: .red,
            systemImageName: "stop.circle"
        )
    }
    
    static var openAppButton: AlarmButton {
        AlarmButton(
            text: LocalizedStringResource("Open"),
            textColor: .blue,
            systemImageName: "arrow.up.forward.app"
        )
    }
}

// MARK: - Locale.Weekday Extension
@available(iOS 26.0, *)
extension Locale.Weekday {
    static var allWeekdays: [Locale.Weekday] {
        [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
    }
}

// MARK: - AlarmKitHabitCoordinator
@available(iOS 26.0, *)
final class AlarmKitHabitCoordinator {
    static let shared = AlarmKitHabitCoordinator()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AlarmKitHabit")
    private let manager = AlarmManager.shared
    
    // Storage keys for each habit
    private func storageKey(for habit: HabitType) -> String {
        "com.anicca.alarmkit.\(habit.rawValue).ids"
    }
    
    private init() {}
    
    func requestAuthorizationIfNeeded() async -> Bool {
        do {
            // まず現在の認証状態を確認
            let currentState = manager.authorizationState
            logger.info("Current AlarmKit authorization state: \(String(describing: currentState), privacy: .public)")
            
            if currentState == .authorized {
                return true
            }
            
            if currentState == .denied {
                logger.warning("AlarmKit authorization was denied by user. Please enable in Settings.")
                return false
            }
            
            let state = try await manager.requestAuthorization()
            logger.info("AlarmKit authorization result: \(String(describing: state), privacy: .public)")
            return state == .authorized
        } catch {
            logger.error("AlarmKit authorization failed: \(error.localizedDescription, privacy: .public). Ensure NSAlarmKitUsageDescription is set in Info.plist")
            return false
        }
    }
    
    /// Schedule alarm for a specific habit
    func scheduleHabit(_ habit: HabitType, hour: Int, minute: Int, followupCount: Int) async -> Bool {
        do {
            guard await requestAuthorizationIfNeeded() else {
                return false
            }
            await cancelHabitAlarms(habit)
            
            let iterations = max(1, min(10, followupCount))
            var scheduledIds: [UUID] = []
            
            for offset in 0..<iterations {
                let (fireHour, fireMinute) = offsetMinutes(baseHour: hour, baseMinute: minute, offsetMinutes: offset)
                let time = Alarm.Schedule.Relative.Time(hour: fireHour, minute: fireMinute)
                let schedule = Alarm.Schedule.relative(.init(
                    time: time,
                    repeats: .weekly(Locale.Weekday.allWeekdays)
                ))
                
                let alert = AlarmPresentation.Alert(
                    title: localizedTitle(for: habit),
                    stopButton: .stopButton,
                    secondaryButton: .openAppButton,
                    secondaryButtonBehavior: .custom
                )
                let presentation = AlarmPresentation(alert: alert)
                let metadata = HabitAlarmMetadata(habit: habit.rawValue)
                let tintColor = tintColor(for: habit)
                let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: tintColor)
                
                var secondary = StartConversationIntent()
                secondary.habitType = habit  // HabitType を直接代入（AppEnum に準拠済み）
                
                let identifier = UUID()
                let configuration = AlarmManager.AlarmConfiguration(
                    countdownDuration: nil,
                    schedule: schedule,
                    attributes: attributes,
                    stopIntent: HabitAlarmStopIntent(alarmID: identifier.uuidString, habitRawValue: habit.rawValue),
                    secondaryIntent: secondary
                )
                
                _ = try await manager.schedule(id: identifier, configuration: configuration)
                scheduledIds.append(identifier)
                logger.info("Scheduled AlarmKit \(habit.rawValue) alarm (\(offset + 1)/\(iterations)) at \(fireHour):\(fireMinute)")
            }
            
            persist(ids: scheduledIds, for: habit)
            return true
        } catch {
            logger.error("AlarmKit scheduling failed for \(habit.rawValue): \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
    
    /// Cancel all alarms for a specific habit
    func cancelHabitAlarms(_ habit: HabitType) async {
        let ids = loadPersistedIds(for: habit)
        guard !ids.isEmpty else { return }
        for id in ids {
            do {
                try manager.cancel(id: id)
            } catch {
                logger.error("Failed to cancel AlarmKit alarm \(id.uuidString, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        persist(ids: [], for: habit)
    }
    
    /// Cancel all alarms for all habits
    func cancelAllAlarms() async {
        for habit in HabitType.allCases {
            await cancelHabitAlarms(habit)
        }
    }
    
    // MARK: - Persistence
    
    private func persist(ids: [UUID], for habit: HabitType) {
        let raw = ids.map(\.uuidString)
        UserDefaults.standard.set(raw, forKey: storageKey(for: habit))
    }
    
    private func loadPersistedIds(for habit: HabitType) -> [UUID] {
        guard let stored = UserDefaults.standard.array(forKey: storageKey(for: habit)) as? [String] else {
            return []
        }
        return stored.compactMap(UUID.init(uuidString:))
    }
    
    // MARK: - Helpers
    
    private func offsetMinutes(baseHour: Int, baseMinute: Int, offsetMinutes: Int) -> (Int, Int) {
        let totalMinutes = baseMinute + offsetMinutes
        let minute = totalMinutes % 60
        let hourIncrement = totalMinutes / 60
        let hour = (baseHour + hourIncrement) % 24
        return (hour, minute)
    }
    
    private func localizedTitle(for habit: HabitType) -> LocalizedStringResource {
        switch habit {
        case .wake:
            return LocalizedStringResource("habit_title_wake")
        case .training:
            return LocalizedStringResource("habit_title_training")
        case .bedtime:
            return LocalizedStringResource("habit_title_bedtime")
        case .custom:
            return LocalizedStringResource("habit_title_custom_fallback")
        }
    }
    
    private func tintColor(for habit: HabitType) -> Color {
        switch habit {
        case .wake:
            return .orange
        case .training:
            return .green
        case .bedtime:
            return .indigo
        case .custom:
            return .blue
        }
    }
}

// MARK: - Metadata
@available(iOS 26.0, *)
struct HabitAlarmMetadata: AlarmMetadata {
    let habit: String
}

// MARK: - Stop Intent
@available(iOS 26.0, *)
struct HabitAlarmStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Habit Alarm"
    
    @Parameter(title: "Alarm ID")
    var alarmID: String
    
    @Parameter(title: "Habit Type")
    var habitRawValue: String
    
    init() {
        self.alarmID = ""
        self.habitRawValue = ""
    }
    
    init(alarmID: String, habitRawValue: String) {
        self.alarmID = alarmID
        self.habitRawValue = habitRawValue
    }
    
    func perform() async throws -> some IntentResult {
        if let habit = HabitType(rawValue: habitRawValue) {
            await AlarmKitHabitCoordinator.shared.cancelHabitAlarms(habit)
            NotificationScheduler.shared.cancelHabit(habit)
        }
        return .result()
    }
}
#endif

