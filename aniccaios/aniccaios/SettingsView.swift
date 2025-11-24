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
        navigationContainer {
            List {
                // Subscription (復活)
                Section(String(localized: "settings_subscription_title")) {
                    HStack {
                        Text(String(localized: "settings_subscription_plan"))
                        Spacer()
                        Text(appState.subscriptionInfo.displayPlanName)
                    }
                    // SubscriptionInfoにmonthlyUsageCountとmonthlyUsageLimitが存在する場合のみ表示
                    if let used = appState.subscriptionInfo.monthlyUsageCount,
                       let limit = appState.subscriptionInfo.monthlyUsageLimit {
                        HStack {
                            Text(String(localized: "settings_subscription_usage"))
                            Spacer()
                            Text("\(used)/\(limit)")
                        }
                    }
                    Button(String(localized: "settings_subscription_manage")) {
                        showingManageSubscription = true
                    }
                }
                
                // Personalization
                Section(String(localized: "settings_personalization")) {
                    TextField(String(localized: "settings_name_label"), text: $displayName)
                    Picker(String(localized: "settings_language_label"), selection: $preferredLanguage) {
                        Text(String(localized: "language_preference_ja")).tag(LanguagePreference.ja)
                        Text(String(localized: "language_preference_en")).tag(LanguagePreference.en)
                    }
                }
                
                // 理想の姿セクション（Phase 1に統合済み）
                Section(String(localized: "settings_ideal_traits")) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                        ForEach(idealTraitOptions, id: \.self) { trait in
                            idealTraitButton(trait: trait)
                        }
                    }
                }
                
                // Sign out
                Section {
                    Button(String(localized: "common_sign_out")) {
                        appState.signOutAndWipe()
                        dismiss()
                    }
                }
                
                // Delete account
                Section {
                    Button(role: .destructive) {
                        isShowingDeleteAlert = true
                    } label: {
                        Text("Delete Account")
                    }
                }
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
            .alert("Delete Account", isPresented: $isShowingDeleteAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        await deleteAccount()
                    }
                }
            } message: {
                Text("This action cannot be undone. All your data, including purchase history and usage data, will be permanently deleted.")
            }
            .alert("Error", isPresented: Binding(
                get: { deleteAccountError != nil },
                set: { if !$0 { deleteAccountError = nil } }
            )) {
                Button("OK") {
                    deleteAccountError = nil
                }
            } message: {
                if let error = deleteAccountError {
                    Text(error.localizedDescription)
                }
            }
        }
        .sheet(isPresented: $showingManageSubscription) {
            RevenueCatUI.CustomerCenterView()
                .onCustomerCenterRestoreCompleted { customerInfo in
                    Task {
                        let subscription = SubscriptionInfo(info: customerInfo)
                        await MainActor.run {
                            appState.updateSubscriptionInfo(subscription)
                        }
                        // Customer Centerを閉じた後に同期
                        await SubscriptionManager.shared.syncNow()
                    }
                }
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }
    
    private let idealTraitOptions = [
        "confident", "empathetic", "gentle", "optimistic", "creative",
        "energetic", "calm", "assertive", "motivational", "supportive",
        "direct", "encouraging", "analytical", "patient", "friendly", "professional"
    ]
    
    @ViewBuilder
    private func idealTraitButton(trait: String) -> some View {
        let isSelected = appState.userProfile.idealTraits.contains(trait)
        
        Button(action: {
            var traits = appState.userProfile.idealTraits
            if isSelected {
                traits.removeAll { $0 == trait }
            } else {
                traits.append(trait)
            }
            appState.updateIdealTraits(traits)
        }) {
            Text(trait)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? Color.black : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .secondary)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
    
    private func loadPersonalizationData() {
        displayName = appState.userProfile.displayName
        preferredLanguage = appState.userProfile.preferredLanguage
    }
    
    private func save() {
        isSaving = true
        var profile = appState.userProfile
        profile.displayName = displayName
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
