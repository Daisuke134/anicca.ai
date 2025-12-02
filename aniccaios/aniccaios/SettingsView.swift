import ComponentsKit
import RevenueCat
import RevenueCatUI
import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var isSaving = false
    @State private var displayName: String = ""
    @State private var preferredLanguage: LanguagePreference = .en
    @State private var isShowingDeleteAlert = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: Error?
    @State private var showingManageSubscription = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.md) {

                    // --------------------------
                    // Subscription Section
                    // --------------------------
                    CardView {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {

                            Text(String(localized: "settings_subscription_title"))
                                .font(AppTheme.Typography.headlineDynamic)
                                .foregroundStyle(AppTheme.Colors.label)
                                .padding(.bottom, AppTheme.Spacing.xs)

                            SectionRow.button(
                                label: String(localized: "settings_subscription_current_plan"),
                                title: appState.subscriptionInfo.displayPlanName,
                                action: { showingManageSubscription = true }
                            )

                            if let used = appState.subscriptionInfo.monthlyUsageCount,
                               let limit = appState.subscriptionInfo.monthlyUsageLimit {
                                SectionRow.text(
                                    label: String(localized: "settings_subscription_usage"),
                                    text: "\(used)/\(limit)"
                                )
                            } else if appState.subscriptionInfo.plan != .free {
                                SectionRow(label: String(localized: "settings_subscription_usage")) {
                                    Text(String(localized: "settings_subscription_usage_syncing"))
                                        .font(.footnote)
                                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                }
                            }

                            SectionRow.button(
                                label: String(localized: "settings_subscription_manage"),
                                title: String(localized: "settings_subscription_manage"),
                                action: { showingManageSubscription = true }
                            )

                        }
                    }

                    // --------------------------
                    // Personalization / Name / Language
                    // --------------------------
                    CardView {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Text(String(localized: "settings_personalization"))
                                .font(AppTheme.Typography.headlineDynamic)
                                .foregroundStyle(AppTheme.Colors.label)
                                .padding(.bottom, AppTheme.Spacing.xs)

                            SectionRow(label: String(localized: "settings_name_label")) {
                                TextField(String(localized: "settings_name_placeholder"), text: $displayName)
                                    .multilineTextAlignment(.trailing)
                                    .textInputAutocapitalization(.words)
                                    .autocorrectionDisabled()
                                    .font(AppTheme.Typography.subheadlineDynamic)
                                    .foregroundStyle(AppTheme.Colors.label)
                            }

                            Picker(
                                String(localized: "settings_language_label"),
                                selection: $preferredLanguage
                            ) {
                                Text(String(localized: "language_preference_ja")).tag(LanguagePreference.ja)
                                Text(String(localized: "language_preference_en")).tag(LanguagePreference.en)
                            }
                        }
                    }

                    // --------------------------
                    // Ideal traits
                    // --------------------------
                    CardView {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                            Text(String(localized: "settings_ideal_traits"))
                                .font(AppTheme.Typography.headlineDynamic)
                                .foregroundStyle(AppTheme.Colors.label)
                                .padding(.bottom, AppTheme.Spacing.xs)

                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                                ForEach(idealTraitOptions, id: \.self) { trait in
                                    idealTraitButton(trait: trait)
                                }
                            }
                        }
                    }

                    // --------------------------
                    // Sign out
                    // --------------------------
                    CardView {
                        HStack {
                            Text(String(localized: "common_sign_out"))
                                .foregroundStyle(AppTheme.Colors.label)
                            Spacer()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        appState.signOutAndWipe()
                        dismiss()
                    }
                    .accessibilityAddTraits(.isButton)

                    // --------------------------
                    // Delete account
                    // --------------------------
                    CardView {
                        HStack {
                            Text(String(localized: "settings_delete_account"))
                            Spacer()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        isShowingDeleteAlert = true
                    }
                    .accessibilityAddTraits(.isButton)

                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .navigationTitle(String(localized: "settings_title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        Text(String(localized: "common_save"))
                            .fontWeight(.semibold)
                    }
                    .controlSize(.large)
                    .disabled(isSaving)
                }
            }
            .onAppear {
                loadPersonalizationData()
                Task { await SubscriptionManager.shared.syncNow() }
            }
            .safeAreaInset(edge: .bottom) {
                // Guideline 3.1.2対応: 法的リンクを常設（購入フロー外からも1タップ到達）
                LegalLinksView()
            }
            .background(AppBackground())
            .alert(String(localized: "settings_delete_account"), isPresented: $isShowingDeleteAlert) {
                Button(String(localized: "common_cancel"), role: .cancel) {}
                Button(String(localized: "settings_delete_account_confirm"), role: .destructive) {
                    Task {
                        await deleteAccount()
                    }
                }
            } message: {
                Text(String(localized: "settings_delete_account_message"))
            }
            .alert(String(localized: "common_error"), isPresented: Binding(
                get: { deleteAccountError != nil },
                set: { if !$0 { deleteAccountError = nil } }
            )) {
                Button(String(localized: "common_ok")) {
                    deleteAccountError = nil
                }
            } message: {
                if let error = deleteAccountError {
                    Text(error.localizedDescription)
                }
            }
        }
        .sheet(isPresented: $showingManageSubscription) {
            if appState.subscriptionInfo.plan == .free {
                PaywallContainerView(
                    forcePresent: true,
                    onDismissRequested: { showingManageSubscription = false }
                )
                    .environment(\.locale, .autoupdatingCurrent)
                    .task { await SubscriptionManager.shared.refreshOfferings() }
            } else {
                RevenueCatUI.CustomerCenterView()
                    .environment(\.locale, .autoupdatingCurrent)
                    .onCustomerCenterRestoreCompleted { customerInfo in
                        Task {
                            let subscription = SubscriptionInfo(info: customerInfo)
                            await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                            await SubscriptionManager.shared.syncNow()
                        }
                    }
            }
        }
    }
    
    private let idealTraitOptions = [
        "kind", "altruistic", "confident", "mindful", "optimistic",
        "resilient", "disciplined", "honest", "calm"
    ]
    
    @ViewBuilder
    private func idealTraitButton(trait: String) -> some View {
        let isSelected = appState.userProfile.idealTraits.contains(trait)

        Button {
            var traits = appState.userProfile.idealTraits
            if isSelected {
                traits.removeAll { $0 == trait }
            } else {
                traits.append(trait)
            }
            appState.updateIdealTraits(traits)
        } label: {
            Text(NSLocalizedString("ideal_trait_\(trait)", comment: ""))
                .font(.subheadline)
                .lineLimit(nil)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    isSelected
                    ? AppTheme.Colors.buttonSelected
                    : AppTheme.Colors.buttonUnselected
                )
                .foregroundColor(
                    isSelected
                    ? AppTheme.Colors.buttonTextSelected
                    : AppTheme.Colors.buttonTextUnselected
                )
                .cornerRadius(AppTheme.Radius.md)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                        .stroke(
                            isSelected
                            ? AppTheme.Colors.border
                            : AppTheme.Colors.borderLight,
                            lineWidth: isSelected ? 2 : 1
                        )
                )
        }
        .buttonStyle(.plain)
    }
    
    private func loadPersonalizationData() {
        // 既存の名前を読み込む
        displayName = appState.userProfile.displayName
        preferredLanguage = appState.userProfile.preferredLanguage
    }
    
    private func save() {
        isSaving = true
        var profile = appState.userProfile
        // 入力が空の場合は既存の名前を保持、入力がある場合は更新
        if !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            profile.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        profile.preferredLanguage = preferredLanguage
        appState.updateUserProfile(profile, sync: true)
        isSaving = false
        dismiss()
    }
    
    // Guideline 5.1.1(v)対応: アカウント削除
    private func deleteAccount() async {
        isDeletingAccount = true
        deleteAccountError = nil
        
        guard case .signedIn(let credentials) = appState.authStatus else {
            await MainActor.run {
                deleteAccountError = NSError(domain: "AccountDeletionError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
                isDeletingAccount = false
            }
            return
        }
        
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/account"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        // JWT/Bearer を優先的に付与（存在すれば）
        try? await NetworkSessionManager.shared.setAuthHeaders(for: &request)
        
        do {
            let (_, response) = try await NetworkSessionManager.shared.session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "AccountDeletionError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }
            
            if httpResponse.statusCode == 204 {
                // 削除成功: RevenueCatからログアウトしてアプリ状態をリセット
                await SubscriptionManager.shared.handleLogout()
                await MainActor.run {
                    appState.signOutAndWipe()
                }
                // 設定画面を閉じる
                await MainActor.run {
                    dismiss()
                }
            } else {
                throw NSError(domain: "AccountDeletionError", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Server error: \(httpResponse.statusCode)"])
            }
        } catch {
            await MainActor.run {
                deleteAccountError = error
                isDeletingAccount = false
            }
        }
    }
}
