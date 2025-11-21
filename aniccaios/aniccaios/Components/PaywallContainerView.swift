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
    @State private var customerInfo: CustomerInfo?
    @State private var loadError: Error?
    @State private var showStoreKitFallback = false
    @State private var fallbackProductIDs: [String] = []
    @State private var purchaseError: Error?
    @State private var showErrorAlert = false
    @State private var isSyncing = false
    
    // RevenueCatUIのCarouselViewの0除算エラーを完全回避するため、StoreKitを強制使用
    // StoreKitはApple純正UIで0除算のリスクがなく、より安全
    private let forceStoreKit = true

    var body: some View {
        Group {
            // 【修正】商品パッケージが空の場合は表示しない（0除算クラッシュ回避）
            if let offering, offering.isSafeToDisplay {
                // RevenueCatUIのCarouselViewの0除算エラーを回避するため、StoreKitを強制使用
                if forceStoreKit {
                    if #available(iOS 17.0, *) {
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
                                // ビューが消えた時に購入状態を確認
                                Task {
                                    await syncPurchaseState()
                                }
                            }
                    } else {
                        // iOS 17.0未満の場合はRevenueCatUIにフォールバック
                        RevenueCatUI.PaywallView(
                            offering: offering,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
                        }
                    }
                } else {
                    // RevenueCatUIのPaywallViewはofferingとcustomerInfoの両方が必要
                    if #available(iOS 17.0, *) {
                        RevenueCatUI.PaywallView(
                            offering: offering,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            // 同期中でも閉じられるようにする
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
                        }
                    } else {
                        RevenueCatUI.PaywallView(
                            offering: offering,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
                        }
                    }
                }
            // 【修正】キャッシュ利用時もStoreKitを優先して使用
            } else if let cached = appState.cachedOffering, cached.isSafeToDisplay {
                // Use cached offering immediately while loading fresh data
                if forceStoreKit {
                    if #available(iOS 17.0, *) {
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
                                // ビューが消えた時に購入状態を確認
                                Task {
                                    await syncPurchaseState()
                                }
                            }
                    } else {
                        // iOS 17.0未満の場合はRevenueCatUIにフォールバック
                        RevenueCatUI.PaywallView(
                            offering: cached,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .onAppear {
                            offering = cached
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
                        }
                    }
                } else {
                    if #available(iOS 17.0, *) {
                        RevenueCatUI.PaywallView(
                            offering: cached,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .onAppear {
                            offering = cached
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
                        }
                    } else {
                        RevenueCatUI.PaywallView(
                            offering: cached,
                            displayCloseButton: true
                        )
                        .onRequestedDismissal {
                            if !isSyncing {
                                onDismissRequested?()
                            }
                        }
                        .onPurchaseCompleted { transaction, customerInfo in
                            handlePurchaseSuccess(transaction: transaction, customerInfo: customerInfo)
                        }
                        .onRestoreCompleted { customerInfo in
                            handleRestoreSuccess(customerInfo: customerInfo)
                        }
                        .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                            if newValue {
                                onPurchaseCompleted?()
                            }
                        }
                        .onAppear {
                            offering = cached
                        }
                        .alert("購入エラー", isPresented: $showErrorAlert) {
                            Button("OK") {
                                purchaseError = nil
                                isSyncing = false
                            }
                            Button("閉じる") {
                                purchaseError = nil
                                isSyncing = false
                                onDismissRequested?()
                            }
                        } message: {
                            Text(purchaseError?.localizedDescription ?? "購入処理中にエラーが発生しました。")
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
            
            // customerInfoを取得（RevenueCatUIのPaywallViewが期待している）
            if customerInfo == nil {
                customerInfo = try? await Purchases.shared.customerInfo()
            }
            
            if offering == nil {
                await loadOffering()
            }
            // 購入状態を確実に同期
            if let info = try? await Purchases.shared.syncPurchases() {
                await MainActor.run {
                    let subscription = SubscriptionInfo(info: info)
                    customerInfo = info
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
            guard let resolvedOffering = offerings
                .offering(identifier: AppConfig.revenueCatPaywallId) ?? offerings.current else {
                print("[Paywall] Offering not found: identifier=\(AppConfig.revenueCatPaywallId), current=\(offerings.current?.identifier ?? "nil")")
                offering = nil
                fallbackProductIDs = []
                showStoreKitFallback = true
                appState.updatePurchaseEnvironment(.accountMissing)
                return
            }
            
            // 表示安全性を一本化チェック（NGはStoreKitに即フォールバック）
            guard resolvedOffering.isSafeToDisplay else {
                print("[Paywall] Offering is not safe to display: identifier=\(resolvedOffering.identifier), packages=\(resolvedOffering.availablePackages.count)")
                offering = nil
                fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
                showStoreKitFallback = true
                appState.updatePurchaseEnvironment(.accountMissing)
                return
            }
            
            appState.updatePurchaseEnvironment(.ready)
            offering = resolvedOffering
            fallbackProductIDs = resolvedOffering.availablePackages.map { $0.storeProduct.productIdentifier }
            showStoreKitFallback = false
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

    private func handlePurchaseSuccess(transaction: StoreTransaction?, customerInfo: CustomerInfo) {
        // 購入成功時の処理
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else {
            // エンタイトルが有効でない場合
            purchaseError = NSError(domain: "PurchaseError", code: -1, userInfo: [NSLocalizedDescriptionKey: "購入は完了しましたが、サブスクリプションが有効化されていません。"])
            showErrorAlert = true
            return
        }
        
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        
        // 購入直後にサーバへ同期（タイムアウト付き、非ブロッキング）
        Task {
            isSyncing = true
            defer { isSyncing = false }
            
            do {
                // タイムアウト付きで同期
                try await withTimeout(seconds: 10) {
                    await SubscriptionManager.shared.syncNow()
                }
                await MainActor.run {
                    onPurchaseCompleted?()
                }
            } catch {
                // タイムアウトやエラーでも購入完了は通知（バックグラウンドで再試行）
                print("[Paywall] Sync error (non-blocking): \(error.localizedDescription)")
                await MainActor.run {
                    onPurchaseCompleted?()
                }
            }
        }
    }
    
    private func handleRestoreSuccess(customerInfo: CustomerInfo) {
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else { return }
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        // リストア時もタイムアウト付きで同期（非ブロッキング）
        Task {
            isSyncing = true
            defer { isSyncing = false }
            do {
                try await withTimeout(seconds: 10) {
                    await SubscriptionManager.shared.syncNow()
                }
            } catch {
                print("[Paywall] Restore sync error (non-blocking): \(error.localizedDescription)")
            }
        }
    }
    
    private func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw NSError(domain: "TimeoutError", code: -1, userInfo: [NSLocalizedDescriptionKey: "タイムアウトしました"])
            }
            
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
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
    
    @ViewBuilder
    @available(iOS 17.0, *)
    private func storeKitPaywallView(offering: Offering) -> some View {
        SubscriptionStoreView.forOffering(offering)
    }
    
    /// StoreKit購入完了時の処理
    @available(iOS 17.0, *)
    private func handleStoreKitPurchaseCompletion(product: Product, result: Result<Product.PurchaseResult, Error>) async {
        switch result {
        case .success(let purchaseResult):
            switch purchaseResult {
            case .success(let verification):
                do {
                    let transaction = try checkVerified(verification)
                    print("[Paywall] StoreKit purchase completed: \(product.id)")
                    
                    // RevenueCatに購入を記録
                    isSyncing = true
                    defer { isSyncing = false }
                    
                    _ = try await Purchases.shared.recordPurchase(transaction)
                    
                    // RevenueCatの購入状態を同期
                    _ = try await Purchases.shared.syncPurchases()
                    
                    // 最新のCustomerInfoを取得して状態を更新
                    if let info = try? await Purchases.shared.customerInfo() {
                        await MainActor.run {
                            let subscription = SubscriptionInfo(info: info)
                            appState.updateSubscriptionInfo(subscription)
                            
                            // 購入が完了している場合はコールバックを呼ぶ
                            if subscription.isEntitled {
                                onPurchaseCompleted?()
                            }
                        }
                    }
                    
                    // Transactionを完了としてマーク
                    await transaction.finish()
                } catch {
                    print("[Paywall] Transaction verification or sync failed: \(error.localizedDescription)")
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
        // 既に同期中ならスキップ
        guard !isSyncing else { return }
        
        isSyncing = true
        defer { isSyncing = false }
        
        do {
            // RevenueCatの購入状態を同期
            _ = try await Purchases.shared.syncPurchases()
            
            // 最新のCustomerInfoを取得して状態を更新
            if let info = try? await Purchases.shared.customerInfo() {
                await MainActor.run {
                    let subscription = SubscriptionInfo(info: info)
                    appState.updateSubscriptionInfo(subscription)
                    
                    // 購入が完了している場合はコールバックを呼ぶ
                    if subscription.isEntitled {
                        onPurchaseCompleted?()
                    }
                }
            }
        } catch {
            print("[Paywall] Sync error after StoreKit purchase: \(error.localizedDescription)")
        }
    }
    
    /// StoreKit 2のTransaction検証
    @available(iOS 15.0, *)
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
}


