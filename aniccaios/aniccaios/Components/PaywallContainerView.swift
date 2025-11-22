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
                // RevenueCatUIのPaywallViewを使用
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
                    .onDismiss {
                        onDismissRequested?()
                    }
            } else if isLoading {
                ProgressView(String(localized: "paywall_loading"))
            } else {
                fallbackMessage
            }
        }
        .task {
            // 既に権限がある場合は閉じる
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
        // 1. まずアプリ内の状態を即座に更新（ユーザーを待たせない）
        await MainActor.run {
            let subscription = SubscriptionInfo(info: info)
            appState.updateSubscriptionInfo(subscription)
                        
            if subscription.isEntitled {
                onPurchaseCompleted?()
                onDismissRequested?() // 成功したら閉じる
            }
        }
                
        // 2. バックグラウンドでサーバーと同期（エラーが出てもアプリ動作は止めない）
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
                print("[Paywall] No offerings found")
                appState.updatePurchaseEnvironment(.accountMissing)
            }
        } catch {
            print("[Paywall] Failed to load offerings: \(error)")
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
