import SwiftUI
import UIKit
import Combine

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            switch appState.selectedRootTab {
            case .myPath:
                MyPathTabView()
                    .environmentObject(appState)
            case .profile:
                ProfileView()
                    .environmentObject(appState)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Proactive Agent: NudgeCard表示
        .fullScreenCover(item: $appState.pendingNudgeCard) { content in
            NudgeCardView(
                content: content,
                onPositiveAction: {
                    appState.dismissNudgeCard()
                },
                onNegativeAction: {
                    appState.dismissNudgeCard()
                },
                onFeedback: { isPositive in
                    // TODO: フィードバックをサーバーに送信
                },
                onDismiss: {
                    appState.dismissNudgeCard()
                }
            )
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            handleAppOpenPaywall()
        }
        .safeAreaInset(edge: .bottom) {
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private func handleAppOpenPaywall() {
        guard appState.isOnboardingComplete,
              appState.subscriptionInfo.plan == .free else { return }

        let key = "lastAppLaunchPaywallDate"
        let countKey = "appLaunchPaywallCount"
        let defaults = UserDefaults.standard

        let count = defaults.integer(forKey: countKey)
        if count >= 3 { return }

        if let lastDate = defaults.object(forKey: key) as? Date,
           Calendar.current.dateComponents([.day], from: lastDate, to: Date()).day ?? 0 < 3 {
            return
        }

        defaults.set(Date(), forKey: key)
        defaults.set(count + 1, forKey: countKey)
        SuperwallManager.shared.register(placement: SuperwallPlacement.campaignAppLaunch.rawValue)
    }
}
