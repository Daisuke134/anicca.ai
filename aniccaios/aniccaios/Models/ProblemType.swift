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

    /// 通知タイミング（時刻の配列）- 行動科学リサーチに基づく最適スロット
    /// v1.6.0: 頻度リデザイン - 1問題あたり3回/日（夜更かしのみ5回）、最低15分間隔
    var notificationSchedule: [(hour: Int, minute: Int)] {
        switch self {
        case .stayingUpLate:
            // 夜間集中介入が必要なため5スロット維持
            return [(20, 0), (22, 0), (23, 30), (0, 0), (1, 0)]
        case .cantWakeUp:
            return [(6, 0), (6, 45), (7, 15)]
        case .selfLoathing:
            return [(8, 0), (13, 0), (19, 0)]
        case .rumination:
            return [(8, 30), (14, 0), (21, 0)]
        case .procrastination:
            return [(9, 15), (13, 30), (17, 0)]
        case .anxiety:
            return [(7, 30), (12, 15), (18, 45)]
        case .lying:
            return [(8, 15), (13, 15), (18, 15)]
        case .badMouthing:
            return [(9, 30), (14, 30), (19, 30)]
        case .pornAddiction:
            // 夜更かしとスロット重複を避けるため3スロット
            return [(20, 30), (22, 30), (23, 45)]
        case .alcoholDependency:
            return [(16, 0), (18, 0), (20, 15)]
        case .anger:
            return [(7, 45), (12, 30), (17, 30)]
        case .obsessive:
            return [(9, 0), (13, 45), (18, 30)]
        case .loneliness:
            return [(10, 0), (15, 0), (19, 45)]
        }
    }

    /// 有効な通知時間帯（時間帯制限がある問題のみ）
    /// - Returns: (startHour, startMinute, endHour, endMinute) or nil if no restriction
    var validTimeRange: (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int)? {
        switch self {
        case .stayingUpLate, .pornAddiction:
            // Deep night allowed: peak 22:00-01:30 intervention is core
            // endMinute is exclusive, so 1:31 includes 1:30 slot
            return (startHour: 6, startMinute: 0, endHour: 1, endMinute: 31)
        default:
            // Non-sleep problems: 6:00-23:00 only
            return (startHour: 6, startMinute: 0, endHour: 23, endMinute: 0)
        }
    }

    /// 指定時刻がこの問題の有効時間帯内かどうか
    func isValidTime(hour: Int, minute: Int) -> Bool {
        guard let range = validTimeRange else { return true }
        let timeMinutes = hour * 60 + minute
        let startMinutes = range.startHour * 60 + range.startMinute
        let endMinutes = range.endHour * 60 + range.endMinute

        if endMinutes < startMinutes {
            // Crosses midnight (e.g., 6:00-01:30)
            return timeMinutes >= startMinutes || timeMinutes < endMinutes
        } else {
            // Same day (e.g., 6:00-23:00)
            return timeMinutes >= startMinutes && timeMinutes < endMinutes
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
        case .stayingUpLate:
            return 10
        default:
            return 8
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
