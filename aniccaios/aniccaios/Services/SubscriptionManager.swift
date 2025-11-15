import RevenueCat
import RevenueCatUI
import Foundation
import UIKit

final actor SubscriptionManager: ObservableObject {
    static let shared = SubscriptionManager()
    private var offerings: Offerings?
    private init() {}
    
    func configure() {
        Purchases.logLevel = .warn
        Purchases.configure(
            with: Configuration.Builder(withAPIKey: AppConfig.revenueCatAPIKey)
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
        offerings = try? await Purchases.shared.offerings()
    }
    
    func presentPaywall(hostingController: UIViewController) async throws {
        try await Purchases.shared.presentPaywallIfNeeded(
            from: hostingController,
            offeringIdentifier: offerings?.current?.identifier,
            requiredEntitlementIdentifier: AppConfig.revenueCatEntitlementId
        )
    }
    
    func presentPaywall(fromCurrentScene: Bool) async {
        guard let windowScene = await UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootViewController = await windowScene.windows.first?.rootViewController else {
            return
        }
        do {
            try await presentPaywall(hostingController: rootViewController)
        } catch {
            print("Failed to present paywall: \(error)")
        }
    }
}

extension SubscriptionManager: PurchasesDelegate {
    nonisolated func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
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
        self.init(plan: plan,
                  status: entitlement?.verification.description ?? "unknown",
                  currentPeriodEnd: entitlement?.expirationDate,
                  managementURL: info.managementURL,
                  lastSyncedAt: .now)
    }
}

