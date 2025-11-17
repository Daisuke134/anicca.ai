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
            case .paywall:
                PaywallStepView(next: advance)
            case .completion:
                CompletionStepView(next: advance)
            }
        }
        .onAppear {
            // オンボーディング完了済みなら完了画面から開始
            if appState.isOnboardingComplete {
                step = .completion
            } else {
                // オンボーディング未完了時、paywallやcompletionが保存されていたら.welcomeにリセット
                if appState.onboardingStep == .paywall || appState.onboardingStep == .completion {
                    appState.setOnboardingStep(.welcome)
                }
                step = appState.onboardingStep
            }
            // Prefetch Paywall offering for faster display
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
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
                step = .paywall
            }
        case .habitWakeLocation, .habitSleepLocation, .habitTrainingFocus:
            // Check if there are more follow-up questions
            if let nextFollowUp = appState.consumeNextHabitFollowUp() {
                step = nextFollowUp
            } else {
                step = .paywall
            }
        case .paywall:
            // Paywallのステップを保存してから完了画面へ
            appState.setOnboardingStep(.paywall)
            step = .completion
        case .completion:
            appState.markOnboardingComplete()
            return
        }
        appState.setOnboardingStep(step)
    }
}
