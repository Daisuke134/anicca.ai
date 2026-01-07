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
                case .account:
                    AuthenticationStepView(next: advance)
                case .value:
                    ValueStepView(next: advance)
                case .source:
                    SourceStepView(next: advance)
                case .name:
                    ProfileInfoStepView(next: advance)
                case .gender:
                    GenderStepView(next: advance)
                case .age:
                    AgeStepView(next: advance)
                case .ideals:
                    IdealsStepView(next: advance)
                case .struggles:
                    StrugglesStepView(next: advance)
                case .habitSetup:
                    HabitSetupStepView(next: advance)
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
            
            // Mixpanel: オンボーディング開始イベント（.welcomeから開始した場合のみ）
            if step == .welcome {
                AnalyticsManager.shared.track(.onboardingStarted)
            }
            
            // Prefetch Paywall offering for faster display
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        }
    }

    private func advance() {
        // Mixpanel: 各ステップ完了時に個別イベントを送信（Funnel分析用）
        switch step {
        case .welcome:
            AnalyticsManager.shared.track(.onboardingWelcomeCompleted)
            step = .account
        case .account:
            AnalyticsManager.shared.track(.onboardingAccountCompleted)
            step = .value
        case .value:
            AnalyticsManager.shared.track(.onboardingValueCompleted)
            step = .source
        case .source:
            AnalyticsManager.shared.track(.onboardingSourceCompleted)
            step = .name
        case .name:
            AnalyticsManager.shared.track(.onboardingNameCompleted)
            step = .gender
        case .gender:
            AnalyticsManager.shared.track(.onboardingGenderCompleted)
            step = .age
        case .age:
            AnalyticsManager.shared.track(.onboardingAgeCompleted)
            step = .ideals
        case .ideals:
            AnalyticsManager.shared.track(.onboardingIdealsCompleted)
            step = .struggles
        case .struggles:
            AnalyticsManager.shared.track(.onboardingStrugglesCompleted)
            step = .habitSetup
        case .habitSetup:
            AnalyticsManager.shared.track(.onboardingHabitsetupCompleted)
            // レビュー要求は3回目のセッション完了後に移動（VoiceSessionController.stop()で実行）
            step = .notifications
        case .notifications:
            AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
            // AlarmKitは iOS 26+ のみ。非対応ならここで完了にする（通知権限と混同しない）
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                step = .alarmkit
            } else {
                completeOnboarding()
                return
            }
            #else
            completeOnboarding()
            return
            #endif
        case .alarmkit:
            AnalyticsManager.shared.track(.onboardingAlarmkitCompleted)
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
