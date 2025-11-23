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
                appState.markOnboardingComplete()
                next()
            },
            onDismissRequested: {
                // 閉じるボタンが押された場合（既にProユーザーの場合も含む）
                guard !hasCompletedPurchase else { return }
                if appState.subscriptionInfo.isEntitled {
                    hasCompletedPurchase = true
                    appState.markOnboardingComplete()
                    next()
                } else {
                    // 未購入で閉じた場合は何もしない（オンボーディングを続行しない）
                    // 必要に応じてここで処理を追加
                }
            }
        )
        .task {
            // 画面表示時に購入状態を確認（UIブロック回避のためデタッチ）
            Task.detached(priority: .background) {
                await SubscriptionManager.shared.syncNow()
            }
            
            // 現在サブスクライブしているユーザー（isEntitled == true）は自動で次へ進む
            if appState.subscriptionInfo.isEntitled && !hasCompletedPurchase {
                hasCompletedPurchase = true
                appState.markOnboardingComplete()
                next()
            }
        }
    }
}


