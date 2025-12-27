import SwiftUI
import AVFoundation

/// v0.2/現行の「Talkタブ相当」画面（フェーズ5以降は TalkView に置き換え）
struct LegacyTalkRootView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject private var controller = VoiceSessionController.shared
    @State private var isShowingSettings = false
    @State private var isShowingLimitModal = false
    @State private var isShowingPaywall = false
    @State private var showMicAlert = false
    @State private var showWakeSilentTip = false

    @ViewBuilder
    var body: some View {
        if case .signedIn = appState.authStatus {
            authenticatedContent
        } else {
            AuthRequiredPlaceholderView()
        }
    }
    
    private var authenticatedContent: some View {
        NavigationStack {
            VStack(spacing: AppTheme.Spacing.xl) {
                Text("Anicca")
                    .font(AppTheme.Typography.appTitle)
                    .fontWeight(.heavy)
                    .foregroundStyle(AppTheme.Colors.label)

                Spacer(minLength: AppTheme.Spacing.xl)

                sessionButton
            }
            .padding()
            .background(AppBackground())
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        isShowingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $isShowingSettings) {
                SettingsView()
                    .environmentObject(appState)
            }
            .sheet(isPresented: $isShowingLimitModal) {
                UsageLimitModalView(
                    plan: appState.subscriptionHoldPlan ?? .free,
                    reason: appState.quotaHoldReason ?? .quotaExceeded,
                    onClose: { isShowingLimitModal = false },
                    onUpgrade: {
                        isShowingLimitModal = false
                        isShowingPaywall = true
                    },
                    onManage: {
                        isShowingLimitModal = false
                        isShowingSettings = true
                    }
                )
            }
            .sheet(isPresented: $isShowingPaywall) {
                PaywallContainerView(
                    forcePresent: true,
                    onPurchaseCompleted: {
                        isShowingPaywall = false
                    },
                    onDismissRequested: {
                        isShowingPaywall = false
                    }
                )
                .environmentObject(appState)
                .environment(\.locale, .autoupdatingCurrent)
            }
            .onChange(of: appState.pendingHabitTrigger) { newValue in
                guard newValue != nil else { return }
                maybePresentWakeSilentTip(trigger: newValue)
                ensureMicrophonePermissionAndStart(shouldResumeImmediately: appState.shouldStartSessionImmediately)
            }
            .onAppear {
                if appState.pendingHabitTrigger != nil {
                    ensureMicrophonePermissionAndStart(shouldResumeImmediately: appState.shouldStartSessionImmediately)
                }
                // 上限ホールドが既に立っていればモーダル表示
                if appState.subscriptionHold {
                    isShowingLimitModal = true
                }
            }
            .onChange(of: appState.subscriptionHold) { hold in
                if hold {
                    isShowingLimitModal = true
                } else {
                    isShowingLimitModal = false
                    isShowingPaywall = false
                }
            }
            .onChange(of: appState.subscriptionHoldPlan) { _ in
                // planが変更された時も表示
                if appState.subscriptionHold {
                    isShowingLimitModal = true
                }
            }
            .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
                Button(String(localized: "common_open_settings")) {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                Button(String(localized: "common_cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "session_mic_permission_message"))
            }
            .alert(String(localized: "wake_silent_modal_title"), isPresented: $showWakeSilentTip) {
                Button(String(localized: "wake_silent_modal_ok")) {
                    appState.markHasSeenWakeSilentTip()
                }
            } message: {
                Text(String(localized: "wake_silent_modal_message"))
            }
        }
    }
    
    private func maybePresentWakeSilentTip(trigger: PendingHabitTrigger?) {
        guard let trigger else { return }
        guard trigger.habit == .wake else { return }
        guard !appState.hasSeenWakeSilentTip else { return }

        // v3-ui: AlarmKit 非対応等「確実に鳴らす保証がない」デバイスでのみ表示
        let isEligible: Bool = {
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                // AlarmKitを使わない起床（通知/音に依存）なら説明対象
                return !appState.userProfile.useAlarmKitForWake
            }
            #endif
            return true
        }()

        guard isEligible else { return }
        showWakeSilentTip = true
    }

    private var sessionButton: some View {
        let config = buttonConfig
        let status = controller.connectionStatus
        let icon: String? = (status == .connecting) ? "hourglass" : (status == .connected ? "stop.fill" : "mic.fill")
        return PrimaryButton(
            title: config.title,
            icon: icon,
            isEnabled: !config.disabled,
            isLoading: status == .connecting,
            style: .large,
            action: config.action
        )
    }

    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
        switch controller.connectionStatus {
        case .connected:
            return (
                title: String(localized: "session_button_end"),
                disabled: false,
                action: { 
                    controller.stop()
                    // エビデンス: stop()時にはmarkQuotaHoldを呼ばない（エンドセッション押下時の誤表示を防ぐ）
                }
            )
        case .connecting:
            return (
                title: String(localized: "session_button_connecting"),
                disabled: true,
                action: {}
            )
        case .disconnected:
            return (
                title: String(localized: "session_button_talk"),
                disabled: false,
                action: {
                    let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
                    if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
                        isShowingLimitModal = true
                        return
                    }
                    appState.prepareConsultSessionPrompt()
                    ensureMicrophonePermissionAndStart()
                }
            )
        }
    }
    
    private func ensureMicrophonePermissionAndStart(shouldResumeImmediately: Bool = false) {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                controller.start(shouldResumeImmediately: shouldResumeImmediately)
            case .undetermined:
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            controller.start(shouldResumeImmediately: shouldResumeImmediately)
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                controller.start(shouldResumeImmediately: shouldResumeImmediately)
            case .undetermined:
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            controller.start(shouldResumeImmediately: shouldResumeImmediately)
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        }
    }

}
