import Foundation

enum HabitType: String, Codable, CaseIterable {
    case wake
    case training
    case bedtime

    var title: String {
        switch self {
        case .wake:
            return "Wake Up"
        case .training:
            return "Training"
        case .bedtime:
            return "Bedtime"
        }
    }

    var detail: String {
        switch self {
        case .wake:
            return "Get woken up at your preferred time"
        case .training:
            return "Reminders to start your workout"
        case .bedtime:
            return "Gentle reminders to wind down and sleep"
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

