import Foundation

/// 1枚画面カードで表示するNudgeコンテンツ
struct NudgeContent: Identifiable {
    let id = UUID()
    let problemType: ProblemType
    let notificationText: String
    let detailText: String
    let variantIndex: Int
    let isAIGenerated: Bool
    let llmNudgeId: String?

    /// 問題タイプから通知文言と詳細文言を取得
    static func content(for problem: ProblemType, variantIndex: Int = 0) -> NudgeContent {
        let messages = notificationMessages(for: problem)
        let details = detailMessages(for: problem)
        let index = variantIndex % max(1, messages.count)

        return NudgeContent(
            problemType: problem,
            notificationText: messages[safe: index] ?? messages[0],
            detailText: details[safe: index] ?? details[0],
            variantIndex: index,
            isAIGenerated: false,
            llmNudgeId: nil
        )
    }

    /// 日付ベースでローテーション
    static func contentForToday(for problem: ProblemType) -> NudgeContent {
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let messages = notificationMessages(for: problem)
        let index = (dayOfYear - 1) % max(1, messages.count)
        return content(for: problem, variantIndex: index)
    }

    /// LLM生成NudgeからNudgeContentを作成
    static func content(from llmNudge: LLMGeneratedNudge) -> NudgeContent {
        return NudgeContent(
            problemType: llmNudge.problemType,
            notificationText: llmNudge.hook,
            detailText: llmNudge.content,
            variantIndex: -1,  // LLM生成の場合は-1
            isAIGenerated: true,
            llmNudgeId: llmNudge.id
        )
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
                NSLocalizedString("nudge_staying_up_late_notification_5", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_6", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_7", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_8", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_9", comment: ""),
                NSLocalizedString("nudge_staying_up_late_notification_10", comment: "")
            ]
        case .cantWakeUp:
            return [
                NSLocalizedString("nudge_cant_wake_up_notification_1", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_2", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_3", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_4", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_5", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_6", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_7", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_notification_8", comment: "")
            ]
        case .selfLoathing:
            return [
                NSLocalizedString("nudge_self_loathing_notification_1", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_2", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_3", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_4", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_5", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_6", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_7", comment: ""),
                NSLocalizedString("nudge_self_loathing_notification_8", comment: "")
            ]
        case .rumination:
            return [
                NSLocalizedString("nudge_rumination_notification_1", comment: ""),
                NSLocalizedString("nudge_rumination_notification_2", comment: ""),
                NSLocalizedString("nudge_rumination_notification_3", comment: ""),
                NSLocalizedString("nudge_rumination_notification_4", comment: ""),
                NSLocalizedString("nudge_rumination_notification_5", comment: ""),
                NSLocalizedString("nudge_rumination_notification_6", comment: ""),
                NSLocalizedString("nudge_rumination_notification_7", comment: ""),
                NSLocalizedString("nudge_rumination_notification_8", comment: "")
            ]
        case .procrastination:
            return [
                NSLocalizedString("nudge_procrastination_notification_1", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_2", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_3", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_4", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_5", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_6", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_7", comment: ""),
                NSLocalizedString("nudge_procrastination_notification_8", comment: "")
            ]
        case .anxiety:
            return [
                NSLocalizedString("nudge_anxiety_notification_1", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_2", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_3", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_4", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_5", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_6", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_7", comment: ""),
                NSLocalizedString("nudge_anxiety_notification_8", comment: "")
            ]
        case .lying:
            return [
                NSLocalizedString("nudge_lying_notification_1", comment: ""),
                NSLocalizedString("nudge_lying_notification_2", comment: ""),
                NSLocalizedString("nudge_lying_notification_3", comment: ""),
                NSLocalizedString("nudge_lying_notification_4", comment: ""),
                NSLocalizedString("nudge_lying_notification_5", comment: ""),
                NSLocalizedString("nudge_lying_notification_6", comment: ""),
                NSLocalizedString("nudge_lying_notification_7", comment: ""),
                NSLocalizedString("nudge_lying_notification_8", comment: "")
            ]
        case .badMouthing:
            return [
                NSLocalizedString("nudge_bad_mouthing_notification_1", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_2", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_3", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_4", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_5", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_6", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_7", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_notification_8", comment: "")
            ]
        case .pornAddiction:
            return [
                NSLocalizedString("nudge_porn_addiction_notification_1", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_2", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_3", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_4", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_5", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_6", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_7", comment: ""),
                NSLocalizedString("nudge_porn_addiction_notification_8", comment: "")
            ]
        case .alcoholDependency:
            return [
                NSLocalizedString("nudge_alcohol_dependency_notification_1", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_2", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_3", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_4", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_5", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_6", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_7", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_notification_8", comment: "")
            ]
        case .anger:
            return [
                NSLocalizedString("nudge_anger_notification_1", comment: ""),
                NSLocalizedString("nudge_anger_notification_2", comment: ""),
                NSLocalizedString("nudge_anger_notification_3", comment: ""),
                NSLocalizedString("nudge_anger_notification_4", comment: ""),
                NSLocalizedString("nudge_anger_notification_5", comment: ""),
                NSLocalizedString("nudge_anger_notification_6", comment: ""),
                NSLocalizedString("nudge_anger_notification_7", comment: ""),
                NSLocalizedString("nudge_anger_notification_8", comment: "")
            ]
        case .obsessive:
            return [
                NSLocalizedString("nudge_obsessive_notification_1", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_2", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_3", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_4", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_5", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_6", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_7", comment: ""),
                NSLocalizedString("nudge_obsessive_notification_8", comment: "")
            ]
        case .loneliness:
            return [
                NSLocalizedString("nudge_loneliness_notification_1", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_2", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_3", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_4", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_5", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_6", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_7", comment: ""),
                NSLocalizedString("nudge_loneliness_notification_8", comment: "")
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
                NSLocalizedString("nudge_staying_up_late_detail_5", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_6", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_7", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_8", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_9", comment: ""),
                NSLocalizedString("nudge_staying_up_late_detail_10", comment: "")
            ]
        case .cantWakeUp:
            return [
                NSLocalizedString("nudge_cant_wake_up_detail_1", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_2", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_3", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_4", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_5", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_6", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_7", comment: ""),
                NSLocalizedString("nudge_cant_wake_up_detail_8", comment: "")
            ]
        case .selfLoathing:
            return [
                NSLocalizedString("nudge_self_loathing_detail_1", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_2", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_3", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_4", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_5", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_6", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_7", comment: ""),
                NSLocalizedString("nudge_self_loathing_detail_8", comment: "")
            ]
        case .rumination:
            return [
                NSLocalizedString("nudge_rumination_detail_1", comment: ""),
                NSLocalizedString("nudge_rumination_detail_2", comment: ""),
                NSLocalizedString("nudge_rumination_detail_3", comment: ""),
                NSLocalizedString("nudge_rumination_detail_4", comment: ""),
                NSLocalizedString("nudge_rumination_detail_5", comment: ""),
                NSLocalizedString("nudge_rumination_detail_6", comment: ""),
                NSLocalizedString("nudge_rumination_detail_7", comment: ""),
                NSLocalizedString("nudge_rumination_detail_8", comment: "")
            ]
        case .procrastination:
            return [
                NSLocalizedString("nudge_procrastination_detail_1", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_2", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_3", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_4", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_5", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_6", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_7", comment: ""),
                NSLocalizedString("nudge_procrastination_detail_8", comment: "")
            ]
        case .anxiety:
            return [
                NSLocalizedString("nudge_anxiety_detail_1", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_2", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_3", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_4", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_5", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_6", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_7", comment: ""),
                NSLocalizedString("nudge_anxiety_detail_8", comment: "")
            ]
        case .lying:
            return [
                NSLocalizedString("nudge_lying_detail_1", comment: ""),
                NSLocalizedString("nudge_lying_detail_2", comment: ""),
                NSLocalizedString("nudge_lying_detail_3", comment: ""),
                NSLocalizedString("nudge_lying_detail_4", comment: ""),
                NSLocalizedString("nudge_lying_detail_5", comment: ""),
                NSLocalizedString("nudge_lying_detail_6", comment: ""),
                NSLocalizedString("nudge_lying_detail_7", comment: ""),
                NSLocalizedString("nudge_lying_detail_8", comment: "")
            ]
        case .badMouthing:
            return [
                NSLocalizedString("nudge_bad_mouthing_detail_1", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_2", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_3", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_4", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_5", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_6", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_7", comment: ""),
                NSLocalizedString("nudge_bad_mouthing_detail_8", comment: "")
            ]
        case .pornAddiction:
            return [
                NSLocalizedString("nudge_porn_addiction_detail_1", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_2", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_3", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_4", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_5", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_6", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_7", comment: ""),
                NSLocalizedString("nudge_porn_addiction_detail_8", comment: "")
            ]
        case .alcoholDependency:
            return [
                NSLocalizedString("nudge_alcohol_dependency_detail_1", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_2", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_3", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_4", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_5", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_6", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_7", comment: ""),
                NSLocalizedString("nudge_alcohol_dependency_detail_8", comment: "")
            ]
        case .anger:
            return [
                NSLocalizedString("nudge_anger_detail_1", comment: ""),
                NSLocalizedString("nudge_anger_detail_2", comment: ""),
                NSLocalizedString("nudge_anger_detail_3", comment: ""),
                NSLocalizedString("nudge_anger_detail_4", comment: ""),
                NSLocalizedString("nudge_anger_detail_5", comment: ""),
                NSLocalizedString("nudge_anger_detail_6", comment: ""),
                NSLocalizedString("nudge_anger_detail_7", comment: ""),
                NSLocalizedString("nudge_anger_detail_8", comment: "")
            ]
        case .obsessive:
            return [
                NSLocalizedString("nudge_obsessive_detail_1", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_2", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_3", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_4", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_5", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_6", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_7", comment: ""),
                NSLocalizedString("nudge_obsessive_detail_8", comment: "")
            ]
        case .loneliness:
            return [
                NSLocalizedString("nudge_loneliness_detail_1", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_2", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_3", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_4", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_5", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_6", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_7", comment: ""),
                NSLocalizedString("nudge_loneliness_detail_8", comment: "")
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
