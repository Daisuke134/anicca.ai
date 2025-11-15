import Foundation

struct SubscriptionInfo: Codable, Equatable {
    enum Plan: String, Codable { case free, grace, pro }
    var plan: Plan
    var status: String
    var currentPeriodEnd: Date?
    var managementURL: URL?
    var lastSyncedAt: Date
    var isEntitled: Bool { plan == .pro && status != "expired" }
    static let free = SubscriptionInfo(plan: .free, status: "free", currentPeriodEnd: nil, managementURL: nil, lastSyncedAt: .now)
}


