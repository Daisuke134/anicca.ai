import SwiftUI
import Combine
import Foundation
import RevenueCatUI
import ComponentsKit
import AuthenticationServices
#if canImport(AlarmKit)
import AlarmKit
#endif

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

    // AlarmKit設定用
    @State private var isShowingAlarmKitSettingsAlert = false
    #if DEBUG
    @State private var debugAlarmTime = Date()
    #endif

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    header

                    accountCard
                    dataIntegrationSection  // v3: Plan の直下に移動
                    // Phase 3: 以下のセクションは非表示（My Pathで管理）
                    // traitsCard
                    // idealsSection
                    // strugglesSection
                    // stickyModeSection
                    nudgeStrengthSection

                    // 起床アラームセクション（cantWakeUp選択者 + iOS 26+のみ）
                    if #available(iOS 26.0, *) {
                        if appState.userProfile.problems.contains("cant_wake_up") {
                            wakeUpAlarmSection
                        }
                    }

                    // v0.5: 未サインイン時はアカウント管理セクションを非表示
                    if case .signedIn = appState.authStatus {
                        accountManagementSection
                    }

                    #if DEBUG
                    recordingSection
                    alarmTestSection
                    phase4DebugSection
                    #endif

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
                    if appState.subscriptionInfo.plan == .free {
                        SuperwallManager.shared.register(placement: SuperwallPlacement.profilePlanTap.rawValue)
                    } else {
                        showingManageSubscription = true
                    }
                } label: {
                    row(label: String(localized: "profile_row_plan"), value: planDisplayValue, showsChevron: true)
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    private var planDisplayValue: String {
        appState.subscriptionInfo.displayPlanName
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
                            get: {
                                appState.sensorAccess.sleepEnabled
                                && appState.sensorAccess.sleepAuthorized
                            },
                            set: { _ in }
                        ),
                        onEnable: { Task { await requestSleepOnly() } },
                        onDisable: { appState.setSleepEnabled(false) }
                    )
                    divider
                    dataToggleRow(
                        title: String(localized: "profile_toggle_steps"),
                        isOn: Binding(
                            get: {
                                appState.sensorAccess.stepsEnabled
                                && appState.sensorAccess.stepsAuthorized
                            },
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

    // v0.5: サインイン済みユーザー専用（呼び出し側で条件判定）
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
        let granted = await MainActor.run { HealthKitManager.shared.isSleepAuthorized() }
            ? true
            : await HealthKitManager.shared.requestSleepAuthorization()
        await MainActor.run {
            if granted {
                appState.setSleepEnabled(true)
                appState.updateSleepAuthorizationStatus(true)
            } else {
                appState.setSleepEnabled(false)
                appState.updateSleepAuthorizationStatus(false)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    private func requestStepsOnly() async {
        let granted = await MainActor.run { HealthKitManager.shared.isStepsAuthorized() }
            ? true
            : await HealthKitManager.shared.requestStepsAuthorization()
        await MainActor.run {
            if granted {
                appState.setStepsEnabled(true)
                appState.updateStepsAuthorizationStatus(true)
            } else {
                appState.setStepsEnabled(false)
                appState.updateStepsAuthorizationStatus(false)
            }
        }
        if granted {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }
    
    /// ScreenTime API removed for App Store compliance
    private func requestScreenTimeAndUpdateToggle() async {
        // ScreenTime API removed for App Store compliance
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
        // freeユーザーはSuperwallで表示するため、ここはPROユーザーのCustomerCenterのみ
        RevenueCatUI.CustomerCenterView()
            .onCustomerCenterRestoreCompleted { customerInfo in
                Task {
                    let subscription = SubscriptionInfo(info: customerInfo)
                    await MainActor.run { appState.updateSubscriptionInfo(subscription) }
                    await SubscriptionManager.shared.syncNow()
                }
            }
    }
    
    // MARK: - Recording Section (DEBUG only)
    #if DEBUG
    private var recordingSection: some View {
        VStack(spacing: 10) {
            Text("🔔 Nudge/通知テスト")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 16)
            
            CardView {
                VStack(spacing: 12) {
                    Button("🔔 Nudge通知テスト（夜更かし）") {
                        Task {
                            await ProblemNotificationScheduler.shared.testNotification(for: .stayingUpLate)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    
                    Divider()
                    
                    Button("📱 1枚画面テスト（夜更かし）") {
                        let content = NudgeContent.contentForToday(for: .stayingUpLate)
                        appState.showNudgeCard(content)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    
                    Divider()
                    
                    ForEach(ProblemType.allCases, id: \.self) { problem in
                        Button("📱 \(problem.displayName)") {
                            let content = NudgeContent.contentForToday(for: problem)
                            appState.showNudgeCard(content)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        
                        if problem != ProblemType.allCases.last {
                            Divider()
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Alarm Test Section (DEBUG only)
    private var alarmTestSection: some View {
        VStack(spacing: 10) {
            Text("⏰ アラームテスト")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 16)

            CardView {
                VStack(spacing: 12) {
                    if #available(iOS 26.0, *) {
                        DatePicker(
                            "時間を選択",
                            selection: $debugAlarmTime,
                            displayedComponents: .hourAndMinute
                        )

                        Divider()

                        Button("⏰ 選択した時間でアラーム設定") {
                            let components = Calendar.current.dateComponents([.hour, .minute], from: debugAlarmTime)
                            Task {
                                await ProblemAlarmKitScheduler.shared.scheduleTestAlarm(
                                    hour: components.hour!,
                                    minute: components.minute!
                                )
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Divider()

                        Button("⏰ 1分後にアラーム") {
                            let future = Calendar.current.date(byAdding: .minute, value: 1, to: Date())!
                            let components = Calendar.current.dateComponents([.hour, .minute], from: future)
                            Task {
                                await ProblemAlarmKitScheduler.shared.scheduleTestAlarm(
                                    hour: components.hour!,
                                    minute: components.minute!
                                )
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Text("AlarmKitはiOS 26+のみ対応")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Phase 4 Debug Section
    private var phase4DebugSection: some View {
        VStack(spacing: 10) {
            Text("🧪 Phase 4 デバッグ")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 16)

            CardView {
                VStack(spacing: 12) {
                    // 時刻指定Nudgeテスト
                    Text("時刻指定Nudgeテスト (stayingUpLate)")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        Button("21時") {
                            Task {
                                await ProblemNotificationScheduler.shared.testNotification(for: .stayingUpLate, scheduledHour: 21)
                            }
                        }
                        .buttonStyle(.bordered)

                        Button("0時") {
                            Task {
                                await ProblemNotificationScheduler.shared.testNotification(for: .stayingUpLate, scheduledHour: 0)
                            }
                        }
                        .buttonStyle(.bordered)

                        Button("1時") {
                            Task {
                                await ProblemNotificationScheduler.shared.testNotification(for: .stayingUpLate, scheduledHour: 1)
                            }
                        }
                        .buttonStyle(.bordered)
                    }

                    Divider()

                    // ignored強制記録
                    Text("ignored強制記録 (stayingUpLate, 21時)")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        Button("1回") {
                            NudgeStatsManager.shared.debugRecordIgnored(problemType: "staying_up_late", variantIndex: 0, scheduledHour: 21, count: 1)
                        }
                        .buttonStyle(.bordered)

                        Button("2回") {
                            NudgeStatsManager.shared.debugRecordIgnored(problemType: "staying_up_late", variantIndex: 0, scheduledHour: 21, count: 2)
                        }
                        .buttonStyle(.bordered)
                    }

                    Divider()

                    // NudgeCard完了回数設定
                    Text("NudgeCard完了回数: \(appState.nudgeCardCompletedCount)")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        Button("2回") { appState.debugSetNudgeCardCompletedCount(2) }
                            .buttonStyle(.bordered)
                        Button("4回") { appState.debugSetNudgeCardCompletedCount(4) }
                            .buttonStyle(.bordered)
                        Button("9回") { appState.debugSetNudgeCardCompletedCount(9) }
                            .buttonStyle(.bordered)
                        Button("0") { appState.debugSetNudgeCardCompletedCount(0) }
                            .buttonStyle(.bordered)
                    }

                    Divider()

                    // 月間カウント
                    Text("月間NudgeCard完了: \(appState.monthlyNudgeCount)")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 8) {
                        Button("9回") { appState.debugSetMonthlyNudgeCount(9) }
                            .buttonStyle(.bordered)
                        Button("月変わり") { appState.debugSimulateMonthChange() }
                            .buttonStyle(.bordered)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }
    #endif

    // MARK: - Wake-up Alarm Section (iOS 26+ only)
    @available(iOS 26.0, *)
    private var wakeUpAlarmSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "profile_section_wake_alarm"))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            CardView(cornerRadius: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    Toggle(
                        String(localized: "profile_wake_alarm_toggle"),
                        isOn: alarmKitToggleBinding
                    )
                    .tint(AppTheme.Colors.accent)

                    Text(String(localized: "profile_wake_alarm_description"))
                        .font(AppTheme.Typography.caption1Dynamic)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
        }
        .alert(String(localized: "alarmkit_permission_needed_title"), isPresented: $isShowingAlarmKitSettingsAlert) {
            Button(String(localized: "common_open_settings")) { openSystemSettings() }
            Button(String(localized: "common_cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "alarmkit_permission_needed_message"))
        }
    }

    @available(iOS 26.0, *)
    private var alarmKitToggleBinding: Binding<Bool> {
        Binding(
            get: { appState.userProfile.useAlarmKitForCantWakeUp },
            set: { newValue in
                if newValue {
                    Task { @MainActor in
                        let manager = AlarmManager.shared

                        // 拒否済みの場合は設定誘導
                        if manager.authorizationState == .denied {
                            isShowingAlarmKitSettingsAlert = true
                            return
                        }

                        // 許可リクエスト
                        let granted = await ProblemAlarmKitScheduler.shared.requestAuthorizationIfNeeded()

                        var profile = appState.userProfile
                        profile.useAlarmKitForCantWakeUp = granted
                        appState.updateUserProfile(profile, sync: true)

                        // 許可されたらアラームをスケジュール
                        if granted {
                            await ProblemAlarmKitScheduler.shared.scheduleCantWakeUp(hour: 6, minute: 0)
                        }
                    }
                } else {
                    // OFFにした場合
                    var profile = appState.userProfile
                    profile.useAlarmKitForCantWakeUp = false
                    appState.updateUserProfile(profile, sync: true)

                    Task {
                        await ProblemAlarmKitScheduler.shared.cancelCantWakeUp()
                        // 通常通知を再スケジュール
                        await ProblemNotificationScheduler.shared.scheduleNotifications(
                            for: appState.userProfile.problems
                        )
                    }
                }
            }
        )
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
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




