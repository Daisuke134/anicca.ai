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
                let subscription = SubscriptionInfo(info: info)
                AppState.shared.updateSubscriptionInfo(subscription)
            }
        }
    }
    
    func handleLogin(appUserId: String) async {
        if Purchases.shared.appUserID != appUserId {
            _ = try? await Purchases.shared.logIn(appUserId)
        }
        await refreshOfferings()
    }
    
    func handleLogout() async {
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
}

extension SubscriptionManager: PurchasesDelegate {
    func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        Task { @MainActor in
            let subscription = SubscriptionInfo(info: customerInfo)
            AppState.shared.updateSubscriptionInfo(subscription)
        }
    }
}

extension SubscriptionInfo {
    init(info: CustomerInfo) {
        let entitlement = info.entitlements[AppConfig.revenueCatEntitlementId]
        let plan: Plan = entitlement?.isActive == true ? .pro : .free
        let productId = entitlement?.productIdentifier
        let offering = AppState.shared.cachedOffering
        let package = offering?
            .availablePackages
            .first(where: { $0.storeProduct.productIdentifier == productId })
        
        self.init(
            plan: plan,
            status: entitlement.map { String(describing: $0.verification) } ?? "unknown",
            currentPeriodEnd: entitlement?.expirationDate,
            managementURL: info.managementURL,
            lastSyncedAt: .now,
            productIdentifier: productId,
            planDisplayName: package?.storeProduct.localizedTitle,
            priceDescription: package?.localizedPriceString
        )
    }
}

