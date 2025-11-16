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
            if let offering {
                ZStack {
                    if #available(iOS 17.0, *) {
                        RevenueCatUI.PaywallView(
                            offering: offering,
                            displayCloseButton: false
                        )
                        .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                    } else {
                        RevenueCatUI.PaywallView(
                            offering: offering,
                            displayCloseButton: false
                        )
                        .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                    }
                    
                    if let onDismissRequested {
                        VStack {
                            HStack {
                                Button {
                                    onDismissRequested()
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 28))
                                        .foregroundStyle(.secondary)
                                        .padding(12)
                                }
                                Spacer()
                            }
                            Spacer()
                        }
                    }
                }
            } else if isLoading {
                ProgressView(String(localized: "paywall_loading"))
            } else {
                fallbackMessage
            }
        }
        .task {
            await loadOffering()
            // 購入状態を確実に同期
            try? await Purchases.shared.syncPurchases()
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


