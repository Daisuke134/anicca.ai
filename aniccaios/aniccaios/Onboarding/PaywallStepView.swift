import SwiftUI

struct PaywallStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var hasCompletedPurchase = false
    
    var body: some View {
        PaywallContainerView(
            onPurchaseCompleted: {
                // 購入完了時のみ実行（重複防止）
                guard !hasCompletedPurchase else { return }
                hasCompletedPurchase = true
                next()
            },
            onDismissRequested: {
                guard !hasCompletedPurchase else { return }
                // 「×」押下でも一旦 All Set を必ず挟む
                hasCompletedPurchase = true
                next()
            }
        )
        .task {
            // 遷移アニメーション完了まで待機（ヒッチ防止）
            try? await Task.sleep(nanoseconds: 500_000_000)
            Task.detached(priority: .utility) {
                await SubscriptionManager.shared.syncNow()
            }
            
            // 現在サブスクライブしているユーザー（isEntitled == true）は自動で次へ進む
            if appState.subscriptionInfo.isEntitled && !hasCompletedPurchase {
                hasCompletedPurchase = true
                next()
            }
        }
    }
}


