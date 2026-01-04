import Foundation
import SuperwallKit
import RevenueCat

/// Superwall Placement イベント名
enum SuperwallPlacement: String {
    case onboardingComplete = "onboarding_complete"
    case sessionComplete1 = "session_complete_1"
    case sessionComplete3 = "session_complete_3"
    case campaignAppLaunch = "campaign_app_launch"
    case profilePlanTap = "profile_plan_tap"
}

/// Superwall統合マネージャー
final class SuperwallManager {
    static let shared = SuperwallManager()
    private var purchaseController: RCPurchaseController?
    
    private init() {}
    
    /// Superwallを初期化（RevenueCat設定後に呼び出すこと）
    func configure() {
        let controller = RCPurchaseController()
        purchaseController = controller
        
        Superwall.configure(
            apiKey: AppConfig.superwallAPIKey,
            purchaseController: controller
        )
        
        // RevenueCatのサブスクリプション状態をSuperwallに同期
        controller.syncSubscriptionStatus()
    }
    
    /// ユーザーを識別
    func identify(userId: String) {
        Superwall.shared.identify(userId: userId)
    }
    
    /// ユーザーをリセット（ログアウト時）
    func reset() {
        Superwall.shared.reset()
    }
    
    /// Placementを登録してPaywallを表示
    func register(placement: String) {
        Superwall.shared.register(placement: placement)
    }
}

