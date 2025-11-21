import RevenueCat
import Foundation

@MainActor
final class SubscriptionManager: NSObject {
    static let shared = SubscriptionManager()
    private var offerings: Offerings?
    
    private override init() {
        super.init()
    }
    
    func configure() {
        Purchases.logLevel = .warn
        let apiKey = AppConfig.revenueCatAPIKey
        print("[RevenueCat] Using API Key: \(apiKey)")
        Purchases.configure(
            with: Configuration.Builder(withAPIKey: apiKey)
                .with(entitlementVerificationMode: .informational)
                .with(storeKitVersion: .storeKit2)
                .build()
        )
        Purchases.shared.delegate = self
        Task { await listenCustomerInfo() }
    }
    
    private func listenCustomerInfo() async {
        for await info in Purchases.shared.customerInfoStream {
            await MainActor.run {
                var subscription = SubscriptionInfo(info: info)
                // サーバーから月次利用量情報を取得してマージ
                Task {
                    await syncUsageInfo(&subscription)
                    await MainActor.run {
                        AppState.shared.updateSubscriptionInfo(subscription)
                    }
                }
            }
        }
    }
    
    private func syncUsageInfo(_ subscription: inout SubscriptionInfo) async {
        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
        
        var request = URLRequest(url: AppConfig.entitlementSyncURL)
        request.httpMethod = "GET"
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }
            
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let entitlement = json["entitlement"] as? [String: Any] {
                subscription.monthlyUsageLimit = entitlement["monthly_usage_limit"] as? Int
                subscription.monthlyUsageRemaining = entitlement["monthly_usage_remaining"] as? Int
                subscription.monthlyUsageCount = entitlement["monthly_usage_count"] as? Int
            }
        } catch {
            // エラー時は無視（RevenueCatの情報のみを使用）
        }
    }
    
    func handleLogin(appUserId: String) async {
        if Purchases.shared.appUserID != appUserId {
            _ = try? await Purchases.shared.logIn(appUserId)
        }
        await refreshOfferings()
    }
    
    func handleLogout() async {
        // 匿名ユーザーの場合はログアウト不要
        guard !Purchases.shared.isAnonymous else {
            print("[RevenueCat] Skipping logout for anonymous user")
            return
        }
        _ = try? await Purchases.shared.logOut()
    }
    
    func refreshOfferings() async {
        do {
            let result = try await Purchases.shared.offerings()
            offerings = result
            await MainActor.run {
                AppState.shared.updateOffering(result.offering(identifier: AppConfig.revenueCatPaywallId) ?? result.current)
            }
        } catch {
            await MainActor.run {
                // Keep existing cached offering on error
                if AppState.shared.cachedOffering == nil {
                    AppState.shared.updateOffering(nil)
                }
            }
        }
    }
    
    func syncNow() async {
        // 1) 端末側の領収書同期
        _ = try? await Purchases.shared.syncPurchases()
        
        // 2) サーバにRC再取得を要求（DB→/mobile/entitlement反映）
        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
        
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("billing/revenuecat/sync"))
        request.httpMethod = "POST"
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        _ = try? await URLSession.shared.data(for: request)
        
        // 3) 最新Entitlementを取得
        var subscription = AppState.shared.subscriptionInfo
        await syncUsageInfo(&subscription)
        await MainActor.run {
            AppState.shared.updateSubscriptionInfo(subscription)
        }
    }
}

extension SubscriptionManager: PurchasesDelegate {
    func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        Task { @MainActor in
            var subscription = SubscriptionInfo(info: customerInfo)
            // サーバーから月次利用量情報を取得してマージ
            await syncUsageInfo(&subscription)
            await MainActor.run {
                AppState.shared.updateSubscriptionInfo(subscription)
            }
        }
    }
}

extension SubscriptionInfo {
    init(info: CustomerInfo) {
        let configuredId = AppConfig.revenueCatEntitlementId
        let primaryEntitlement = info.entitlements[configuredId]
        let fallbackEntitlement = info.entitlements.active.values.first
        let entitlement = primaryEntitlement ?? fallbackEntitlement

        let plan: Plan
        if entitlement?.isActive == true {
            plan = .pro
        } else if let expiration = entitlement?.expirationDate,
                  expiration > Date() {
            plan = .grace
        } else {
            plan = .free
        }

        let productId = entitlement?.productIdentifier
        let offering = AppState.shared.cachedOffering
        let package = offering?
            .availablePackages
            .first(where: { $0.storeProduct.productIdentifier == productId })

        let mappedName: String? = {
            switch productId {
            case "ai.anicca.app.ios.annual":
                return NSLocalizedString("subscription_plan_annual", comment: "")
            case "ai.anicca.app.ios.monthly":
                return NSLocalizedString("subscription_plan_monthly", comment: "")
            default:
                return nil
            }
        }()

        let willRenew = entitlement?.willRenew ?? false
        let isTrial = entitlement?.periodType == .trial
        let statusString: String
        if entitlement?.isActive == true {
            statusString = isTrial ? "trialing" : (willRenew ? "active" : "canceled")
        } else {
            statusString = "expired"
        }
        self.init(
            plan: plan,
            status: statusString,
            currentPeriodEnd: entitlement?.expirationDate,
            managementURL: info.managementURL,
            lastSyncedAt: .now,
            productIdentifier: productId,
            planDisplayName: package?.storeProduct.localizedTitle ?? mappedName,
            priceDescription: package?.localizedPriceString,
            monthlyUsageLimit: nil,
            monthlyUsageRemaining: nil,
            monthlyUsageCount: nil,
            willRenew: willRenew
        )
    }
}

