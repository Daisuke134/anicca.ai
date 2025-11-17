import RevenueCat
import Foundation
import StoreKit
import OSLog

@MainActor
final class SubscriptionManager: NSObject {
    static let shared = SubscriptionManager()
    private var offerings: Offerings?
    private let logger = Logger(subsystem: "com.anicca.ios", category: "SubscriptionManager")
    
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
        Task { 
            await checkPurchaseEnvironment()
            await listenCustomerInfo() 
        }
    }
    
    private func checkPurchaseEnvironment() async {
        // Check if device can make payments
        let canMakePayments = await StoreKit.AppStore.canMakePayments
        logger.info("StoreKit canMakePayments: \(canMakePayments, privacy: .public)")
        
        // Check storefront (indicates if user is signed in to App Store)
        if #available(iOS 15.0, *) {
            if let storefront = try? await StoreKit.AppStore.storefront {
                logger.info("StoreKit storefront: \(storefront.id.rawValue, privacy: .public)")
            } else {
                logger.warning("StoreKit storefront unavailable - user may not be signed in to App Store")
            }
        }
        
        // Note: ASDErrorDomain Code=509 "No active account" is expected when:
        // - User is not signed in to App Store
        // - App is running in simulator without test account
        // RevenueCat handles these gracefully, so we just log for debugging
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
        
        // Extract product identifier and display info from active entitlement
        var productIdentifier: String?
        var planDisplayName: String?
        var priceDescription: String?
        
        if let activeEntitlement = entitlement, activeEntitlement.isActive {
            // Get the product identifier from the entitlement
            productIdentifier = activeEntitlement.productIdentifier
            
            // Get product info from active subscriptions
            // activeSubscriptions is a Set<String> containing product identifiers
            if let productId = productIdentifier, info.activeSubscriptions.contains(productId) {
                // Use product identifier as display name (will be formatted by StoreKit product info)
                planDisplayName = productId
                
                // Try to determine plan type from product identifier
                if productId.lowercased().contains("monthly") || productId.lowercased().contains("month") {
                    planDisplayName = NSLocalizedString("settings_subscription_pro", comment: "") + " • " + NSLocalizedString("settings_subscription_monthly", comment: "")
                } else if productId.lowercased().contains("yearly") || productId.lowercased().contains("year") {
                    planDisplayName = NSLocalizedString("settings_subscription_pro", comment: "") + " • " + NSLocalizedString("settings_subscription_yearly", comment: "")
                }
            }
            
            // Format price description if available
            if let expirationDate = activeEntitlement.expirationDate {
                let formatter = DateFormatter()
                formatter.dateStyle = .medium
                formatter.timeStyle = .none
                priceDescription = String(format: NSLocalizedString("settings_subscription_until", comment: ""), formatter.string(from: expirationDate))
            }
        }
        
        self.init(
            plan: plan,
            status: entitlement.map { String(describing: $0.verification) } ?? "unknown",
            currentPeriodEnd: entitlement?.expirationDate,
            managementURL: info.managementURL,
            lastSyncedAt: .now,
            productIdentifier: productIdentifier,
            planDisplayName: planDisplayName,
            priceDescription: priceDescription
        )
    }
}

