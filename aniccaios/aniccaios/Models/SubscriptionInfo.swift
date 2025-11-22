import Foundation

struct SubscriptionInfo: Codable, Equatable {
    enum Plan: String, Codable { case free, grace, pro }
    var plan: Plan
    var status: String
    var currentPeriodEnd: Date?
    var managementURL: URL?
    var lastSyncedAt: Date
    var productIdentifier: String?
    var planDisplayName: String?
    var priceDescription: String?
    var monthlyUsageLimit: Int?
    var monthlyUsageRemaining: Int?
    var monthlyUsageCount: Int?
    var willRenew: Bool?
    
    var isEntitled: Bool { plan != .free && status != "expired" }
    var shouldShowPaywall: Bool { !isEntitled }
    
    static let free = SubscriptionInfo(
        plan: .free,
        status: "free",
        currentPeriodEnd: nil,
        managementURL: nil,
        lastSyncedAt: .now,
        productIdentifier: nil,
        planDisplayName: nil,
        priceDescription: nil,
        monthlyUsageLimit: nil,
        monthlyUsageRemaining: nil,
        monthlyUsageCount: nil,
        willRenew: nil
    )
    
    var displayPlanName: String {
        if let planDisplayName = planDisplayName, !planDisplayName.isEmpty {
            return planDisplayName
        }
        switch plan {
        case .free:
            return NSLocalizedString("settings_subscription_free", comment: "")
        case .grace:
            return NSLocalizedString("settings_subscription_grace", comment: "")
        case .pro:
            return NSLocalizedString("settings_subscription_pro", comment: "")
        }
    }
}


