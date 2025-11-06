import SwiftUI

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var controller = VoiceSessionController()
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

            Spacer(minLength: 24)

            sessionButton
        }
        .padding()
        .sheet(isPresented: $isShowingSettings) {
            SettingsView()
                .environmentObject(appState)
        }
        .onChange(of: appState.pendingHabitTrigger) { trigger in
            guard trigger != nil else { return }
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
                title: "End Session",
                disabled: false,
                action: { controller.stop() }
            )
        case .connecting:
            return (
                title: "Connecting…",
                disabled: true,
                action: {}
            )
        case .disconnected:
            return (
                title: "Talk to Anicca",
                disabled: false,
                action: { controller.start() }
            )
        }
    }
}
