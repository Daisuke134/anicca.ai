import RevenueCat
import RevenueCatUI
import StoreKit
import SwiftUI

struct PaywallContainerView: View {
    var onPurchaseCompleted: (() -> Void)?
    var onDismissRequested: (() -> Void)?
    @EnvironmentObject private var appState: AppState
    @State private var offering: Offering?
    @State private var isLoading = true
    @State private var loadError: Error?
    @State private var showStoreKitFallback = false
    @State private var fallbackProductIDs: [String] = []

    var body: some View {
        Group {
            if let offering, offering.isSafeToDisplay {
                if #available(iOS 17.0, *) {
                    RevenueCatUI.PaywallView(
                        offering: offering,
                        displayCloseButton: true
                    )
                    .onRequestedDismissal {
                        onDismissRequested?()
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                } else {
                    RevenueCatUI.PaywallView(
                        offering: offering,
                        displayCloseButton: true
                    )
                    .onRequestedDismissal {
                        onDismissRequested?()
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                }
            } else if let cached = appState.cachedOffering, cached.isSafeToDisplay {
                // Use cached offering immediately while loading fresh data
                if #available(iOS 17.0, *) {
                    RevenueCatUI.PaywallView(
                        offering: cached,
                        displayCloseButton: true
                    )
                    .onRequestedDismissal {
                        onDismissRequested?()
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                    .onAppear {
                        offering = cached
                    }
                } else {
                    RevenueCatUI.PaywallView(
                        offering: cached,
                        displayCloseButton: true
                    )
                    .onRequestedDismissal {
                        onDismissRequested?()
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                    .onAppear {
                        offering = cached
                    }
                }
            } else if isLoading {
                ProgressView(String(localized: "paywall_loading"))
            } else {
                fallbackMessage
            }
        }
        .task {
            // 現在サブスクライブしているユーザーにはPaywallを表示しない
            if appState.subscriptionInfo.isEntitled {
                onDismissRequested?()
                return
            }
            
            if offering == nil {
                await loadOffering()
            }
            // 購入状態を確実に同期
            if let info = try? await Purchases.shared.syncPurchases() {
                await MainActor.run {
                    let subscription = SubscriptionInfo(info: info)
                    appState.updateSubscriptionInfo(subscription)
                }
            }
        }
        .onReceive(appState.$cachedOffering) { cached in
            if let cached, offering == nil {
                offering = cached
            }
        }
        .sheet(isPresented: $showStoreKitFallback) {
            if #available(iOS 17.0, *) {
                if let offering {
                    SubscriptionStoreView.forOffering(offering)
                } else {
                    SubscriptionStoreView(productIDs: fallbackProductIDs)
                }
            } else {
                storeKitUnavailableMessage
            }
        }
    }

    private func loadOffering() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let offerings = try await Purchases.shared.offerings()
            if let resolvedOffering = offerings.offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current {
                // 表示安全性をチェック
                guard resolvedOffering.isSafeToDisplay else {
                    print("[Paywall] Offering is not safe to display: identifier=\(resolvedOffering.identifier), packages=\(resolvedOffering.availablePackages.count)")
                    offering = nil
                    fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
                    appState.updatePurchaseEnvironment(.accountMissing)
                    showStoreKitFallback = true
                    return
                }
                
                offering = resolvedOffering
                appState.updateOffering(resolvedOffering)
                fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
                appState.updatePurchaseEnvironment(.ready)
                showStoreKitFallback = false
            } else {
                print("[Paywall] Offering not found: identifier=\(AppConfig.revenueCatPaywallId), current=\(offerings.current?.identifier ?? "nil")")
                offering = nil
                fallbackProductIDs = offerings.current?.availablePackages.map { $0.storeProduct.productIdentifier } ?? []
                appState.updatePurchaseEnvironment(.accountMissing)
                showStoreKitFallback = true
            }
            loadError = nil
        } catch {
            handleOfferingError(error)
            offering = nil
            fallbackProductIDs = cachedProductIDs()
            loadError = error
            showStoreKitFallback = true
        }
    }
    
    private func handleOfferingError(_ error: Error) {
        guard let nsError = error as NSError? else { return }
        if nsError.domain == "ASDErrorDomain", nsError.code == 509 {
            appState.updatePurchaseEnvironment(.accountMissing)
        } else if nsError.domain == "RevenueCat.BackendError" {
            appState.updatePurchaseEnvironment(.accountMissing)
        }
    }
    
    private func cachedProductIDs() -> [String] {
        Purchases.shared.cachedOfferings?.current?.availablePackages.map { $0.storeProduct.productIdentifier } ?? []
    }

    private func handle(customerInfo: CustomerInfo) {
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else { return }
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        onPurchaseCompleted?()
    }

    @ViewBuilder
    private var fallbackMessage: some View {
        VStack(spacing: 12) {
            Text("paywall_unavailable_title")
                .font(.headline)
            Text(loadError?.localizedDescription ?? String(localized: "paywall_unavailable_message"))
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button(String(localized: "paywall_retry_button")) {
                Task { await loadOffering() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
    
    @ViewBuilder
    private var storeKitUnavailableMessage: some View {
        VStack(spacing: 12) {
            Text("paywall_unavailable_title")
                .font(.headline)
            Text(String(localized: "paywall_storekit_unavailable_message"))
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
