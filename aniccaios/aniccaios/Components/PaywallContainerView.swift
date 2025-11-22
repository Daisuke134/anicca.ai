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
            // 修正: isSafeToDisplayを使用してより厳密にチェック（ゼロ除算を防ぐ）
            if let offeringToDisplay = offering ?? appState.cachedOffering,
               offeringToDisplay.isSafeToDisplay {
                // RevenueCatUIのPaywallViewを使用（標準で閉じるボタンが含まれている）
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
        // メインスレッドで即座に閉じる（ユーザーを待たせない）
        await MainActor.run {
            let subscription = SubscriptionInfo(info: info)
            appState.updateSubscriptionInfo(subscription)
            
            // 購入完了時はonPurchaseCompletedのみ呼ぶ（onDismissRequestedは呼ばない）
            onPurchaseCompleted?()
        }
        
        // サーバー同期は裏で実行（UIをブロックしない）
        Task.detached(priority: .utility) {
            await SubscriptionManager.shared.syncNow()
        }
    }
    
    private func loadOffering() async {
        isLoading = true
        defer { isLoading = false }
                
        do {
            let offerings = try await Purchases.shared.offerings()
            if let resolved = offerings.offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current {
                // 追加: Packagesが正しく読み込まれているか確認
                print("[PaywallContainerView] Loaded offering: identifier=\(resolved.identifier), packages=\(resolved.availablePackages.count)")
                
                // 追加: 各Packageの商品IDを確認
                for package in resolved.availablePackages {
                    print("[PaywallContainerView] Package: identifier=\(package.identifier), productId=\(package.storeProduct.productIdentifier)")
                }
                
                // 追加: isSafeToDisplayで最終確認
                if !resolved.isSafeToDisplay {
                    print("[PaywallContainerView] WARNING: Offering is not safe to display: identifier=\(resolved.identifier)")
                    await MainActor.run {
                        self.loadError = NSError(domain: "PaywallError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Offering has invalid packages"])
                        appState.updatePurchaseEnvironment(.accountMissing)
                    }
                    return
                }
                
                await MainActor.run {
                    self.offering = resolved
                    appState.updateOffering(resolved)
                    appState.updatePurchaseEnvironment(.ready)
                }
            } else {
                print("[PaywallContainerView] No offering found for identifier: \(AppConfig.revenueCatPaywallId)")
                await MainActor.run {
                    appState.updatePurchaseEnvironment(.accountMissing)
                }
            }
        } catch {
            print("[PaywallContainerView] Error loading offering: \(error.localizedDescription)")
            if let cached = appState.cachedOffering {
                // キャッシュがあっても、isSafeToDisplayをチェック
                if cached.isSafeToDisplay {
                    await MainActor.run {
                        self.offering = cached
                    }
                } else {
                    await MainActor.run {
                        self.loadError = error
                        appState.updatePurchaseEnvironment(.accountMissing)
                    }
                }
            } else {
                await MainActor.run {
                    self.loadError = error
                    appState.updatePurchaseEnvironment(.accountMissing)
                }
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
