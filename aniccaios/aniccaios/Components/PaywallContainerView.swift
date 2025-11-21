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
            // 既に購読中ならPaywallを表示しない
            if appState.subscriptionInfo.isEntitled {
                VStack(spacing: 12) {
                    Text("You're already in the pro plan.")
                        .font(.headline)
                    Button(String(localized: "settings_subscription_manage")) {
                        // Customer Center へ
                        if #available(iOS 17.0, *) {
                            // 埋め込みのマネージ画面表示
                        }
                        // フォールバック: Settings画面でCustomer Centerを開く導線を案内
                    }.buttonStyle(.borderedProminent)
                }
                .padding()
            } else if let offering {
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
            } else if let cached = appState.cachedOffering {
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
                offering = resolvedOffering
                fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
                showStoreKitFallback = false
            } else {
                offering = nil
                fallbackProductIDs = offerings.current?.availablePackages.map { $0.storeProduct.productIdentifier } ?? []
                showStoreKitFallback = true
            }
            loadError = nil
        } catch {
            offering = nil
            fallbackProductIDs = cachedProductIDs()
            loadError = error
            showStoreKitFallback = true
        }
    }
    
    private func cachedProductIDs() -> [String] {
        Purchases.shared.cachedOfferings?.current?.availablePackages.map { $0.storeProduct.productIdentifier } ?? []
    }

    private func handle(customerInfo: CustomerInfo) {
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else { return }
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        // 購入直後にサーバへ同期（DBを即更新 → 上限/残分を即返せるように）
        Task { await SubscriptionManager.shared.syncNow() }
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


