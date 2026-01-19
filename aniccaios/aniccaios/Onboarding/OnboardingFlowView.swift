import SwiftUI
import StoreKit

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
                case .struggles:
                    StrugglesStepView(next: advance)
                case .notifications:
                    NotificationPermissionStepView(next: advance)
                case .att:
                    ATTPermissionStepView(next: advance)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            step = appState.onboardingStep

            // Mixpanel: オンボーディング開始イベント
            if step == .welcome {
                AnalyticsManager.shared.track(.onboardingStarted)
            }

            // Prefetch Paywall offering
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            AnalyticsManager.shared.track(.onboardingWelcomeCompleted)
            step = .value
        case .value:
            AnalyticsManager.shared.track(.onboardingValueCompleted)
            step = .struggles
        case .struggles:
            AnalyticsManager.shared.track(.onboardingStrugglesCompleted)
            step = .notifications
        case .notifications:
            AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
            step = .att
        case .att:
            AnalyticsManager.shared.track(.onboardingATTCompleted)
            completeOnboarding()
            return
        }
        appState.setOnboardingStep(step)
    }

    private func completeOnboarding() {
        AnalyticsManager.shared.track(.onboardingCompleted)
        appState.markOnboardingComplete()
        SuperwallManager.shared.register(placement: SuperwallPlacement.onboardingComplete.rawValue)
    }
}
