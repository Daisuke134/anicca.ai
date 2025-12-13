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
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            step = .habitSetup
            // プロフィール完了時にオファリングをプリフェッチ（Paywall表示の準備）
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        case .habitSetup:
            // フォローアップを削除
            appState.clearHabitFollowUps()
            
            // オンボーディングではPaywallを表示せず、直接完了画面へ
            // （無料ユーザーへのPaywallは利用量超過時やセッション後に自然に誘導）
            step = .completion
            appState.setOnboardingStep(step)
            return
        case .habitWakeLocation:
            step = .habitSleepLocation
        case .habitSleepLocation:
            step = .habitTrainingFocus
        case .habitTrainingFocus:
            step = .paywall
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
