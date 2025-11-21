import SwiftUI

struct PaywallStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var hasCompletedPurchase = false
    
    var body: some View {
        PaywallContainerView(
            onPurchaseCompleted: {
                hasCompletedPurchase = true
                appState.markOnboardingComplete()
                next()
            },
            onDismissRequested: {
                // 既にProユーザーの場合も次へ進む
                if appState.subscriptionInfo.isEntitled {
                    hasCompletedPurchase = true
                    appState.markOnboardingComplete()
                }
                next()
            }
        )
        .task {
            // 画面表示時に購入状態を確認
            await SubscriptionManager.shared.syncNow()
            if appState.subscriptionInfo.isEntitled && !hasCompletedPurchase {
                hasCompletedPurchase = true
                appState.markOnboardingComplete()
                next()
            }
        }
    }
}


