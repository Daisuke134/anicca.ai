import SwiftUI
import RevenueCat
import RevenueCatUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome
    @State private var showPaywall = false

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
        .fullScreenCover(isPresented: $showPaywall) {
            paywallContent(displayCloseButton: false)
                .interactiveDismissDisabled(true)
                .onPurchaseCompleted { customerInfo in
                    AnalyticsManager.shared.track(.onboardingPaywallPurchased)
                    handlePaywallSuccess()
                }
                .onRestoreCompleted { customerInfo in
                    if customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true {
                        handlePaywallSuccess()
                    }
                    // entitlement 未付与なら Paywall 維持
                }
                .onAppear {
                    AnalyticsManager.shared.track(.onboardingPaywallViewed)
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
            completeOnboarding()
            return
        }
        appState.setOnboardingStep(step)
    }

    private func completeOnboarding() {
        AnalyticsManager.shared.track(.onboardingCompleted)

        // 既存Proユーザー（再インストール等）→ Paywall スキップ
        #if DEBUG
        // DEBUG: 常にPaywallを表示して確認可能にする
        #else
        if appState.subscriptionInfo.isEntitled {
            appState.markOnboardingComplete()
            return
        }
        #endif

        // 未課金 → Paywall を表示（markOnboardingComplete() は呼ばない）
        showPaywall = true
    }

    private func handlePaywallSuccess() {
        showPaywall = false
        appState.markOnboardingComplete()
    }

    @ViewBuilder
    private func paywallContent(displayCloseButton: Bool) -> some View {
        if let offering = appState.cachedOffering {
            PaywallView(offering: offering, displayCloseButton: displayCloseButton)
                .applyDebugIntroEligibility()
        } else {
            PaywallView(displayCloseButton: displayCloseButton)
                .applyDebugIntroEligibility()
        }
    }
}
