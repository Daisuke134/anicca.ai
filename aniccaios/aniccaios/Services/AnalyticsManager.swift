import Foundation
import Mixpanel
import OSLog

/// アプリ全体のアナリティクスを管理するシングルトン
/// Jake Mor's Tip #1: "Most important metric is App Install → Paywall View"
@MainActor
final class AnalyticsManager {
    static let shared = AnalyticsManager()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Analytics")
    
    private init() {}
    
    // MARK: - Configuration
    
    func configure() {
        let token = AppConfig.mixpanelToken
        // trackAutomaticEvents: false (公式推奨 - クライアントサイドの自動イベントは信頼性が低い)
        Mixpanel.initialize(token: token, trackAutomaticEvents: false)
        
        // ログを常時有効化（Debug/Release両方でイベント送信を確認可能）
        Mixpanel.mainInstance().loggingEnabled = true
        
        logger.info("Mixpanel initialized")
    }
    
    /// ユーザーIDを設定（ログイン時に呼び出し）
    func identify(userId: String) {
        Mixpanel.mainInstance().identify(distinctId: userId)
        logger.info("Mixpanel identified user: \(userId, privacy: .private(mask: .hash))")
    }
    
    /// ユーザープロファイル情報を設定
    func setUserProperties(_ properties: [String: MixpanelType]) {
        Mixpanel.mainInstance().people.set(properties: properties)
    }
    
    /// 単一のユーザープロパティを設定
    /// - Parameters:
    ///   - key: プロパティキー（例: "acquisition_source", "gender"）
    ///   - value: プロパティ値
    func setUserProperty(_ key: String, value: MixpanelType) {
        Mixpanel.mainInstance().people.set(properties: [key: value])
        logger.debug("Set user property: \(key, privacy: .public)")
    }
    
    /// ログアウト時にリセット
    func reset() {
        Mixpanel.mainInstance().reset()
        logger.info("Mixpanel reset")
    }
    
    // MARK: - Event Tracking
    
    /// 汎用イベントトラッキング
    func track(_ event: AnalyticsEvent, properties: [String: MixpanelType]? = nil) {
        Mixpanel.mainInstance().track(event: event.rawValue, properties: properties)
        logger.debug("Tracked event: \(event.rawValue, privacy: .public)")
    }
    
    // MARK: - Convenience Methods
    
    /// オンボーディングステップ完了
    func trackOnboardingStep(_ step: String, completed: Bool = true) {
        track(.onboardingStepCompleted, properties: [
            "step": step,
            "completed": completed
        ])
    }
    
    /// Paywall表示（最重要メトリクス）
    func trackPaywallViewed(paywallId: String, trigger: String) {
        // Paywall表示回数をインクリメント
        let viewCountKey = "mixpanel_paywall_view_count"
        let viewCount = UserDefaults.standard.integer(forKey: viewCountKey) + 1
        UserDefaults.standard.set(viewCount, forKey: viewCountKey)
        
        track(.paywallViewed, properties: [
            "paywall_id": paywallId,
            "view_count": viewCount,
            "trigger": trigger
        ])
    }
    
    /// Paywall閉じる
    func trackPaywallDismissed(paywallId: String) {
        let viewCountKey = "mixpanel_paywall_view_count"
        let viewCount = UserDefaults.standard.integer(forKey: viewCountKey)
        
        track(.paywallDismissed, properties: [
            "paywall_id": paywallId,
            "view_count": viewCount
        ])
    }
    
    /// トライアル開始
    func trackTrialStarted(productId: String) {
        track(.trialStarted, properties: [
            "product_id": productId
        ])
    }
    
    /// 購入完了
    func trackPurchaseCompleted(productId: String, revenue: Double) {
        track(.purchaseCompleted, properties: [
            "product_id": productId,
            "revenue": revenue
        ])
        
        // Revenue tracking
        Mixpanel.mainInstance().people.trackCharge(amount: revenue)
    }
    
    /// 音声セッション開始
    func trackSessionStarted(habitType: String, customHabitId: String? = nil) {
        var props: [String: MixpanelType] = ["habit_type": habitType]
        if let customId = customHabitId {
            props["custom_habit_id"] = customId
        }
        track(.sessionStarted, properties: props)
    }
    
    /// 音声セッション完了
    func trackSessionCompleted(habitType: String, durationSeconds: Int) {
        track(.sessionCompleted, properties: [
            "habit_type": habitType,
            "duration_seconds": durationSeconds
        ])
    }
}

// MARK: - Analytics Events

enum AnalyticsEvent: String {
    // Onboarding
    case appOpened = "app_opened"
    case onboardingStarted = "onboarding_started"
    case onboardingStepCompleted = "onboarding_step_completed" // 互換性のため残す
    case onboardingCompleted = "onboarding_completed"
    
    // Individual onboarding step events (for clearer Funnel analysis)
    case onboardingWelcomeCompleted = "onboarding_welcome_completed"
    case onboardingAccountCompleted = "onboarding_account_completed"
    case onboardingValueCompleted = "onboarding_value_completed"
    case onboardingSourceCompleted = "onboarding_source_completed"
    case onboardingNameCompleted = "onboarding_name_completed"
    case onboardingGenderCompleted = "onboarding_gender_completed"
    case onboardingAgeCompleted = "onboarding_age_completed"
    case onboardingIdealsCompleted = "onboarding_ideals_completed"
    case onboardingStrugglesCompleted = "onboarding_struggles_completed"
    case onboardingHabitsetupCompleted = "onboarding_habitsetup_completed"
    case onboardingNotificationsCompleted = "onboarding_notifications_completed"
    case onboardingAlarmkitCompleted = "onboarding_alarmkit_completed"
    
    // Paywall (CRITICAL - Jake Mor #1)
    case paywallViewed = "paywall_viewed"
    case paywallDismissed = "paywall_dismissed"
    
    // Onboarding Paywall (Jake Mor #1 - Most Important Metric)
    case onboardingPaywallViewed = "onboarding_paywall_viewed"
    case onboardingPaywallDismissed = "onboarding_paywall_dismissed"
    case onboardingPaywallPurchased = "onboarding_paywall_purchased"
    
    // Subscription
    case trialStarted = "trial_started"
    case trialCancelled = "trial_cancelled"
    case purchaseCompleted = "purchase_completed"
    case subscriptionRenewed = "subscription_renewed"
    case subscriptionCancelled = "subscription_cancelled"
    
    // Voice Session
    case sessionStarted = "session_started"
    case sessionCompleted = "session_completed"
    case sessionFailed = "session_failed"
    
    // Habits
    case habitCreated = "habit_created"
    case habitDeleted = "habit_deleted"
    case habitNotificationTapped = "habit_notification_tapped"
    
    // Engagement
    case talkTabOpened = "talk_tab_opened"
    case settingsOpened = "settings_opened"
}

