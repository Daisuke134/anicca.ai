import RevenueCat
import RevenueCatUI
import StoreKit
import SwiftUI

struct PaywallContainerView: View {
    var forcePresent: Bool = false
    var onPurchaseCompleted: (() -> Void)?
    var onDismissRequested: (() -> Void)?
    var onPurchaseFailed: ((Error) -> Void)? // 追加: 購入失敗コールバック
    @EnvironmentObject private var appState: AppState
    @State private var offering: Offering?
    @State private var isLoading = true
    @State private var loadError: Error?
    @State private var hasCheckedEntitlement = false // 追加: チェック完了フラグ
    @State private var purchaseError: Error? // 追加: 購入エラー状態
    
    var body: some View {
        Group {
            // forcePresent: true の場合はエンタイトルメントチェックをスキップ
            // エビデンス: 19行目の条件で即座に閉じられるのを防ぐ
            if !forcePresent && appState.subscriptionInfo.isEntitled {
                // エンタイトル済みの場合は何も表示せず、即座に閉じる
                EmptyView()
                    .onAppear {
                        onDismissRequested?()
                    }
            } else if let offeringToDisplay = offering
                        ?? appState.cachedOffering
                        ?? Purchases.shared.cachedOfferings?.offering(identifier: AppConfig.revenueCatPaywallId)
                        ?? Purchases.shared.cachedOfferings?.current,
                      offeringToDisplay.isSafeToDisplay,
                      !offeringToDisplay.availablePackages.isEmpty {
                // Guideline 3.1.2対応: 請求額を最強調、法的リンクを常設
                VStack(spacing: 0) {
                    // PricingDisclosureBannerを削除（価格表示を非表示化）
                    
                    // RevenueCatUIのPaywallViewを使用
                    PaywallView(offering: offeringToDisplay)
                        .onRequestedDismissal {
                            // 購入エラー中でも閉じられる（ユーザーの意思を尊重）
                            // ただし、エラー状態をクリア
                            if purchaseError != nil {
                                purchaseError = nil
                            }
                            onDismissRequested?()
                        }
                        .onPurchaseCompleted { customerInfo in
                            print("[Paywall] Purchase completed: \(customerInfo)")
                            Task {
                                await handlePurchaseResult(customerInfo)
                            }
                        }
                        // 追加: キャンセル時のフリーズ対策
                        .onPurchaseCancelled {
                            print("[Paywall] Purchase cancelled by user")
                            // キャンセル時はエラー状態をクリア
                            Task { @MainActor in
                                purchaseError = nil
                            }
                        }
                        .onPurchaseFailure { error in
                            print("[Paywall] Purchase failed: \(error.localizedDescription)")
                            // 追加: 購入エラー時の処理
                            Task { @MainActor in
                                purchaseError = error
                                // 購入失敗を親に通知
                                onPurchaseFailed?(error)
                            }
                        }
                        .onRestoreCompleted { customerInfo in
                            print("[Paywall] Restore completed: \(customerInfo)")
                            Task {
                                await handlePurchaseResult(customerInfo)
                            }
                        }
                    
                    // 追加: 購入エラー時のエラーメッセージ表示
                    if let error = purchaseError {
                        VStack(spacing: 8) {
                            Text(String(localized: "paywall_purchase_failed_title"))
                                .font(.headline)
                                .foregroundColor(.red)
                            Text(error.localizedDescription)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                            Button(String(localized: "paywall_retry")) {
                                purchaseError = nil
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        .padding()
                        .background(Color(.systemBackground))
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    // 下部: 法的リンクを常設
                    LegalLinksView()
                }
            } else if isLoading {
                ProgressView(String(localized: "paywall_loading"))
            } else {
                fallbackMessage
            }
        }
        .task {
            // forcePresent: true の場合はエンタイトルメントチェックをスキップ
            // エビデンス: 60-65行目でcheckEntitlementStatus()が呼ばれ、エンタイトル済みと判定されると閉じられる
            if !forcePresent && !appState.shouldShowPaywall {
                await MainActor.run { onDismissRequested?() }
                return
            }
            // forcePresent: true の場合はエンタイトルメントチェックをスキップしてオファリングのみロード
            if forcePresent {
                await loadOffering()
                return
            }
            // 重要: 表示前に最新のエンタイトルメント状態を確認
            await checkEntitlementAndLoadOffering()
        }
        .onChange(of: appState.shouldShowPaywall) { shouldShow in
            // forcePresent: true の場合は shouldShowPaywall の変更を無視
            // エビデンス: 67-69行目でshouldShowPaywallがfalseになると閉じられる
            if !forcePresent && !shouldShow { onDismissRequested?() }
        }
    }
    
    private func checkEntitlementAndLoadOffering() async {
        // 1. SDKキャッシュを最優先で確認（これが最も高速）
        if let sdkCached = Purchases.shared.cachedOfferings?.current,
           sdkCached.availablePackages.isEmpty == false {
            await MainActor.run {
                self.offering = sdkCached
                self.isLoading = false // 即座にローディング解除
                self.hasCheckedEntitlement = true // UIの分岐条件からは除外済み（後方互換のため維持）
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
                self.isLoading = false
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
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await checkEntitlementStatus() }
            group.addTask { await loadOffering() }
        }
        
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
            
            // 購入成功時はエラー状態をクリア
            purchaseError = nil
            
            // 購入完了時はonPurchaseCompletedのみ呼ぶ（onDismissRequestedは呼ばない）
            onPurchaseCompleted?()
        }
        
        // サーバー同期は裏で実行（UIをブロックしない）
        Task.detached(priority: .utility) {
            await SubscriptionManager.shared.syncNow()
        }
    }
    
    private func loadOffering() async {
        await MainActor.run { self.isLoading = true }
        defer { Task { await MainActor.run { self.isLoading = false } } }
        
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
            Text(String(localized: "paywall_unavailable_title"))
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
