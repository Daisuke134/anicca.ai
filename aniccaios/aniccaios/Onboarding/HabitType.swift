import Foundation
#if canImport(AppIntents)
import AppIntents
#endif

enum HabitType: String, Codable, CaseIterable, Sendable {
    case wake
    case training
    case bedtime

    var title: String {
        switch self {
        case .wake:
            return String(localized: "habit_title_wake")
        case .training:
            return String(localized: "habit_title_training")
        case .bedtime:
            return String(localized: "habit_title_bedtime")
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
        }
    }
}

#if canImport(AppIntents)
@available(iOS 16.0, *)
extension HabitType: AppEnum {
    nonisolated static var typeDisplayRepresentation: TypeDisplayRepresentation {
        .init(name: "Habit Type")
    }

    nonisolated static var caseDisplayRepresentations: [HabitType: DisplayRepresentation] {
        [
            .wake: .init(title: "Wake", subtitle: "朝の起床習慣"),
            .training: .init(title: "Training", subtitle: "トレーニング習慣"),
            .bedtime: .init(title: "Bedtime", subtitle: "就寝習慣")
        ]
    }
}
#endif

