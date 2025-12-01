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
    
    private var authenticatedContent: some View {
        navigationContainer {
            VStack(spacing: AppTheme.Spacing.xl) {
                Text("Anicca")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)

                if shouldShowWakeSilentNotice {
                    Text(String(localized: "session_wake_silent_notice"))
                        .multilineTextAlignment(.center)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .padding(16)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(AppTheme.Colors.adaptiveCardBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(AppTheme.Colors.border, lineWidth: 1)
                                )
                        )
                }

                Spacer(minLength: 24)

                sessionButton
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(AppTheme.Spacing.xl)
            .background(AppBackground())
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { isShowingSettings = true }) {
                        Image(systemName: "gearshape")
                    }
                }
            }
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
        return Button(config.title) {
            config.action()
        }
        .buttonStyle(BorderedProminentButtonStyle())
        .controlSize(.large)
        .disabled(config.disabled)
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
                        // 上限に達している時だけ毎回シートを表示
                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
                        isShowingLimitModal = true
                        return
                    }
                    ensureMicrophonePermissionAndStart()
                }
            )
        }
    }
    
    // Guideline 2.1対応: iPadでの即終了バグ修正のため、マイク権限をプリフライト
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
