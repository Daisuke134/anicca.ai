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
        Purchases.logLevel = .debug // デバッグのため詳細ログ出力
        let apiKey = AppConfig.revenueCatAPIKey
        print("[RevenueCat] Using API Key: \(apiKey)")
        
        // V2/StoreKit 2対応のシンプル構成
        // entitlementVerificationMode: .informational は推奨設定（検証結果を情報として提供）
        // 言語設定は自動検出されるため明示的な設定は不要
        Purchases.configure(
            with: Configuration.Builder(withAPIKey: apiKey)
                .with(entitlementVerificationMode: .informational)
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
        
        // AppConfig.entitlementSyncURL を使用
        var request = URLRequest(url: AppConfig.entitlementSyncURL)
        request.httpMethod = "GET"
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        do {
            let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
            
            // ステータスコードチェック
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                print("[SubscriptionManager] Server sync failed (status \( (response as? HTTPURLResponse)?.statusCode ?? 0 )), proceeding with RC data.")
                return
            }
            
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let entitlement = json["entitlement"] as? [String: Any] {
                // 成功時のみ利用量情報を上書き
                subscription.monthlyUsageLimit = entitlement["monthly_usage_limit"] as? Int
                subscription.monthlyUsageRemaining = entitlement["monthly_usage_remaining"] as? Int
                subscription.monthlyUsageCount = entitlement["monthly_usage_count"] as? Int
            }
        } catch {
            // エラー時はログのみ出力し、RevenueCatのEntitlement情報は維持する
            print("[SubscriptionManager] Sync error: \(error). Using RC entitlement only.")
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
            print("[SubscriptionManager] Offerings loaded: current=\(result.current?.identifier ?? "nil"), all=\(result.all.keys.joined(separator: ", "))")
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
        do {
            _ = try await Purchases.shared.syncPurchases()
        } catch {
            print("[SubscriptionManager] syncPurchases failed: \(error)")
        }
        
        // 2) サーバにRC再取得を要求（DB→/mobile/entitlement反映）
        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
        
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("billing/revenuecat/sync"))
        request.httpMethod = "POST"
        request.timeoutInterval = 10.0 // 10秒でタイムアウト
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        do {
            let (_, response) = try await NetworkSessionManager.shared.session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                print("[SubscriptionManager] Invalid response type")
                return
            }
            
            if !(200..<300).contains(httpResponse.statusCode) {
                print("[SubscriptionManager] Sync failed with status: \(httpResponse.statusCode)")
                return
            }
            
            // 3) 最新Entitlementを取得
            var subscription = AppState.shared.subscriptionInfo
            await syncUsageInfo(&subscription)
            await MainActor.run {
                AppState.shared.updateSubscriptionInfo(subscription)
            }
        } catch {
            print("[SubscriptionManager] Sync error: \(error.localizedDescription)")
            // エラーでも続行（オフライン時など）
        }
    }
}

extension SubscriptionManager: PurchasesDelegate {
    func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        print("[RevenueCat] Delegate received update. Active entitlements: \(customerInfo.entitlements.active.keys)")
        
        Task { @MainActor in
            var subscription = SubscriptionInfo(info: customerInfo)
            
            // 1. まずRevenueCatの情報だけで即座に更新（待機なし）
            AppState.shared.updateSubscriptionInfo(subscription)
            
            // 2. その後、サーバー同期を試みて詳細情報を追加
            await syncUsageInfo(&subscription)
            AppState.shared.updateSubscriptionInfo(subscription)
        }
    }
    
    // 追加: アプリ内課金のプロモーション対応（ベストプラクティス）
    func purchases(_ purchases: Purchases, readyForPromotedProduct product: StoreProduct, purchase: @escaping StartPurchaseBlock) {
        purchase { (transaction, info, error, cancelled) in
            if let info = info {
                Task { @MainActor in
                    let sub = SubscriptionInfo(info: info)
                    AppState.shared.updateSubscriptionInfo(sub)
                }
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

