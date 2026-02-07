import SwiftUI
import RevenueCat
import RevenueCatUI
import UserNotifications
import StoreKit

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome
    @State private var showPaywall = false
    @State private var didPurchaseOnPaywall = false

    var body: some View {
        ZStack {
            AppBackground()
            Group {
                switch step {
                case .welcome:
                    WelcomeStepView(next: advance)
                case .struggles:
                    StrugglesStepView(next: advance)
                case .liveDemo:
                    DemoNudgeStepView(next: advance)
                case .notifications:
                    NotificationPermissionStepView(next: advance)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            step = appState.onboardingStep

            if step == .notifications {
                Task {
                    let settings = await UNUserNotificationCenter.current().notificationSettings()
                    if settings.authorizationStatus != .notDetermined {
                        await MainActor.run {
                            completeOnboarding()
                        }
                        return
                    }
                }
            }

            if step == .welcome {
                AnalyticsManager.shared.track(.onboardingStarted)
            }

            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        }
        .fullScreenCover(isPresented: $showPaywall, onDismiss: {
            if !didPurchaseOnPaywall {
                handlePaywallDismissedAsFree()
            }
        }) {
            ZStack(alignment: .topTrailing) {
                paywallContent(displayCloseButton: false)
                    .interactiveDismissDisabled(true)
                    .onPurchaseCompleted { customerInfo in
                        AnalyticsManager.shared.track(.onboardingPaywallPurchased)
                        handlePaywallSuccess(customerInfo: customerInfo)
                    }
                    .onRestoreCompleted { customerInfo in
                        if customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true {
                            handlePaywallSuccess(customerInfo: customerInfo)
                        }
                    }
                    .onAppear {
                        AnalyticsManager.shared.track(.onboardingPaywallViewed)
                    }

                Button { showPaywall = false } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.gray, Color(.systemGray5))
                }
                .padding(.top, 16)
                .padding(.trailing, 16)
                .accessibilityIdentifier("paywall-close-button")
            }
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            AnalyticsManager.shared.track(.onboardingWelcomeCompleted)
            step = .struggles
        case .struggles:
            AnalyticsManager.shared.track(.onboardingStrugglesCompleted)
            step = .liveDemo
        case .liveDemo:
            AnalyticsManager.shared.track(.onboardingLiveDemoCompleted)
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
        if appState.subscriptionInfo.isEntitled {
            completeOnboardingForExistingPro()
            return
        }

        // 未課金 → Paywall を表示
        showPaywall = true
    }

    private func completeOnboardingForExistingPro() {
        Task {
            await ProblemNotificationScheduler.shared
                .scheduleNotifications(for: appState.userProfile.struggles)
            appState.markOnboardingComplete()
        }
    }

    private func handlePaywallSuccess(customerInfo: CustomerInfo) {
        didPurchaseOnPaywall = true
        showPaywall = false
        Task {
            appState.updateSubscriptionInfo(from: customerInfo)
            await ProblemNotificationScheduler.shared
                .scheduleNotifications(for: appState.userProfile.struggles)
            appState.markOnboardingComplete()
            requestReviewIfNeeded()
        }
    }

    private func handlePaywallDismissedAsFree() {
        guard !didPurchaseOnPaywall else { return }

        AnalyticsManager.shared.track(.onboardingPaywallDismissedFree)

        let problems = appState.userProfile.struggles.compactMap { ProblemType(rawValue: $0) }
        FreePlanService.shared.scheduleFreePlanNudges(problems: problems)

        appState.markOnboardingComplete()
        requestReviewIfNeeded()
    }

    private func requestReviewIfNeeded() {
        guard !appState.hasRequestedReview else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            }
        }
        appState.markReviewRequested()
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
