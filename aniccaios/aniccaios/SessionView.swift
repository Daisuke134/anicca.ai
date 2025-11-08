import SwiftUI

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @ObservedObject private var controller = VoiceSessionController.shared
    @State private var isShowingSettings = false

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
        .onChange(of: appState.pendingHabitTrigger) { _, newValue in
            guard newValue != nil else { return }
            controller.start(shouldResumeImmediately: appState.shouldStartSessionImmediately)
        }
        .onAppear {
            if appState.pendingHabitTrigger != nil {
                controller.start(shouldResumeImmediately: appState.shouldStartSessionImmediately)
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
                action: { controller.start() }
            )
        }
    }

    private var shouldShowWakeSilentNotice: Bool {
        appState.habitSchedules[.wake] != nil
    }
}
