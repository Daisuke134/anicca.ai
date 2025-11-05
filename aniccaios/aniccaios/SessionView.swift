import SwiftUI

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var controller = VoiceSessionController()
    @State private var isShowingSettings = false

    var body: some View {
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
            .padding(.top)

            Text("Anicca Voice")
                .font(.system(size: 32, weight: .bold))

            Text(controller.connectionStatus.label)
                .font(.headline)

            Text(controller.connectionStatus.subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

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
                title: "Start Voice Session",
                disabled: false,
                action: { controller.start() }
            )
        }
    }
}
