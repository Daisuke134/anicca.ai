import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome

    var body: some View {
        switch step {
        case .welcome:
            WelcomeStepView(next: advance)
        case .microphone:
            MicrophonePermissionStepView(next: advance)
        case .notifications:
            NotificationPermissionStepView(next: advance)
        case .habitSetup:
            HabitSetupStepView(next: advance)
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            step = .microphone
        case .microphone:
            step = .notifications
        case .notifications:
            step = .habitSetup
        case .habitSetup:
            appState.markOnboardingComplete()
        }
    }
}
