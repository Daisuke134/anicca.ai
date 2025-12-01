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
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Environment status warning
                    if appState.purchaseEnvironmentStatus == .accountMissing {
                        Label(String(localized: "settings_subscription_account_missing"),
                              systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .padding()
                    }
                    
                    // Current plan section (show also when free)
                    currentPlanSection
                    
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
            .background(AppBackground())
            .navigationTitle(String(localized: "settings_subscription_manage"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) { dismiss() }
                }
            }
        }
        .task {
            await loadOffering()
        }
        .sheet(isPresented: $showingCustomerCenter) {
            RevenueCatUI.CustomerCenterView()
                .environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))
                .onCustomerCenterRestoreCompleted { customerInfo in
                    Task {
                        let subscription = SubscriptionInfo(info: customerInfo)
                        await MainActor.run {
                            appState.updateSubscriptionInfo(subscription)
                        }
                    }
                }
                // 管理シート提示はCustomer Center内部に委譲（ここでは何もしない）
        }
    }
    
    private var currentPlanSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: 8) {
                Text("settings_subscription_current_plan")
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)
                Text(appState.subscriptionInfo.displayPlanName)
                    .font(AppTheme.Typography.subheadlineDynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                if appState.subscriptionInfo.plan == .free {
                    Text(String(localized: "settings_subscription_free_description"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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
        }
    }
    
    @ViewBuilder
    private func plansSection(offering: Offering) -> some View {
        ForEach(offering.availablePackages, id: \.identifier) { package in
            planCard(package: package)
        }
    }
    
    private func planCard(package: Package) -> some View {
        let isCurrentPlan = appState.subscriptionInfo.productIdentifier == package.storeProduct.productIdentifier
        
        return CardView {
            VStack(alignment: .leading, spacing: 8) {
                Text(package.storeProduct.localizedTitle)
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)

                Text(package.storeProduct.localizedDescription)
                    .font(AppTheme.Typography.subheadlineDynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)

                Text(package.localizedPriceString)
                    .font(.title2)
                    .foregroundStyle(AppTheme.Colors.label)

                if !isCurrentPlan {
                    PrimaryButton(
                        title: String(localized: "settings_subscription_select"),
                        isEnabled: !isPurchasing,
                        isLoading: isPurchasing
                    ) {
                        Task { await purchasePackage(package) }
                    }
                }
            }
        }
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
            Link(destination: supportURL) {
                Text(String(localized: "settings_contact_support"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            
            // Legal links (Guideline 3.1.2)
            LegalLinksView()
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
    
    private var supportURL: URL {
        let lang = appState.userProfile.preferredLanguage.rawValue
        return URL(string: "https://aniccaai.com/support/\(lang)")!
    }
}

