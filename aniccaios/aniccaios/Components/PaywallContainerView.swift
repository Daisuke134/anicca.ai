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
        
    var body: some View {
        Group {
            if let offeringToDisplay = offering ?? appState.cachedOffering {
                // 修正: ZStackで閉じるボタンを配置
                ZStack(alignment: .topTrailing) {
                    PaywallView(offering: offeringToDisplay)
                        .onPurchaseCompleted { customerInfo in
                            print("[Paywall] Purchase completed: \(customerInfo)")
                            Task {
                                await handlePurchaseResult(customerInfo)
                            }
                        }
                        .onRestoreCompleted { customerInfo in
                            print("[Paywall] Restore completed: \(customerInfo)")
                            Task {
                                await handlePurchaseResult(customerInfo)
                            }
                        }
                    
                    // 閉じるボタン
                    Button {
                        onDismissRequested?()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(.white.opacity(0.8))
                            .shadow(radius: 2)
                            .padding()
                    }
                    .padding(.top, 10)
                }
            } else if isLoading {
                ProgressView(String(localized: "paywall_loading"))
            } else {
                fallbackMessage
            }
        }
        .task {
            if appState.subscriptionInfo.isEntitled {
                onDismissRequested?()
                return
            }
                        
            if offering == nil {
                await loadOffering()
            }
        }
    }
    
    private func handlePurchaseResult(_ info: CustomerInfo) async {
        await MainActor.run {
            let subscription = SubscriptionInfo(info: info)
            appState.updateSubscriptionInfo(subscription)
                        
            if subscription.isEntitled {
                onPurchaseCompleted?()
                onDismissRequested?()
            }
        }
        // サーバー同期
        await SubscriptionManager.shared.syncNow()
    }
    
    private func loadOffering() async {
        isLoading = true
        defer { isLoading = false }
                
        do {
            let offerings = try await Purchases.shared.offerings()
            if let resolved = offerings.offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current {
                await MainActor.run {
                    self.offering = resolved
                    appState.updateOffering(resolved)
                    appState.updatePurchaseEnvironment(.ready)
                }
            } else {
                appState.updatePurchaseEnvironment(.accountMissing)
            }
        } catch {
            if let cached = appState.cachedOffering {
                self.offering = cached
            } else {
                self.loadError = error
                appState.updatePurchaseEnvironment(.accountMissing)
            }
        }
    }
        
    @ViewBuilder
    private var fallbackMessage: some View {
        VStack(spacing: 12) {
            Text("paywall_unavailable_title")
                .font(.headline)
            Text(loadError?.localizedDescription ?? String(localized: "paywall_unavailable_message"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button(String(localized: "paywall_retry_button")) {
                Task { await loadOffering() }
            }
            .buttonStyle(.borderedProminent)
            Button(String(localized: "common_close")) {
                onDismissRequested?()
            }
            .buttonStyle(.plain)
            .padding(.top)
        }
        .padding()
    }
}
