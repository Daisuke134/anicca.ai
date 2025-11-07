import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome

    var body: some View {
        Group {
            switch step {
            case .welcome:
                WelcomeStepView(next: advance)
            case .microphone:
                MicrophonePermissionStepView(next: advance)
            case .notifications:
                NotificationPermissionStepView(next: advance)
            case .account:
                AuthenticationStepView(next: advance)
            case .profile:
                ProfileInfoStepView(next: advance)
            case .habitSetup:
                HabitSetupStepView(next: advance)
            case .habitWakeLocation:
                HabitWakeLocationStepView(next: advance)
            case .habitSleepLocation:
                HabitSleepLocationStepView(next: advance)
            case .habitTrainingFocus:
                HabitTrainingFocusStepView(next: advance)
            case .completion:
                CompletionStepView(next: advance)
            }
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
            step = .profile
        case .profile:
            step = .habitSetup
        case .habitSetup:
            // Check if there are follow-up questions
            if let nextFollowUp = appState.consumeNextHabitFollowUp() {
                step = nextFollowUp
            } else {
                step = .completion
            }
        case .habitWakeLocation, .habitSleepLocation, .habitTrainingFocus:
            // Check if there are more follow-up questions
            if let nextFollowUp = appState.consumeNextHabitFollowUp() {
                step = nextFollowUp
            } else {
                step = .completion
            }
        case .completion:
            appState.markOnboardingComplete()
            return
        }
        appState.setOnboardingStep(step)
    }
}
