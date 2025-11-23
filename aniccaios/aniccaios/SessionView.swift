import SwiftUI

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject private var controller = VoiceSessionController.shared
    @State private var isShowingSettings = false
    @State private var isShowingLimitModal = false
    @State private var isShowingPaywall = false

    @ViewBuilder
    var body: some View {
        if case .signedIn = appState.authStatus {
            authenticatedContent
        } else {
            AuthRequiredPlaceholderView()
        }
    }
    
    private var authenticatedContent: some View {
        VStack(spacing: 24) {
            HStack {
                Spacer()
                Button(action: {
                    isShowingSettings = true
                }) {
                    Image(systemName: "gearshape")
                        .font(.title3)
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.top)

            Text("Anicca")
                .font(.system(size: 32, weight: .bold))

            if shouldShowWakeSilentNotice {
                Text(String(localized: "session_wake_silent_notice"))
                    .multilineTextAlignment(.center)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(.thinMaterial)
                    )
            }

            Spacer(minLength: 24)

            sessionButton
        }
        .padding()
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
        }
        .onChange(of: appState.pendingHabitTrigger) { _, newValue in
            guard newValue != nil else { return }
            controller.start(shouldResumeImmediately: appState.shouldStartSessionImmediately)
        }
        .onAppear {
            if appState.pendingHabitTrigger != nil {
                controller.start(shouldResumeImmediately: appState.shouldStartSessionImmediately)
            }
            // 上限ホールドが既に立っていればモーダル表示
            if appState.subscriptionHold {
                isShowingLimitModal = true
            }
        }
        .onChange(of: appState.subscriptionHold) { _, hold in
            if hold {
                isShowingLimitModal = true
            } else {
                isShowingLimitModal = false
                isShowingPaywall = false
            }
        }
        .onChange(of: appState.subscriptionHoldPlan) { _, _ in
            // planが変更された時も表示
            if appState.subscriptionHold {
                isShowingLimitModal = true
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
                action: { controller.stop() }
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
                    controller.start()
                }
            )
        }
    }

    private var shouldShowWakeSilentNotice: Bool {
        appState.habitSchedules[HabitType.wake] != nil
    }
}
