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
                    subscriptionSection
                    personalizationSection
                    alarmSettingsSection
                    problemsSection
                    idealTraitsSection
                    signOutSection
                    deleteAccountSection
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .navigationTitle(String(localized: "settings_title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
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
                deleteAccountAlertButtons
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
            subscriptionSheetContent
        }
    }
    
    // MARK: - Subscription Section
    @ViewBuilder
    private var subscriptionSection: some View {
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
    }
    
    // MARK: - Personalization Section
    @ViewBuilder
    private var personalizationSection: some View {
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
    }
    
    // MARK: - Alarm Settings Section
    @ViewBuilder
    private var alarmSettingsSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(String(localized: "settings_alarm_title"))
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)
                    .padding(.bottom, AppTheme.Spacing.xs)
                
                // Stickyモード（全習慣共通）
                Toggle(
                    String(localized: "settings_sticky_mode_title"),
                    isOn: Binding(
                        get: { appState.userProfile.stickyModeEnabled },
                        set: { newValue in
                            var profile = appState.userProfile
                            profile.stickyModeEnabled = newValue
                            appState.updateUserProfile(profile, sync: true)
                        }
                    )
                )
                .tint(AppTheme.Colors.accent)
                
                Text(String(localized: "settings_sticky_mode_description"))
                    .font(AppTheme.Typography.caption1Dynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
    }
    
    // MARK: - Problems Section
    @ViewBuilder
    private var problemsSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text(String(localized: "settings_problems_title"))
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)
                    .padding(.bottom, AppTheme.Spacing.xs)
                
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: AppTheme.Spacing.sm)], spacing: AppTheme.Spacing.sm) {
                    ForEach(problemOptions, id: \.self) { key in
                        problemButton(key: key)
                    }
                }
            }
        }
    }
    
    // MARK: - Ideal Traits Section
    @ViewBuilder
    private var idealTraitsSection: some View {
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
    }
    
    // MARK: - Sign Out Section
    @ViewBuilder
    private var signOutSection: some View {
        CardView {
            HStack {
                Text(String(localized: "common_sign_out"))
                    .foregroundStyle(.red)
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
    }
    
    // MARK: - Delete Account Section
    @ViewBuilder
    private var deleteAccountSection: some View {
        CardView {
            HStack {
                Text(String(localized: "settings_delete_account"))
                    .foregroundStyle(.red)
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
    
    // MARK: - Toolbar Content
    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
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
    
    // MARK: - Delete Account Alert Buttons
    @ViewBuilder
    private var deleteAccountAlertButtons: some View {
        Button(String(localized: "common_cancel"), role: .cancel) {}
        Button(String(localized: "settings_delete_account_confirm"), role: .destructive) {
            Task {
                await deleteAccount()
            }
        }
    }
    
    @ViewBuilder
    private var subscriptionSheetContent: some View {
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
    
    private let idealTraitOptions = [
        "kind", "altruistic", "confident", "mindful", "optimistic",
        "resilient", "disciplined", "honest", "calm"
    ]
    
    private let problemOptions = [
        "rumination",
        "jealousy",
        "self_criticism",
        "anxiety"
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
    
    @ViewBuilder
    private func problemButton(key: String) -> some View {
        let isSelected = appState.userProfile.problems.contains(key)
        Button {
            var next = appState.userProfile.problems
            if isSelected {
                next.removeAll { $0 == key }
            } else {
                next.append(key)
            }
            var profile = appState.userProfile
            profile.problems = next
            appState.updateUserProfile(profile, sync: true)
        } label: {
            Text(NSLocalizedString("problem_\(key)", comment: ""))
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
                .cornerRadius(AppTheme.Radius.md)
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
