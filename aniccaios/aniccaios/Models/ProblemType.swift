import Foundation

/// Proactive Agent: 13個の問題タイプ
enum ProblemType: String, Codable, CaseIterable, Sendable {
    case stayingUpLate = "staying_up_late"
    case cantWakeUp = "cant_wake_up"
    case selfLoathing = "self_loathing"
    case rumination = "rumination"
    case procrastination = "procrastination"
    case anxiety = "anxiety"
    case lying = "lying"
    case badMouthing = "bad_mouthing"
    case pornAddiction = "porn_addiction"
    case alcoholDependency = "alcohol_dependency"
    case anger = "anger"
    case obsessive = "obsessive"
    case loneliness = "loneliness"

    /// ローカライズされた表示名
    var displayName: String {
        NSLocalizedString("problem_\(self.rawValue)", comment: "")
    }

    /// この問題が対応するHabitType（関連する場合）
    var relatedHabitType: HabitType? {
        switch self {
        case .stayingUpLate:
            return .bedtime
        case .cantWakeUp:
            return .wake
        default:
            return nil
        }
    }

    /// 通知タイミング（時刻の配列）
    var notificationSchedule: [(hour: Int, minute: Int)] {
        switch self {
        case .stayingUpLate:
            return [(21, 0), (22, 30), (0, 0), (1, 0)]
        case .cantWakeUp:
            // 6:00と6:05の2回（起床支援）
            return [(6, 0), (6, 5)]
        case .selfLoathing:
            return [(7, 0), (12, 30), (21, 30)]
        case .rumination:
            return [(7, 30), (14, 0), (21, 0)]
        case .procrastination:
            return [(9, 0), (14, 30)]
        case .anxiety:
            return [(7, 0), (12, 0), (18, 30)]
        case .lying:
            return [(8, 0)]
        case .badMouthing:
            return [(8, 30), (12, 0)]
        case .pornAddiction:
            return [(22, 0), (6, 30)]
        case .alcoholDependency:
            return [(18, 0), (20, 30)]
        case .anger:
            return [(9, 30), (18, 0)]
        case .obsessive:
            return [(9, 0), (15, 30), (21, 0)]
        case .loneliness:
            return [(12, 0), (20, 0)]
        }
    }

    /// 1択ボタンか2択ボタンか
    var hasSingleButton: Bool {
        switch self {
        case .selfLoathing, .anxiety, .loneliness:
            return true
        default:
            return false
        }
    }

    /// ポジティブボタンのテキスト（左側）
    var positiveButtonText: String {
        NSLocalizedString("problem_\(self.rawValue)_positive_button", comment: "")
    }

    /// ネガティブボタンのテキスト（右側）- hasSingleButton がtrueの場合はnil
    var negativeButtonText: String? {
        guard !hasSingleButton else { return nil }
        return NSLocalizedString("problem_\(self.rawValue)_negative_button", comment: "")
    }

    /// アイコン
    var icon: String {
        switch self {
        case .stayingUpLate:
            return "🌙"
        case .cantWakeUp:
            return "☀️"
        case .selfLoathing:
            return "🤍"
        case .rumination:
            return "💭"
        case .procrastination:
            return "⏰"
        case .anxiety:
            return "🌊"
        case .lying:
            return "🤥"
        case .badMouthing:
            return "💬"
        case .pornAddiction:
            return "🚫"
        case .alcoholDependency:
            return "🍺"
        case .anger:
            return "🔥"
        case .obsessive:
            return "🔄"
        case .loneliness:
            return "💙"
        }
    }

    /// 通知文言のバリアント数
    var notificationVariantCount: Int {
        switch self {
        case .stayingUpLate, .cantWakeUp, .selfLoathing, .obsessive:
            return 3
        case .rumination, .procrastination, .anxiety, .badMouthing, .pornAddiction, .alcoholDependency, .anger, .loneliness:
            return 2
        case .lying:
            return 1
        }
    }

    /// 問題タイプから初期化（rawValueから）
    static func from(rawValue: String) -> ProblemType? {
        return ProblemType(rawValue: rawValue)
    }
}

// MARK: - Nudge Content
extension ProblemType {
    /// 通知タイトル（問題に関連）
    var notificationTitle: String {
        NSLocalizedString("problem_\(self.rawValue)_notification_title", comment: "")
    }
}
