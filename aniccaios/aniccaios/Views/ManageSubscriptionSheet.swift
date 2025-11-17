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
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
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
                    }
                }
            }
        }
        .task {
            await loadOffering()
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
                    Text(String(format: NSLocalizedString("settings_subscription_until", comment: ""), dateFormatter.string(from: date)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
            
            // Manage on App Store
            if let managementURL = appState.subscriptionInfo.managementURL {
                Button {
                    UIApplication.shared.open(managementURL)
                } label: {
                    Text("settings_subscription_manage_app_store")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            
            // Contact support
            Link(destination: URL(string: "https://aniccaai.com/support")!) {
                Text("Contact support")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            
            // Cancel subscription (only if subscribed)
            if appState.subscriptionInfo.plan != .free,
               let managementURL = appState.subscriptionInfo.managementURL {
                Button {
                    UIApplication.shared.open(managementURL)
                } label: {
                    Text("settings_subscription_cancel")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
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

