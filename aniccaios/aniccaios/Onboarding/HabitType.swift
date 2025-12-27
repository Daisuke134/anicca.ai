import Foundation
#if canImport(AppIntents)
import AppIntents
#endif

enum HabitType: String, Codable, CaseIterable, Sendable {
    case wake
    case training
    case bedtime
    case custom

    var title: String {
        switch self {
        case .wake:
            return String(localized: "habit_title_wake")
        case .training:
            return String(localized: "habit_title_training")
        case .bedtime:
            return String(localized: "habit_title_bedtime")
        case .custom:
            return CustomHabitStore.shared.displayName(
                fallback: String(localized: "habit_title_custom_fallback")
            )
        }
    }

    var detail: String {
        switch self {
        case .wake:
            return String(localized: "habit_detail_wake")
        case .training:
            return String(localized: "habit_detail_training")
        case .bedtime:
            return String(localized: "habit_detail_bedtime")
        case .custom:
            return String(localized: "habit_detail_custom")
        }
    }

    var defaultTime: DateComponents {
        var components = DateComponents()
        switch self {
        case .wake:
            components.hour = 6
            components.minute = 0
        case .training:
            components.hour = 22
            components.minute = 0
        case .bedtime:
            components.hour = 23
            components.minute = 0
        case .custom:
            components.hour = 7
            components.minute = 0
        }
        return components
    }

    var notificationIdentifier: String {
        switch self {
        case .wake:
            return "habit.wake"
        case .training:
            return "habit.training"
        case .bedtime:
            return "habit.bedtime"
        case .custom:
            return "habit.custom"
        }
    }

    var promptFileName: String {
        switch self {
        case .wake:
            return "wake_up"
        case .training:
            return "training"
        case .bedtime:
            return "bedtime"
        case .custom:
            return "custom"
        }
    }
}

#if canImport(AppIntents)
@available(iOS 16.0, *)
extension HabitType: AppEnum {
    nonisolated static var typeDisplayRepresentation: TypeDisplayRepresentation {
        .init(name: LocalizedStringResource("Habit Type"))
    }

    nonisolated static var caseDisplayRepresentations: [HabitType: DisplayRepresentation] {
        [
            .wake: .init(
                title: LocalizedStringResource("habit_title_wake"),
                subtitle: LocalizedStringResource("habit_detail_wake")
            ),
            .training: .init(
                title: LocalizedStringResource("habit_title_training"),
                subtitle: LocalizedStringResource("habit_detail_training")
            ),
            .bedtime: .init(
                title: LocalizedStringResource("habit_title_bedtime"),
                subtitle: LocalizedStringResource("habit_detail_bedtime")
            ),
            .custom: .init(
                title: LocalizedStringResource("habit_title_custom_fallback"),
                subtitle: LocalizedStringResource("habit_detail_custom")
            )
        ]
    }
}
#endif


