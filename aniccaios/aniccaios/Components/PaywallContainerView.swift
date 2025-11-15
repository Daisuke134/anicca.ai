import RevenueCatUI
import StoreKit
import SwiftUI

struct PaywallContainerView: View {
    var onPurchaseCompleted: (() -> Void)?
    @State private var showStoreKitFallback = false
    var body: some View {
        RevenueCatUI.PaywallView(paywallID: AppConfig.revenueCatPaywallId) { event in
            switch event {
            case .purchaseCompleted:
                onPurchaseCompleted?()
            case .loadingError:
                showStoreKitFallback = true
            default:
                break
            }
        }
        .sheet(isPresented: $showStoreKitFallback) {
            SubscriptionStoreView {}
        }
    }
}


