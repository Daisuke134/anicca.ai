import Foundation
import OSLog

enum AppConfig {
    private static let proxyBaseKey = "ANICCA_PROXY_BASE_URL"
    private static let revenueCatAPIKeyKey = "REVENUECAT_API_KEY"
    private static let revenueCatEntitlementKey = "REVENUECAT_ENTITLEMENT_ID"
    private static let revenueCatPaywallKey = "REVENUECAT_PAYWALL_ID"
    private static let revenueCatCustomerCenterKey = "REVENUECAT_CUSTOMER_CENTER_ID"
    private static let mixpanelTokenKey = "MIXPANEL_TOKEN"
    private static let superwallAPIKeyKey = "SUPERWALL_API_KEY"
    private static let singularSDKKeyKey = "SINGULAR_SDK_KEY"
    private static let singularSDKSecretKey = "SINGULAR_SDK_SECRET"
    private static let logger = Logger(subsystem: "com.anicca.ios", category: "AppConfig")

    private static func infoValue(for key: String) -> String {
        guard let raw = Bundle.main.infoDictionary?[key] as? String else {
            logger.fault("Missing Info.plist key: \(key, privacy: .public)")
            fatalError("Missing Info.plist key: \(key)")
        }

        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            logger.fault("Empty Info.plist value for key: \(key, privacy: .public)")
            fatalError("Empty Info.plist value for key: \(key)")
        }
        return trimmed
    }

    static var proxyBaseURL: URL {
        let value = infoValue(for: proxyBaseKey)
        guard let url = URL(string: value) else {
            logger.fault("Invalid proxy base URL: \(value, privacy: .public)")
            fatalError("Invalid proxy base URL")
        }
        return url
    }

    static var realtimeSessionURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/realtime/session")
    }
    
    static var realtimeSessionStopURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/realtime/session/stop")
    }
    
    static var appleAuthURL: URL {
        proxyBaseURL.appendingPathComponent("auth/apple")
    }
    
    static var profileSyncURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/profile")
    }
    
    // v0.3 (phase-7) daily aggregates upload.
    static var dailyMetricsURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/daily_metrics")
    }
    
    static var revenueCatAPIKey: String { infoValue(for: revenueCatAPIKeyKey) }
    static var revenueCatEntitlementId: String { infoValue(for: revenueCatEntitlementKey) }
    static var revenueCatPaywallId: String { infoValue(for: revenueCatPaywallKey) }
    static var revenueCatCustomerCenterId: String { infoValue(for: revenueCatCustomerCenterKey) }
    static var mixpanelToken: String { infoValue(for: mixpanelTokenKey) }
    static var superwallAPIKey: String { infoValue(for: superwallAPIKeyKey) }
    static var singularSDKKey: String { infoValue(for: singularSDKKeyKey) }
    static var singularSDKSecret: String { infoValue(for: singularSDKSecretKey) }
    static var entitlementSyncURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/entitlement")
    }

    // MARK: - v0.3 Nudge / Feeling
    static var nudgeTriggerURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/nudge/trigger")
    }

    static var nudgeFeedbackURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/nudge/feedback")
    }

    static var feelingStartURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/feeling/start")
    }

    static var feelingEndURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/feeling/end")
    }

    // Phase 6: LLM生成Nudge
    static var nudgeTodayURL: URL {
        proxyBaseURL.appendingPathComponent("mobile/nudge/today")
    }
}
