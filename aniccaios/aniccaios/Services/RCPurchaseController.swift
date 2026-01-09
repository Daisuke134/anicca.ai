import SuperwallKit
import RevenueCat
import StoreKit

enum PurchasingError: LocalizedError {
    case sk2ProductNotFound
    
    var errorDescription: String? {
        switch self {
        case .sk2ProductNotFound:
            return "Superwall didn't pass a StoreKit 2 product to purchase."
        }
    }
}

final class RCPurchaseController: PurchaseController {
    
    // MARK: - Sync Subscription Status
    func syncSubscriptionStatus() {
        guard Purchases.isConfigured else {
            print("[RCPurchaseController] RevenueCat not configured yet")
            return
        }
        
        Task {
            for await customerInfo in Purchases.shared.customerInfoStream {
                let activeEntitlements = customerInfo.entitlements.activeInCurrentEnvironment
                let superwallEntitlements = activeEntitlements.keys.map { Entitlement(id: $0) }
                
                await MainActor.run {
                    if superwallEntitlements.isEmpty {
                        Superwall.shared.subscriptionStatus = .inactive
                    } else {
                        Superwall.shared.subscriptionStatus = .active(Set(superwallEntitlements))
                    }
                }
            }
        }
    }
    
    // MARK: - Handle Purchases
    func purchase(product: SuperwallKit.StoreProduct) async -> PurchaseResult {
        do {
            guard let sk2Product = product.sk2Product else {
                throw PurchasingError.sk2ProductNotFound
            }
            let storeProduct = RevenueCat.StoreProduct(sk2Product: sk2Product)
            let revenueCatResult = try await Purchases.shared.purchase(product: storeProduct)
            
            if revenueCatResult.userCancelled {
                return .cancelled
            } else {
                return .purchased
            }
        } catch let error as ErrorCode {
            if error == .paymentPendingError {
                return .pending
            } else {
                return .failed(error)
            }
        } catch {
            return .failed(error)
        }
    }
    
    // MARK: - Handle Restores
    func restorePurchases() async -> RestorationResult {
        do {
            _ = try await Purchases.shared.restorePurchases()
            return .restored
        } catch {
            return .failed(error)
        }
    }
}


