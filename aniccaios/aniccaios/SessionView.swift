import SwiftUI
import AVFoundation

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject private var controller = VoiceSessionController.shared
    @State private var isShowingSettings = false
    @State private var isShowingLimitModal = false
    @State private var isShowingPaywall = false
    @State private var showMicAlert = false

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

                if shouldShowWakeSilentNotice {
                    Text(String(localized: "session_wake_silent_notice"))
                        .multilineTextAlignment(.center)
                        .font(AppTheme.Typography.subheadlineDynamic)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .padding(AppTheme.Spacing.lg)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
                                .fill(AppTheme.Colors.cardBackground)
                                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
                        )
                }

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
        }
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

    private var shouldShowWakeSilentNotice: Bool {
        appState.habitSchedules[HabitType.wake] != nil
    }
}
