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
    @State private var isPurchaseInProgress = false
    @State private var showErrorAlert = false

    var body: some View {
        Group {
            if let offering {
                if #available(iOS 17.0, *) {
                    RevenueCatUI.PaywallView(
                        offering: offering,
                        displayCloseButton: true
                    )
                    .onRequestedDismissal {
                        // 購入中でも閉じられるようにする
                        if !isPurchaseInProgress {
                            onDismissRequested?()
                        }
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handlePurchaseSuccess(customerInfo: customerInfo)
                    }
                    .onPurchaseError { error in
                        handlePurchaseError(error: error)
                    }
                    .onPurchaseInProgress { inProgress in
                        isPurchaseInProgress = inProgress
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreError { error in
                        handleRestoreError(error: error)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { _, newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                    .alert("購入エラー", isPresented: $showErrorAlert) {
                        Button("OK") {
                            purchaseError = nil
                            isPurchaseInProgress = false
                        }
                        Button("閉じる") {
                            purchaseError = nil
                            isPurchaseInProgress = false
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
                        if !isPurchaseInProgress {
                            onDismissRequested?()
                        }
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handlePurchaseSuccess(customerInfo: customerInfo)
                    }
                    .onPurchaseError { error in
                        handlePurchaseError(error: error)
                    }
                    .onPurchaseInProgress { inProgress in
                        isPurchaseInProgress = inProgress
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreError { error in
                        handleRestoreError(error: error)
                    }
                    .onChange(of: appState.subscriptionInfo.isEntitled) { newValue in
                        if newValue {
                            onPurchaseCompleted?()
                        }
                    }
                    .alert("購入エラー", isPresented: $showErrorAlert) {
                        Button("OK") {
                            purchaseError = nil
                            isPurchaseInProgress = false
                        }
                        Button("閉じる") {
                            purchaseError = nil
                            isPurchaseInProgress = false
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
                        if !isPurchaseInProgress {
                            onDismissRequested?()
                        }
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handlePurchaseSuccess(customerInfo: customerInfo)
                    }
                    .onPurchaseError { error in
                        handlePurchaseError(error: error)
                    }
                    .onPurchaseInProgress { inProgress in
                        isPurchaseInProgress = inProgress
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreError { error in
                        handleRestoreError(error: error)
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
                            isPurchaseInProgress = false
                        }
                        Button("閉じる") {
                            purchaseError = nil
                            isPurchaseInProgress = false
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
                        if !isPurchaseInProgress {
                            onDismissRequested?()
                        }
                    }
                    .onPurchaseCompleted { _, customerInfo in
                        handlePurchaseSuccess(customerInfo: customerInfo)
                    }
                    .onPurchaseError { error in
                        handlePurchaseError(error: error)
                    }
                    .onPurchaseInProgress { inProgress in
                        isPurchaseInProgress = inProgress
                    }
                    .onRestoreCompleted { customerInfo in
                        handle(customerInfo: customerInfo)
                    }
                    .onRestoreError { error in
                        handleRestoreError(error: error)
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
                            isPurchaseInProgress = false
                        }
                        Button("閉じる") {
                            purchaseError = nil
                            isPurchaseInProgress = false
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

    private func handlePurchaseSuccess(customerInfo: CustomerInfo) {
        // 購入成功時の処理
        isPurchaseInProgress = false
        purchaseError = nil
        
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else {
            // エンタイトルが有効でない場合
            purchaseError = NSError(domain: "PurchaseError", code: -1, userInfo: [NSLocalizedDescriptionKey: "購入は完了しましたが、サブスクリプションが有効化されていません。"])
            showErrorAlert = true
            return
        }
        
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        
        // 購入直後にサーバへ同期（タイムアウト付き）
        Task {
            await syncWithTimeout()
            await MainActor.run {
                onPurchaseCompleted?()
            }
        }
    }
    
    private func handlePurchaseError(error: Error) {
        // 購入エラー時の処理
        isPurchaseInProgress = false
        purchaseError = error
        showErrorAlert = true
        
        print("[Paywall] Purchase error: \(error.localizedDescription)")
    }
    
    private func handleRestoreError(error: Error) {
        // リストアエラー時の処理
        purchaseError = error
        showErrorAlert = true
        
        print("[Paywall] Restore error: \(error.localizedDescription)")
    }
    
    private func syncWithTimeout() async {
        // タイムアウト付きで同期処理を実行
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                await SubscriptionManager.shared.syncNow()
            }
            
            group.addTask {
                // 10秒でタイムアウト
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
            
            // どちらかが完了したら終了
            _ = await group.next()
            group.cancelAll()
        }
    }
    
    private func handle(customerInfo: CustomerInfo) {
        guard customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true else { return }
        let info = SubscriptionInfo(info: customerInfo)
        appState.updateSubscriptionInfo(info)
        // リストア時もタイムアウト付きで同期
        Task {
            await syncWithTimeout()
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


