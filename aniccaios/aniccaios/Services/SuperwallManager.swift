import Foundation
import SuperwallKit
import RevenueCat

/// Superwall Placement イベント名
enum SuperwallPlacement: String {
    case onboardingComplete = "onboarding_complete"
    case nudgeCardComplete5 = "nudge_card_complete_5"
    case nudgeCardComplete10 = "nudge_card_complete_10"
    case profilePlanTap = "profile_plan_tap"
}

/// Superwall統合マネージャー
@MainActor
final class SuperwallManager: NSObject {
    static let shared = SuperwallManager()
    private var purchaseController: RCPurchaseController?
    
    /// オンボーディング直後のPaywallかどうかを判定するフラグ
    private var isOnboardingPaywall = false
    
    private override init() {
        super.init()
    }
    
    /// Superwallを初期化（RevenueCat設定後に呼び出すこと）
    func configure() {
        let controller = RCPurchaseController()
        purchaseController = controller

        Superwall.configure(
            apiKey: AppConfig.superwallAPIKey,
            purchaseController: controller
        )

        // Delegateを設定
        Superwall.shared.delegate = self

        // RevenueCatのサブスクリプション状態をSuperwallに同期
        controller.syncSubscriptionStatus()

        // 最新のペイウォールをプリロード
        Task {
            await Superwall.shared.preloadAllPaywalls()
        }
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
        // オンボーディング完了後のPaywallかどうかをフラグで記録
        isOnboardingPaywall = (placement == SuperwallPlacement.onboardingComplete.rawValue)
        Superwall.shared.register(placement: placement)
    }
}

// MARK: - SuperwallDelegate
extension SuperwallManager: SuperwallDelegate {
    
    /// Paywall表示後に呼ばれる
    nonisolated func didPresentPaywall(withInfo paywallInfo: PaywallInfo) {
        Task { @MainActor in
            if isOnboardingPaywall {
                AnalyticsManager.shared.track(.onboardingPaywallViewed)
            }
        }
    }
    
    /// Paywall閉じた後に呼ばれる
    nonisolated func didDismissPaywall(withInfo paywallInfo: PaywallInfo) {
        Task { @MainActor in
            if isOnboardingPaywall {
                AnalyticsManager.shared.track(.onboardingPaywallDismissed)
                isOnboardingPaywall = false  // フラグをリセット
            }
        }
    }
    
    /// Superwallの全イベントを受け取る（購入完了検知用）
    nonisolated func handleSuperwallEvent(withInfo eventInfo: SuperwallEventInfo) {
        switch eventInfo.event {
        case .transactionComplete(_, _, _, _):
            // 購入完了
            Task { @MainActor in
                if isOnboardingPaywall {
                    AnalyticsManager.shared.track(.onboardingPaywallPurchased)
                    isOnboardingPaywall = false  // フラグをリセット
                }
            }
        default:
            break
        }
    }
}

