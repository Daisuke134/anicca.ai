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
    @State private var hasCheckedEntitlement = false // 追加: チェック完了フラグ
    
    var body: some View {
        Group {
            // エンタイトルメントチェック: プロプランユーザーにはペイウォールを表示しない
            if hasCheckedEntitlement && appState.subscriptionInfo.isEntitled {
                // エンタイトル済みの場合は何も表示せず、即座に閉じる
                EmptyView()
                    .onAppear {
                        onDismissRequested?()
                    }
            } else if hasCheckedEntitlement,
                      let offeringToDisplay = offering ?? appState.cachedOffering,
                      offeringToDisplay.isSafeToDisplay,
                      !offeringToDisplay.availablePackages.isEmpty {
                // RevenueCatUIのPaywallViewを使用
                PaywallView(offering: offeringToDisplay)
                    .onPurchaseCompleted { customerInfo in
                        print("[Paywall] Purchase completed: \(customerInfo)")
                        Task {
                            await handlePurchaseResult(customerInfo)
                        }
                    }
                    // 追加: キャンセル時のフリーズ対策
                    .onPurchaseCancelled {
                        print("[Paywall] Purchase cancelled by user")
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
            guard appState.shouldShowPaywall else {
                onDismissRequested?()
                return
            }
            // 重要: 表示前に最新のエンタイトルメント状態を確認
            await checkEntitlementAndLoadOffering()
        }
        .onChange(of: appState.shouldShowPaywall) { _, shouldShow in
            if !shouldShow {
                onDismissRequested?()
            }
        }
    }
    
    private func checkEntitlementAndLoadOffering() async {
        // 1. SDKキャッシュを最優先で確認（これが最も高速）
        if let sdkCached = Purchases.shared.cachedOfferings?.current,
           sdkCached.availablePackages.isEmpty == false {
            await MainActor.run {
                self.offering = sdkCached
                self.isLoading = false // 即座にローディング解除
                self.hasCheckedEntitlement = true
            }
            // キャッシュ利用中も念のため裏で最新確認を行うが、awaitでUIを止めない
            Task { await checkEntitlementStatus() }
            return
        }

        // 2. キャッシュされたオファリングを優先的に使用（高速化）
        if let cached = appState.cachedOffering,
           cached.isSafeToDisplay,
           !cached.availablePackages.isEmpty {
            await MainActor.run {
                self.offering = cached
                // キャッシュがあるので表示フラグを立てる（楽観的UI）
                self.hasCheckedEntitlement = true
                
                // 裏で最新状態を確認
                Task {
                    await self.checkEntitlementStatus()
                }
            }
            return
        }
        
        // 2. キャッシュがない場合、並列実行で高速化
        async let entitlementCheck = checkEntitlementStatus()
        async let offeringLoad = loadOffering()
        
        // 両方の完了を待つ
        _ = await (entitlementCheck, offeringLoad)
        
        await MainActor.run {
            hasCheckedEntitlement = true
        }
    }
    
    // 新規追加: エンタイトルメント状態確認メソッド
    private func checkEntitlementStatus() async {
        do {
            let customerInfo = try await Purchases.shared.customerInfo()
            await MainActor.run {
                let subscription = SubscriptionInfo(info: customerInfo)
                appState.updateSubscriptionInfo(subscription)
            }
        } catch {
            print("[PaywallContainerView] Failed to get customerInfo: \(error.localizedDescription)")
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
        
        // RevenueCat SDKのキャッシュも優先確認
        if let cachedOfferings = Purchases.shared.cachedOfferings,
           let resolved = cachedOfferings.offering(identifier: AppConfig.revenueCatPaywallId) ?? cachedOfferings.current,
           resolved.isSafeToDisplay,
           !resolved.availablePackages.isEmpty {
            print("[PaywallContainerView] Using SDK cached offering")
            await MainActor.run {
                self.offering = resolved
                appState.updateOffering(resolved)
                appState.updatePurchaseEnvironment(.ready)
            }
            return
        }
                
        do {
            let offerings = try await Purchases.shared.offerings()
            if let resolved = offerings.offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current {
                print("[PaywallContainerView] Loaded offering: identifier=\(resolved.identifier), packages=\(resolved.availablePackages.count)")
                
                // 追加: 各Packageの商品IDを確認
                for package in resolved.availablePackages {
                    print("[PaywallContainerView] Package: identifier=\(package.identifier), productId=\(package.storeProduct.productIdentifier)")
                }
                
                // 追加: 3段階のチェック
                // 1. isSafeToDisplay
                // 2. availablePackages が空でない
                if !resolved.isSafeToDisplay {
                    print("[PaywallContainerView] WARNING: Offering is not safe to display")
                    await MainActor.run {
                        self.loadError = NSError(domain: "PaywallError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Offering has invalid packages"])
                        appState.updatePurchaseEnvironment(.accountMissing)
                    }
                    return
                }
                
                if resolved.availablePackages.isEmpty {
                    print("[PaywallContainerView] WARNING: Offering has no packages")
                    await MainActor.run {
                        self.loadError = NSError(domain: "PaywallError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Offering has no available packages"])
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
            await MainActor.run {
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
