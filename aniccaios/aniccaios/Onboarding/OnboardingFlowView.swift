import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome

    var body: some View {
        ZStack {
            AppBackground()
            Group {
                switch step {
                case .welcome:
                    WelcomeStepView(next: advance)
                case .ideals:
                    IdealsStepView(next: advance)
                case .struggles:
                    StrugglesStepView(next: advance)
                case .value:
                    ValueStepView(next: advance)
                case .microphone:
                    MicrophonePermissionStepView(next: advance)
                case .notifications:
                    NotificationPermissionStepView(next: advance)
                case .account:
                    AuthenticationStepView(next: advance)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            // v3: オンボーディング未完了は常に保存ステップから開始（AppState側で未完了時は.welcomeへ強制）
            step = appState.onboardingStep
            // Prefetch Paywall offering for faster display
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            step = .ideals
        case .ideals:
            step = .struggles
        case .struggles:
            step = .value
        case .value:
            step = .account
        case .account:
            step = .microphone
        case .microphone:
            step = .notifications
        case .notifications:
            // v3: Notifications まででオンボーディング終了。Habit/All set/Paywallは出さない。
            appState.markOnboardingComplete()
            return
        }
        appState.setOnboardingStep(step)
    }
}
