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
    @State private var fallbackProductIDs: [String] = []
    @State private var purchaseError: Error?
    @State private var showErrorAlert = false
    @State private var isSyncing = false
    @State private var hasCompletedPurchase = false

    var body: some View {
        Group {
            if let offering, offering.isSafeToDisplay {
                storeKitPaywallView(offering: offering)
                    .onInAppPurchaseStart { product in
                        print("[Paywall] StoreKit purchase started: \(product.id)")
                    }
                    .onInAppPurchaseCompletion { product, result in
                        Task {
                            await handleStoreKitPurchaseCompletion(product: product, result: result)
                        }
                    }
                    .onDisappear {
                        // ビューが消えた時に購入状態を確認（購入完了済みの場合はスキップ）
                        if !hasCompletedPurchase {
                            Task {
                                await syncPurchaseState()
                            }
                        }
                    }
            } else if let cached = appState.cachedOffering, cached.isSafeToDisplay {
                storeKitPaywallView(offering: cached)
                    .onAppear {
                        offering = cached
                    }
                    .onInAppPurchaseStart { product in
                        print("[Paywall] StoreKit purchase started: \(product.id)")
                    }
                    .onInAppPurchaseCompletion { product, result in
                        Task {
                            await handleStoreKitPurchaseCompletion(product: product, result: result)
                        }
                    }
                    .onDisappear {
                        // ビューが消えた時に購入状態を確認（購入完了済みの場合はスキップ）
                        if !hasCompletedPurchase {
                            Task {
                                await syncPurchaseState()
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
            // 現在サブスクライブしているユーザーにはPaywallを表示しない
            if appState.subscriptionInfo.isEntitled {
                onDismissRequested?()
                return
            }
            
            if offering == nil {
                await loadOffering()
            }
        }
    }

    private func loadOffering() async {
        isLoading = true
        defer { isLoading = false }
        
        // キャッシュを先にチェック（ローディング速度改善）
        if let cached = appState.cachedOffering, cached.isSafeToDisplay {
            offering = cached
            fallbackProductIDs = cached.availablePackages.map { $0.storeProduct.productIdentifier }
            appState.updatePurchaseEnvironment(.ready)
            loadError = nil
            return
        }
        
        // キャッシュがない場合のみAPIを呼び出す
        do {
            let offerings = try await Purchases.shared.offerings()
            guard let resolvedOffering = offerings
                .offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current else {
                print("[Paywall] Offering not found: identifier=\(AppConfig.revenueCatPaywallId), current=\(offerings.current?.identifier ?? "nil")")
                offering = nil
                fallbackProductIDs = []
                appState.updatePurchaseEnvironment(.accountMissing)
                return
            }
            
            // 表示安全性を一本化チェック
            guard resolvedOffering.isSafeToDisplay else {
                print("[Paywall] Offering is not safe to display: identifier=\(resolvedOffering.identifier), packages=\(resolvedOffering.availablePackages.count)")
                offering = nil
                fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
                appState.updatePurchaseEnvironment(.accountMissing)
                return
            }
            
            appState.updatePurchaseEnvironment(.ready)
            offering = resolvedOffering
            // キャッシュを更新
            appState.updateOffering(resolvedOffering)
            fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
            loadError = nil
        } catch {
            handleOfferingError(error)
            offering = nil
            fallbackProductIDs = cachedProductIDs()
            loadError = error
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

    @ViewBuilder
    private var fallbackMessage: some View {
        VStack(spacing: 12) {
            Text("paywall_unavailable_title")
                .font(.headline)
            Text(loadError?.localizedDescription ?? String(localized: "paywall_unavailable_message"))
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if let error = loadError {
                Text("Error: \(error.localizedDescription)")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            Button(String(localized: "paywall_retry_button")) {
                Task { await loadOffering() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
    
    @ViewBuilder
    @available(iOS 17.0, *)
    private func storeKitPaywallView(offering: Offering) -> some View {
        NavigationView {
            SubscriptionStoreView.forOffering(offering)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            onDismissRequested?()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
        }
    }
    
    /// StoreKit購入完了時の処理
    @available(iOS 17.0, *)
    private func handleStoreKitPurchaseCompletion(product: Product, result: Result<Product.PurchaseResult, Error>) async {
        switch result {
        case .success(let purchaseResult):
            switch purchaseResult {
            case .success(let verificationResult):
                switch verificationResult {
                case .verified(let transaction):
                    do {
                        print("[Paywall] StoreKit purchase completed: \(product.id)")
                        
                        // RevenueCatに購入を記録
                        isSyncing = true
                        defer { isSyncing = false }
                        
                        _ = try await Purchases.shared.recordPurchase(purchaseResult)
                        print("[Paywall] Purchase recorded to RevenueCat")
                        
                        // Transactionを完了としてマーク（先にマークしてから同期）
                        await transaction.finish()
                        print("[Paywall] Transaction finished")
                        
                        // 重要: RevenueCat側でentitlementが反映されるまで待機（3秒）
                        // recordPurchase()の後、RevenueCat側の処理が完了するまで時間がかかる
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        print("[Paywall] Waited 3 seconds for RevenueCat processing")
                        
                        // 購入状態を同期して完了を確認（リトライ付き、待機時間を増やす）
                        var retryCount = 0
                        let maxRetries = 5  // 3回から5回に増やす
                        var purchaseCompleted = false
                        
                        while retryCount < maxRetries && !purchaseCompleted {
                            // RevenueCat側の購入を同期
                            do {
                                _ = try await Purchases.shared.syncPurchases()
                                print("[Paywall] SyncPurchases completed (attempt \(retryCount + 1))")
                            } catch {
                                print("[Paywall] SyncPurchases error: \(error.localizedDescription)")
                            }
                            
                            // サーバー側も同期（重要: これがないとDBに反映されない）
                            await SubscriptionManager.shared.syncNow()
                            
                            // 購入完了を確認
                            if let info = try? await Purchases.shared.customerInfo() {
                                let subscription = SubscriptionInfo(info: info)
                                await MainActor.run {
                                    appState.updateSubscriptionInfo(subscription)
                                }
                                
                                print("[Paywall] Purchase completion check: isEntitled=\(subscription.isEntitled), plan=\(subscription.plan), status=\(subscription.status)")
                                
                                if subscription.isEntitled {
                                    purchaseCompleted = true
                                    print("[Paywall] Purchase verified: isEntitled=true")
                                    await MainActor.run {
                                        if !hasCompletedPurchase {
                                            hasCompletedPurchase = true
                                            onPurchaseCompleted?()
                                        }
                                    }
                                } else {
                                    retryCount += 1
                                    if retryCount < maxRetries {
                                        print("[Paywall] Purchase not yet entitled, retrying... (\(retryCount)/\(maxRetries))")
                                        // 2秒待ってからリトライ（1秒から2秒に増やす）
                                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                                    }
                                }
                            }
                        }
                        
                        if !purchaseCompleted {
                            print("[Paywall] Warning: Purchase completed but entitlement not verified after \(maxRetries) retries")
                            // それでも購入状態を確認（サーバー同期が遅延している可能性）
                            await checkAndNotifyPurchaseCompletion()
                        }
                    } catch {
                        print("[Paywall] Transaction verification or sync failed: \(error.localizedDescription)")
                        await MainActor.run {
                            purchaseError = error
                            showErrorAlert = true
                        }
                        // エラー時も購入状態を確認（RevenueCatの同期が失敗してもStoreKit購入は成功している可能性）
                        await checkAndNotifyPurchaseCompletion()
                    }
                case .unverified(_, let error):
                    print("[Paywall] StoreKit transaction unverified: \(error.localizedDescription)")
                    await MainActor.run {
                        purchaseError = error
                        showErrorAlert = true
                    }
                }
            case .userCancelled:
                print("[Paywall] StoreKit purchase cancelled by user")
            case .pending:
                print("[Paywall] StoreKit purchase pending (requires approval)")
            @unknown default:
                print("[Paywall] StoreKit purchase unknown result")
            }
        case .failure(let error):
            print("[Paywall] StoreKit purchase failed: \(error.localizedDescription)")
            await MainActor.run {
                purchaseError = error
                showErrorAlert = true
            }
        }
    }
    
    /// StoreKit購入後の状態をRevenueCatに同期（onDisappear用）
    @available(iOS 17.0, *)
    private func syncPurchaseState() async {
        // 既に同期中または購入完了済みならスキップ
        guard !isSyncing && !hasCompletedPurchase else { return }
        
        isSyncing = true
        defer { isSyncing = false }
        
        await checkAndNotifyPurchaseCompletion()
    }
    
    /// 購入状態を確認して完了を通知（共通処理）
    @available(iOS 17.0, *)
    private func checkAndNotifyPurchaseCompletion() async {
        do {
            // RevenueCatの購入状態を同期
            _ = try await Purchases.shared.syncPurchases()
            
            // サーバー側のPostgreSQLも同期（重要: これがないとisEntitledが正しく判定されない）
            await SubscriptionManager.shared.syncNow()
            
            // 最新のCustomerInfoを取得して状態を更新
            if let info = try? await Purchases.shared.customerInfo() {
                await MainActor.run {
                    let subscription = SubscriptionInfo(info: info)
                    appState.updateSubscriptionInfo(subscription)
                    
                    print("[Paywall] Purchase completion check: isEntitled=\(subscription.isEntitled), plan=\(subscription.plan), status=\(subscription.status)")
                    
                    // 購入が完了している場合はコールバックを呼ぶ（二重呼び出し防止）
                    if subscription.isEntitled && !hasCompletedPurchase {
                        print("[Paywall] Purchase completed successfully, calling onPurchaseCompleted")
                        hasCompletedPurchase = true
                        onPurchaseCompleted?()
                    } else if !subscription.isEntitled {
                        print("[Paywall] Purchase completed but not entitled yet. isEntitled=\(subscription.isEntitled), plan=\(subscription.plan)")
                    }
                }
            }
        } catch {
            print("[Paywall] Sync error after StoreKit purchase: \(error.localizedDescription)")
            // エラー時もサーバー同期を試みる
            await SubscriptionManager.shared.syncNow()
            
            // エラー時も最新のCustomerInfoを取得して購入状態を確認
            if let info = try? await Purchases.shared.customerInfo() {
                await MainActor.run {
                    let subscription = SubscriptionInfo(info: info)
                    appState.updateSubscriptionInfo(subscription)
                    
                    print("[Paywall] Purchase completion check (after error): isEntitled=\(subscription.isEntitled), plan=\(subscription.plan), status=\(subscription.status)")
                    
                    // 購入が完了している場合はコールバックを呼ぶ（同期エラーでも購入は成功している可能性）
                    if subscription.isEntitled && !hasCompletedPurchase {
                        print("[Paywall] Purchase completed successfully (after error), calling onPurchaseCompleted")
                        hasCompletedPurchase = true
                        onPurchaseCompleted?()
                    }
                }
            }
        }
    }
}
