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
    @State private var purchaseError: Error?
    @State private var showErrorAlert = false
    @State private var isSyncing = false

    var body: some View {
        Group {
            if let offering {
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
            } else if let cached = appState.cachedOffering {
                // Use cached offering immediately while loading fresh data
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


