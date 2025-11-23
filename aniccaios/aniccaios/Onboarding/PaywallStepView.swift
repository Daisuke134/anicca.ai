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
            // 1. まず手元の情報で即座に判定（待ち時間ゼロ）
            checkEntitlement()
            
            // 2. 裏で最新情報を取得し、変更があれば自動的にViewが更新される（AppState経由）
            Task {
                await SubscriptionManager.shared.syncNow()
                // 完了後にもう一度チェック（念のため）
                checkEntitlement()
            }
        }
    }
    
    private func checkEntitlement() {
        if appState.subscriptionInfo.isEntitled && !hasCompletedPurchase {
            hasCompletedPurchase = true
            appState.markOnboardingComplete()
            next()
        }
    }
}


