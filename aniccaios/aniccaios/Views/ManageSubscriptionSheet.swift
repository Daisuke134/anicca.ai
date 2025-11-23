import ComponentsKit
import RevenueCat
import RevenueCatUI
import SwiftUI

struct ManageSubscriptionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var offering: Offering?
    @State private var isLoading = true
    @State private var isPurchasing = false
    @State private var purchaseError: Error?
    @State private var showingCustomerCenter = false
    @State private var isPresentingManageSubscriptions = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Environment status warning
                    if appState.purchaseEnvironmentStatus == .accountMissing {
                        Label(String(localized: "settings_subscription_account_missing"),
                              systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .padding()
                    }
                    
                    // Current plan section
                    if appState.subscriptionInfo.plan != .free {
                        currentPlanSection
                    }
                    
                    // Available plans
                    if let offering = offering {
                        plansSection(offering: offering)
                    } else if isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        Text("settings_subscription_no_plans")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding()
                    }
                    
                    // Actions
                    actionsSection
                }
                .padding()
            }
            .navigationTitle("settings_subscription_manage_title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(width: 24, height: 24)
                            .contentShape(Rectangle())
                    }
                }
            }
        }
        .task {
            await loadOffering()
        }
        .sheet(isPresented: $showingCustomerCenter) {
            RevenueCatUI.CustomerCenterView()
                .onCustomerCenterRestoreCompleted { customerInfo in
                    Task {
                        let subscription = SubscriptionInfo(info: customerInfo)
                        await MainActor.run {
                            appState.updateSubscriptionInfo(subscription)
                        }
                    }
                }
                .onCustomerCenterShowingManageSubscriptions {
                    if isPresentingManageSubscriptions { return }
                    isPresentingManageSubscriptions = true
                    
                    // 下位のシートを先に全て閉じる（重ね表示防止）
                    showingCustomerCenter = false
                    dismiss() // ManageSubscriptionSheet 自身も閉じる
                    
                    Task {
                        // プレゼンテーション競合を避けるため少し待つ
                        try? await Task.sleep(nanoseconds: 350_000_000)
                        do {
                            try await Purchases.shared.showManageSubscriptions()
                        } catch {
                            print("[ManageSubscriptionSheet] Failed to show manage subscriptions: \(error)")
                            if let managementURL = appState.subscriptionInfo.managementURL {
                                await MainActor.run { UIApplication.shared.open(managementURL) }
                            }
                        }
                        await MainActor.run { isPresentingManageSubscriptions = false }
                    }
                }
        }
    }
    
    private var currentPlanSection: some View {
        SUCard(model: CardVM(), content: {
            VStack(alignment: .leading, spacing: 8) {
                Text("settings_subscription_current_plan")
                    .font(.headline)
                Text(appState.subscriptionInfo.displayPlanName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let date = appState.subscriptionInfo.currentPeriodEnd {
                    if appState.subscriptionInfo.willRenew == false {
                        Text(String(format: NSLocalizedString("settings_subscription_canceled_until", comment: ""), dateFormatter.string(from: date)))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(String(format: NSLocalizedString("settings_subscription_until", comment: ""), dateFormatter.string(from: date)))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        })
    }
    
    @ViewBuilder
    private func plansSection(offering: Offering) -> some View {
        ForEach(offering.availablePackages, id: \.identifier) { package in
            planCard(package: package)
        }
    }
    
    private func planCard(package: Package) -> some View {
        let isCurrentPlan = appState.subscriptionInfo.productIdentifier == package.storeProduct.productIdentifier
        
        return SUCard(model: CardVM(), content: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(package.storeProduct.localizedTitle)
                            .font(.headline)
                        if !package.storeProduct.localizedDescription.isEmpty {
                            Text(package.storeProduct.localizedDescription)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if isCurrentPlan {
                        SUBadge(model: {
                            var vm = BadgeVM()
                            vm.title = String(localized: "settings_subscription_current")
                            vm.color = .init(main: .success, contrast: .white)
                            return vm
                        }())
                    }
                }
                
                Text(package.localizedPriceString)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                
                if !isCurrentPlan {
                    SUButton(
                        model: {
                            var vm = ButtonVM()
                            vm.title = String(localized: "settings_subscription_select")
                            vm.style = .filled
                            vm.size = .medium
                            vm.isFullWidth = true
                            vm.isEnabled = !isPurchasing
                            vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                            return vm
                        }(),
                        action: {
                            Task {
                                await purchasePackage(package)
                            }
                        }
                    )
                }
            }
        })
    }
    
    private var actionsSection: some View {
        VStack(spacing: 12) {
            // Restore purchases
            Button {
                Task {
                    await restorePurchases()
                }
            } label: {
                Text("settings_subscription_restore")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(isPurchasing)
            
            // Customer Center（アプリ内でキャンセル処理が完結）
            Button {
                showingCustomerCenter = true
            } label: {
                Text("settings_subscription_manage")
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            
            // Contact support
            Link(destination: URL(string: "https://aniccaai.com/support")!) {
                Text("Contact support")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }
    
    private func loadOffering() async {
        isLoading = true
        defer { isLoading = false }
        
        // Use cached offering if available
        if let cached = appState.cachedOffering {
            offering = cached
            return
        }
        
        // Otherwise refresh
        await SubscriptionManager.shared.refreshOfferings()
        offering = appState.cachedOffering
    }
    
    private func purchasePackage(_ package: Package) async {
        isPurchasing = true
        purchaseError = nil
        
        do {
            let (_, customerInfo, _) = try await Purchases.shared.purchase(package: package)
            let subscription = SubscriptionInfo(info: customerInfo)
            await MainActor.run {
                appState.updateSubscriptionInfo(subscription)
                isPurchasing = false
            }
        } catch {
            await MainActor.run {
                purchaseError = error
                isPurchasing = false
            }
        }
    }
    
    private func restorePurchases() async {
        isPurchasing = true
        purchaseError = nil
        
        do {
            let customerInfo = try await Purchases.shared.restorePurchases()
            let subscription = SubscriptionInfo(info: customerInfo)
            await MainActor.run {
                appState.updateSubscriptionInfo(subscription)
                isPurchasing = false
            }
        } catch {
            await MainActor.run {
                purchaseError = error
                isPurchasing = false
            }
        }
    }
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }
}

