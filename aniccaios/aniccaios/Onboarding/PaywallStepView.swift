import SwiftUI

struct PaywallStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var hasCompletedPurchase = false
    @State private var purchaseFailed = false // 追加: 購入失敗フラグ
    
    var body: some View {
        PaywallContainerView(
            forcePresent: true,
            onPurchaseCompleted: {
                // 購入完了時のみ実行（重複防止）
                guard !hasCompletedPurchase else { return }
                hasCompletedPurchase = true
                purchaseFailed = false // 購入成功時は失敗フラグをクリア
                next()
            },
            onDismissRequested: {
                guard !hasCompletedPurchase else { return }
                // 購入失敗時は完了画面に遷移しない
                guard !purchaseFailed else {
                    print("[PaywallStepView] Purchase failed, not proceeding to completion")
                    return
                }
                // 「×」押下でも一旦 All Set を必ず挟む（購入失敗時を除く）
                hasCompletedPurchase = true
                next()
            },
            onPurchaseFailed: { error in
                // 追加: 購入失敗時の処理
                print("[PaywallStepView] Purchase failed: \(error.localizedDescription)")
                purchaseFailed = true
            }
        )
        .environment(\.locale, Locale(identifier: appState.userProfile.preferredLanguage.rawValue))
        .task {
            // 遷移アニメーション完了まで待機（ヒッチ防止）
            try? await Task.sleep(nanoseconds: 500_000_000)
            Task.detached(priority: .utility) {
                await SubscriptionManager.shared.syncNow()
            }
            
            // 購入失敗時は自動遷移しない
            guard !purchaseFailed else {
                print("[PaywallStepView] Purchase failed, skipping auto-advance")
                return
            }
            
            // 現在サブスクライブしているユーザー（isEntitled == true）は自動で次へ進む
            if appState.subscriptionInfo.isEntitled && !hasCompletedPurchase {
                hasCompletedPurchase = true
                next()
            }
        }
    }
}


