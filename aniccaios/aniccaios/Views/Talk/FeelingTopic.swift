import Foundation

/// Talk/Session 共通のトピックID（v3-ui の topic 名に合わせて固定）
enum FeelingTopic: String, CaseIterable, Hashable, Identifiable {
    case selfLoathing = "self_loathing"
    case anxiety = "anxiety"
    case irritation = "irritation"
    case freeConversation = "free_conversation"

    var id: String { rawValue }
}

