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
                case .value:
                    ValueStepView(next: advance)
                case .account:
                    AuthenticationStepView(next: advance)
                case .ideals:
                    IdealsStepView(next: advance)
                case .struggles:
                    StrugglesStepView(next: advance)
                case .notifications:
                    NotificationPermissionStepView(next: advance)
                case .alarmkit:
                    AlarmKitPermissionStepView(next: advance)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            // v3: オンボーディング未完了は常に保存ステップから開始（AppState側で未完了時は.welcomeへ強制）
            let alarmKitSupported: Bool = {
                #if canImport(AlarmKit)
                if #available(iOS 26.0, *) { return true }
                #endif
                return false
            }()
            // もし保存ステップが alarmkit でも、非対応環境では notifications に戻す
            if appState.onboardingStep == .alarmkit && !alarmKitSupported {
                step = .notifications
                appState.setOnboardingStep(.notifications)
            } else {
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
            step = .value
        case .value:
            step = .account
        case .account:
            step = .ideals
        case .ideals:
            step = .struggles
        case .struggles:
            step = .notifications
        case .notifications:
            // AlarmKitは iOS 26+ のみ。非対応ならここで完了にする（通知権限と混同しない）
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                step = .alarmkit
            } else {
                appState.markOnboardingComplete()
                return
            }
            #else
            appState.markOnboardingComplete()
            return
            #endif
        case .alarmkit:
            // 最終ステップ: オンボーディング完了
            appState.markOnboardingComplete()
            return
        }
        appState.setOnboardingStep(step)
    }
}
