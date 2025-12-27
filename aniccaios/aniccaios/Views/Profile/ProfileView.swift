import SwiftUI
import Combine
import Foundation
import RevenueCatUI
import ComponentsKit

/// v0.3 Profile タブ（v3-ui.md 準拠）
struct ProfileView: View {
    @EnvironmentObject private var appState: AppState
    private let showsScreenTimeToggle = false

    @State private var showingManageSubscription = false
    @State private var isShowingDeleteAlert = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: Error?
    @State private var isEditingName = false
    @State private var editingName: String = ""
    @FocusState private var nameFieldFocused: Bool
    @State private var previousNameFieldFocused: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    header

                    accountCard
                    dataIntegrationSection  // v3: Plan の直下に移動
                    traitsCard
                    idealsSection
                    strugglesSection
                    nudgeStrengthSection
                    stickyModeSection
                    accountManagementSection

                    LegalLinksView()
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, AppTheme.Spacing.md)
            }
            .background(AppBackground())
        }
        .sheet(isPresented: $showingManageSubscription) {
            subscriptionSheetContent
                .environmentObject(appState)
        }
        .alert(String(localized: "settings_delete_account"), isPresented: $isShowingDeleteAlert) {
            Button(String(localized: "common_cancel"), role: .cancel) {}
            Button(String(localized: "settings_delete_account_confirm"), role: .destructive) {
                Task { await deleteAccount() }
            }
        } message: {
            Text(String(localized: "settings_delete_account_message"))
        }
        .alert(String(localized: "common_error"), isPresented: Binding(
            get: { deleteAccountError != nil },
            set: { if !$0 { deleteAccountError = nil } }
        )) {
            Button(String(localized: "common_ok")) { deleteAccountError = nil }
        } message: {
            if let error = deleteAccountError { Text(error.localizedDescription) }
        }
    }

    private var header: some View {
        Text(String(localized: "profile_title"))
            .font(.system(size: 30, weight: .bold))
            .foregroundStyle(AppTheme.Colors.label)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 6)
    }

    private var accountCard: some View {
        CardView(cornerRadius: 32) {
            VStack(spacing: 0) {
                // v3: Name をインライン編集
                nameRow
                divider
                Button {
                    showingManageSubscription = true
                } label: {
                    row(label: String(localized: "profile_row_plan"), value: appState.subscriptionInfo.displayPlanName, showsChevron: true)
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    @ViewBuilder
    private var nameRow: some View {
        HStack {
            Text(String(localized: "profile_row_name"))
                .font(.system(size: 16))
                .foregroundStyle(AppTheme.Colors.label)
            Spacer()
            
            if isEditingName {
                TextField("", text: $editingName)
                    .font(.system(size: 16))
                    .foregroundStyle(AppTheme.Colors.label)
                    .multilineTextAlignment(.trailing)
                    .focused($nameFieldFocused)
                    .submitLabel(.done)
                    .onSubmit {
                        saveName()
                    }
                    .onAppear {
                        nameFieldFocused = true
                    }
            } else {
                Text(appState.userProfile.displayName.isEmpty ? "-" : appState.userProfile.displayName)
                    .font(.system(size: 16))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .contentShape(Rectangle())
        .onTapGesture {
            if !isEditingName {
                editingName = appState.userProfile.displayName
                isEditingName = true
            }
        }
        .onChange(of: nameFieldFocused) { focused in
            // フォーカスが外れたら保存
            if !focused && previousNameFieldFocused && isEditingName {
                saveName()
            }
            previousNameFieldFocused = focused
        }
    }
    
    private func saveName() {
        let trimmed = editingName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty && trimmed != appState.userProfile.displayName {
            var profile = appState.userProfile
            profile.displayName = trimmed
            appState.updateUserProfile(profile, sync: true)
        }
        isEditingName = false
    }

    private var traitsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_traits"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(spacing: 14) {
                    Text(String(localized: "profile_traits_summary_placeholder"))
                        .font(.system(size: 16))
                        .foregroundStyle(AppTheme.Colors.label)
                        .multilineTextAlignment(.center)

                    NavigationLink {
                        TraitsDetailView()
                    } label: {
                        HStack {
                            Text(String(localized: "profile_traits_view_full"))
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(AppTheme.Colors.label)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        }
                        .padding(.top, 6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var idealsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_ideal_self"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            // オンボーディングと同一リスト
            ProfileFlowChips(
                options: ["kind", "confident", "early_riser", "runner", "creative", "mindful", "organized", "calm", "healthy", "patient", "focused", "grateful", "brave"],
                selected: Binding(
                    get: { Set(appState.userProfile.ideals) },
                    set: { newValue in
                        var profile = appState.userProfile
                        profile.ideals = Array(newValue)
                        appState.updateUserProfile(profile, sync: true)
                    }
                ),
                labelProvider: { key in
                    NSLocalizedString("ideal_trait_\(key)", comment: "")
                }
            )
        }
    }

    private var strugglesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_current_struggles"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            // オンボーディングと同一リスト
            ProfileFlowChips(
                options: ["procrastination", "anxiety", "poor_sleep", "stress", "focus", "motivation", "self_doubt", "time_management", "burnout", "relationships", "energy", "work_life_balance"],
                selected: Binding(
                    get: { Set(appState.userProfile.struggles) },
                    set: { newValue in
                        var profile = appState.userProfile
                        profile.struggles = Array(newValue)
                        appState.updateUserProfile(profile, sync: true)
                    }
                ),
                labelProvider: { key in
                    NSLocalizedString("problem_\(key)", comment: "")
                }
            )
        }
    }

    private var nudgeStrengthSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_nudge_strength"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 999) {
                HStack(spacing: 8) {
                    ForEach(NudgeIntensity.allCases, id: \.self) { intensity in
                        nudgePill(intensity)
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func nudgePill(_ intensity: NudgeIntensity) -> some View {
        let isSelected = appState.userProfile.nudgeIntensity == intensity
        let title: String = {
            switch intensity {
            case .quiet: return String(localized: "profile_nudge_quiet")
            case .normal: return String(localized: "profile_nudge_normal")
            case .active: return String(localized: "profile_nudge_active")
            }
        }()
        
        Button {
            appState.updateNudgeIntensity(intensity)
        } label: {
            pill(title, isSelected: isSelected)
        }
        .buttonStyle(.plain)
    }

    private var stickyModeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_sticky_mode"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(String(localized: "profile_section_sticky_mode"))
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.label)
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { appState.userProfile.stickyModeEnabled },
                            set: { v in
                                var p = appState.userProfile
                                p.stickyModeEnabled = v
                                appState.updateUserProfile(p, sync: true)
                            }
                        ))
                        .labelsHidden()
                    }
                    Text(String(localized: "profile_sticky_description"))
                        .font(AppTheme.Typography.caption1Dynamic)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
        }
    }

    private var dataIntegrationSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_data_integration"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            Text(String(localized: "profile_data_integration_hint"))
                .font(AppTheme.Typography.caption1Dynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .opacity(showsScreenTimeToggle ? 1 : 0) // メッセージは保持しつつスクリーンタイム非表示時は目立たせない

            CardView(cornerRadius: 28) {
                VStack(spacing: 0) {
                    if showsScreenTimeToggle {
                        dataToggleRow(
                            title: String(localized: "profile_toggle_screen_time"),
                            isOn: Binding(
                                get: { appState.sensorAccess.screenTimeEnabled },
                                set: { _ in }
                            ),
                            onEnable: { Task { await requestScreenTimeAndUpdateToggle() } },
                            onDisable: { appState.setScreenTimeEnabled(false) }
                        )
                        divider
                    }
                    dataToggleRow(
                        title: String(localized: "profile_toggle_sleep"),
                        isOn: Binding(
                            get: { appState.sensorAccess.sleepEnabled },
                            set: { _ in }
                        ),
                        onEnable: { Task { await requestSleepOnly() } },
                        onDisable: { appState.setSleepEnabled(false) }
                    )
                    divider
                    dataToggleRow(
                        title: String(localized: "profile_toggle_steps"),
                        isOn: Binding(
                            get: { appState.sensorAccess.stepsEnabled },
                            set: { _ in }
                        ),
                        onEnable: { Task { await requestStepsOnly() } },
                        onDisable: { appState.setStepsEnabled(false) }
                    )
                    // v3.1: Movement トグルは一時非表示（sedentaryMinutes が UI に反映されていないため）
                    // 将来的に座りすぎ警告機能で使用する可能性があるため、コードは残す
                    // divider
                    // dataToggleRow(
                    //     title: String(localized: "profile_toggle_movement"),
                    //     isOn: Binding(
                    //         get: { appState.sensorAccess.motionEnabled },
                    //         set: { _ in }
                    //     ),
                    //     onEnable: { Task { await requestMotionAndUpdateToggle() } },
                    //     onDisable: { appState.setMotionEnabled(false) }
                    // )
                }
            }
        }
    }
    
    private func dataToggleRow(title: String, isOn: Binding<Bool>, onEnable: @escaping () -> Void, onDisable: @escaping () -> Void) -> some View {
        Toggle(title, isOn: Binding(
            get: { isOn.wrappedValue },
            set: { newValue in
                // OFFにする場合は即座に反映
                if !newValue {
                    onDisable()
                    return
                }
                // ONにする場合は、許可リクエストの結果を待ってから反映
                if newValue && !isOn.wrappedValue {
                    onEnable()
                }
            }
        ))
        .tint(AppTheme.Colors.accent)
        .padding(.vertical, 14)
        .padding(.horizontal, 2)
    }

    private func row(label: String, value: String, showsChevron: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Spacer()
            HStack(spacing: 6) {
                Text(value)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .opacity(0.6)
                }
            }
        }
        .padding(.vertical, 14)
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.Colors.borderLight.opacity(0.6))
            .frame(height: 1)
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(AppTheme.Colors.buttonUnselected)
            .clipShape(Capsule())
    }

    private func pill(_ text: String, isSelected: Bool) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.secondaryLabel)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(isSelected ? AppTheme.Colors.buttonSelected : Color.clear)
            .clipShape(Capsule())
    }

    private func toggleRow(_ title: String, isOn: Binding<Bool>) -> some View {
        Toggle(title, isOn: isOn)
            .tint(AppTheme.Colors.accent)
            // v3-ui.md / profile.html の行間に合わせて余白を付与
            .padding(.vertical, 14)
            .padding(.horizontal, 2)
    }

    private var accountManagementSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_account_management"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(spacing: 0) {
                    Button {
                        appState.signOutPreservingSensorAccess()
                    } label: {
                        HStack {
                            Text(String(localized: "common_sign_out"))
                                .foregroundStyle(.red)
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    }
                    .buttonStyle(.plain)

                    divider

                    Button {
                        isShowingDeleteAlert = true
                    } label: {
                        HStack {
                            Text(String(localized: "settings_delete_account"))
                                .foregroundStyle(.red)
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        deleteAccountError = nil
        defer { isDeletingAccount = false }

        guard case .signedIn(let credentials) = appState.authStatus else {
            await MainActor.run {
                deleteAccountError = NSError(domain: "AccountDeletionError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
            }
            return
        }

        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/account"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        try? await NetworkSessionManager.shared.setAuthHeaders(for: &request)

        do {
            let (_, response) = try await NetworkSessionManager.shared.session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "AccountDeletionError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }
            if httpResponse.statusCode == 204 {
                await SubscriptionManager.shared.handleLogout()
                await MainActor.run { appState.signOutAndWipe() }
            } else {
                throw NSError(domain: "AccountDeletionError", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Server error: \(httpResponse.statusCode)"])
            }
        } catch {
            await MainActor.run { deleteAccountError = error }
        }
    }
    
    // v3: SleepとStepsを完全に独立
    private func requestSleepOnly() async {
        // ★ 既にauthorizedの場合はトグルをONにするだけ
        if HealthKitManager.shared.isSleepAuthorized() {
            await MainActor.run { appState.setSleepEnabled(true) }
            await MetricsUploader.shared.runUploadIfDue(force: true)
            return
        }
        let granted = await HealthKitManager.shared.requestSleepAuthorization()
        await MainActor.run {
            if granted {
                appState.setSleepEnabled(true)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    private func requestStepsOnly() async {
        // ★ 既にauthorizedの場合はトグルをONにするだけ
        if HealthKitManager.shared.isStepsAuthorized() {
            await MainActor.run { appState.setStepsEnabled(true) }
            await MetricsUploader.shared.runUploadIfDue(force: true)
            return
        }
        let granted = await HealthKitManager.shared.requestStepsAuthorization()
        await MainActor.run {
            if granted {
                appState.setStepsEnabled(true)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    /// ScreenTime許可をリクエストし、結果に応じてトグルを更新する
    private func requestScreenTimeAndUpdateToggle() async {
        let granted = await ScreenTimeManager.shared.requestAuthorization()
        await MainActor.run {
            if granted {
                appState.setScreenTimeEnabled(true)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    /// Motion許可をリクエストし、結果に応じてトグルを更新する
    private func requestMotionAndUpdateToggle() async {
        let granted = await MotionManager.shared.requestAuthorization()
        await MainActor.run {
            if granted {
                appState.setMotionEnabled(true)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    @ViewBuilder
    private var subscriptionSheetContent: some View {
        if appState.subscriptionInfo.plan == .free {
            PaywallContainerView(
                forcePresent: true,
                onDismissRequested: { showingManageSubscription = false }
            )
            .task { await SubscriptionManager.shared.refreshOfferings() }
        } else {
            RevenueCatUI.CustomerCenterView()
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

/// v0.3: pill 風のチップ群 - バックエンドと連携
private struct ProfileFlowChips: View {
    let options: [String]
    @Binding var selected: Set<String>
    var labelProvider: ((String) -> String)? = nil

    var body: some View {
        // Figma準拠: 水平方向にflexWrap、均等spacing 8px（行間: 8px）
        // minimum: 70で4個/行を許容しつつ、fixedSizeで幅をテキストに合わせる
        FlowLayout(spacing: 8) {
            ForEach(options, id: \.self) { item in
                let isOn = selected.contains(item)
                Button {
                    if isOn { selected.remove(item) } else { selected.insert(item) }
                } label: {
                    Text(labelProvider?(item) ?? item)
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        // Figma: selected=#222222(黒)/text=#E1E1E1, unselected=#FDFCFC/border
                        .background(isOn ? Color(hex: "#222222") : Color(hex: "#FDFCFC"))
                        .foregroundStyle(isOn ? Color(hex: "#E1E1E1") : AppTheme.Colors.label)
                        .overlay(
                            !isOn
                                ? RoundedRectangle(cornerRadius: 999, style: .continuous)
                                    .stroke(Color(red: 200/255, green: 198/255, blue: 191/255, opacity: 0.2), lineWidth: 1)
                                : nil
                        )
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}




