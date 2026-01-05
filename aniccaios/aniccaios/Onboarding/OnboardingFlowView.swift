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
        // Mixpanel: 現在のステップ完了を記録
        AnalyticsManager.shared.trackOnboardingStep(String(describing: step))
        
        switch step {
        case .welcome:
            step = .account
        case .account:
            step = .value
        case .value:
            step = .source
        case .source:
            step = .name
        case .name:
            step = .gender
        case .gender:
            step = .age
        case .age:
            step = .ideals
        case .ideals:
            step = .struggles
        case .struggles:
            step = .habitSetup
        case .habitSetup:
            // 評価リクエストを表示（システムダイアログ）
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            }
            step = .notifications
        case .notifications:
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
