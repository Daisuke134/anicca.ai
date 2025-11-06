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
        case .account:
            AuthenticationStepView(next: advance)
        case .habitSetup:
            HabitSetupStepView(next: advance)
        case .completion:
            CompletionStepView(next: advance)
        }
        .onAppear {
            step = appState.onboardingStep
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            step = .microphone
        case .microphone:
            step = .notifications
        case .notifications:
            step = .account
        case .account:
            step = .habitSetup
        case .habitSetup:
            step = .completion
        case .completion:
            appState.markOnboardingComplete()
            return
        }
        appState.setOnboardingStep(step)
    }
}
