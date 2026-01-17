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
        String(localized: "problem_\(self.rawValue)")
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
            return [(21, 0), (22, 30)]
        case .cantWakeUp:
            // アラームとして6:00に設定（デフォルト時刻と連動）
            return [(6, 0)]
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
        switch self {
        case .stayingUpLate:
            return "明日を守る 💪"
        case .cantWakeUp:
            return "今日を始める ☀️"
        case .selfLoathing:
            return "自分を許す 🤍"
        case .rumination:
            return "今に戻る 🧘"
        case .procrastination:
            return "5分やる ⚡"
        case .anxiety:
            return "深呼吸する 🌬️"
        case .lying:
            return "誠実でいる 🤝"
        case .badMouthing:
            return "善い言葉を使う 💬"
        case .pornAddiction:
            return "誘惑に勝つ 💪"
        case .alcoholDependency:
            return "今夜は飲まない 🍵"
        case .anger:
            return "手放す 🕊️"
        case .obsessive:
            return "手放す 🌿"
        case .loneliness:
            return "誰かに連絡する 📱"
        }
    }

    /// ネガティブボタンのテキスト（右側）- hasSingleButton がtrueの場合はnil
    var negativeButtonText: String? {
        guard !hasSingleButton else { return nil }
        switch self {
        case .stayingUpLate:
            return "傷つける"
        case .cantWakeUp:
            return "逃げる"
        case .rumination:
            return "考え続ける"
        case .procrastination:
            return "後回し"
        case .lying:
            return "嘘をつく"
        case .badMouthing:
            return "悪口を言う"
        case .pornAddiction:
            return "負ける"
        case .alcoholDependency:
            return "飲む"
        case .anger:
            return "怒り続ける"
        case .obsessive:
            return "考え続ける"
        default:
            return nil
        }
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
        switch self {
        case .stayingUpLate:
            return "就寝"
        case .cantWakeUp:
            return "起床"
        case .selfLoathing:
            return "Self-Compassion"
        case .rumination:
            return "今ここに"
        case .procrastination:
            return "今すぐ"
        case .anxiety:
            return "安心"
        case .lying:
            return "誠実"
        case .badMouthing:
            return "善い言葉"
        case .pornAddiction:
            return "克服"
        case .alcoholDependency:
            return "禁酒"
        case .anger:
            return "平静"
        case .obsessive:
            return "解放"
        case .loneliness:
            return "つながり"
        }
    }
}
