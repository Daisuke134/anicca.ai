import Foundation

/// 1枚画面カードで表示するNudgeコンテンツ
struct NudgeContent: Identifiable {
    let id = UUID()
    let problemType: ProblemType
    let notificationText: String
    let detailText: String
    let variantIndex: Int

    /// 問題タイプから通知文言と詳細文言を取得
    static func content(for problem: ProblemType, variantIndex: Int = 0) -> NudgeContent {
        let messages = notificationMessages(for: problem)
        let details = detailMessages(for: problem)
        let index = variantIndex % max(1, messages.count)

        return NudgeContent(
            problemType: problem,
            notificationText: messages[safe: index] ?? messages[0],
            detailText: details[safe: index] ?? details[0],
            variantIndex: index
        )
    }

    /// 日付ベースでローテーション
    static func contentForToday(for problem: ProblemType) -> NudgeContent {
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let messages = notificationMessages(for: problem)
        let index = (dayOfYear - 1) % max(1, messages.count)
        return content(for: problem, variantIndex: index)
    }
}

// MARK: - Notification Messages
extension NudgeContent {
    /// 通知文言（スペックに基づく）
    static func notificationMessages(for problem: ProblemType) -> [String] {
        switch problem {
        case .stayingUpLate:
            return [
                NSLocalizedString("nudge_staying_up_late_notification_1", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_2", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_3", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_4", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_5", comment: "")
            ]
        case .cantWakeUp:
            return [
                NSLocalizedString("nudge_cant_wake_up_notification_1", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_2", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_3", comment: "")
            ]
        case .selfLoathing:
            return [
                NSLocalizedString("nudge_self_loathing_notification_1", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_2", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_3", comment: "")
            ]
        case .rumination:
            return [
                NSLocalizedString("nudge_rumination_notification_1", comment: ""),
                NSLocalizedString("nudge_rumination_notification_2", comment: ""),
                NSLocalizedString("nudge_rumination_notification_3", comment: "")
            ]
        case .procrastination:
            return [
                NSLocalizedString("nudge_procrastination_notification_1", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_2", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_3", comment: "")
            ]
        case .anxiety:
            return [
                NSLocalizedString("nudge_anxiety_notification_1", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_2", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_3", comment: "")
            ]
        case .lying:
            return [
                NSLocalizedString("nudge_lying_notification_1", comment: "")
            ]
        case .badMouthing:
            return [
                NSLocalizedString("nudge_bad_mouthing_notification_1", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_2", comment: "")
            ]
        case .pornAddiction:
            return [
                NSLocalizedString("nudge_porn_addiction_notification_1", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_2", comment: "")
            ]
        case .alcoholDependency:
            return [
                NSLocalizedString("nudge_alcohol_dependency_notification_1", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_2", comment: "")
            ]
        case .anger:
            return [
                NSLocalizedString("nudge_anger_notification_1", comment: ""),
                NSLocalizedString("nudge_anger_notification_2", comment: "")
            ]
        case .obsessive:
            return [
                NSLocalizedString("nudge_obsessive_notification_1", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_2", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_3", comment: "")
            ]
        case .loneliness:
            return [
                NSLocalizedString("nudge_loneliness_notification_1", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_2", comment: "")
            ]
        }
    }

    /// 1枚画面の詳細説明文（スペックに基づく）
    static func detailMessages(for problem: ProblemType) -> [String] {
        switch problem {
        case .stayingUpLate:
            return [
                NSLocalizedString("nudge_staying_up_late_detail_1", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_2", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_3", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_4", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_5", comment: "")
            ]
        case .cantWakeUp:
            return [
                NSLocalizedString("nudge_cant_wake_up_detail_1", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_2", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_3", comment: "")
            ]
        case .selfLoathing:
            return [
                NSLocalizedString("nudge_self_loathing_detail_1", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_2", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_3", comment: "")
            ]
        case .rumination:
            return [
                NSLocalizedString("nudge_rumination_detail_1", comment: ""),
                NSLocalizedString("nudge_rumination_detail_2", comment: ""),
                NSLocalizedString("nudge_rumination_detail_3", comment: "")
            ]
        case .procrastination:
            return [
                NSLocalizedString("nudge_procrastination_detail_1", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_2", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_3", comment: "")
            ]
        case .anxiety:
            return [
                NSLocalizedString("nudge_anxiety_detail_1", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_2", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_3", comment: "")
            ]
        case .lying:
            return [
                NSLocalizedString("nudge_lying_detail_1", comment: "")
            ]
        case .badMouthing:
            return [
                NSLocalizedString("nudge_bad_mouthing_detail_1", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_2", comment: "")
            ]
        case .pornAddiction:
            return [
                NSLocalizedString("nudge_porn_addiction_detail_1", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_2", comment: "")
            ]
        case .alcoholDependency:
            return [
                NSLocalizedString("nudge_alcohol_dependency_detail_1", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_2", comment: "")
            ]
        case .anger:
            return [
                NSLocalizedString("nudge_anger_detail_1", comment: ""),
                NSLocalizedString("nudge_anger_detail_2", comment: "")
            ]
        case .obsessive:
            return [
                NSLocalizedString("nudge_obsessive_detail_1", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_2", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_3", comment: "")
            ]
        case .loneliness:
            return [
                NSLocalizedString("nudge_loneliness_detail_1", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_2", comment: "")
            ]
        }
    }
}

// MARK: - Safe Array Access
private extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}
