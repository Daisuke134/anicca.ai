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
            // プロフィール完了時にオファリングをプリフェッチ（Paywall表示の準備）
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        case .habitSetup:
            // フォローアップがあれば続行、無ければ課金状態で分岐
            if let nextFollowUp = appState.consumeNextHabitFollowUp() {
                step = nextFollowUp
            } else {
                // 購入状態を再確認してから分岐（待機せずに遷移）
                Task {
                    await SubscriptionManager.shared.syncNow()
                }
                
                // 現在サブスクライブしているユーザー（isEntitled == true）は完了画面へ、それ以外はPaywallへ
                // 待機せずに即座に遷移する
                step = appState.subscriptionInfo.isEntitled ? .completion : .paywall
                appState.setOnboardingStep(step)
                return
            }
        case .habitWakeLocation, .habitSleepLocation, .habitTrainingFocus:
            // 追加フォローアップが無ければ課金状態で分岐
            if let nextFollowUp = appState.consumeNextHabitFollowUp() {
                step = nextFollowUp
            } else {
                // 現在サブスクライブしているユーザー（isEntitled == true）は完了画面へ、それ以外はPaywallへ
                step = appState.subscriptionInfo.isEntitled ? .completion : .paywall
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
