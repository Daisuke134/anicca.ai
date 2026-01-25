import SwiftUI
import UIKit
import Combine
import StoreKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            // Hard Paywall: 購読なし + オンボーディング完了 → BlockedView
            if appState.subscriptionInfo.isSubscriptionExpiredOrCanceled && appState.isOnboardingComplete {
                BlockedView()
            } else {
                // 通常のタブ表示
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
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Proactive Agent: NudgeCard表示
        .fullScreenCover(item: $appState.pendingNudgeCard) { content in
            NudgeCardView(
                content: content,
                onPositiveAction: {
                    handleNudgeCardCompletion(content: content)
                },
                onNegativeAction: {
                    handleNudgeCardCompletion(content: content)
                },
                onFeedback: { isPositive in
                    if isPositive {
                        NudgeStatsManager.shared.recordThumbsUp(
                            problemType: content.problemType.rawValue,
                            variantIndex: content.variantIndex
                        )
                    } else {
                        NudgeStatsManager.shared.recordThumbsDown(
                            problemType: content.problemType.rawValue,
                            variantIndex: content.variantIndex
                        )
                    }
                },
                onDismiss: {
                    appState.dismissNudgeCard()
                }
            )
        }
        .safeAreaInset(edge: .bottom) {
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    // MARK: - NudgeCard Completion Handler

    private func handleNudgeCardCompletion(content: NudgeContent) {
        // カウンターをインクリメント
        appState.incrementNudgeCardCompletedCount()

        let count = appState.nudgeCardCompletedCount

        // NudgeCardを閉じる
        appState.dismissNudgeCard()

        // 3回目: レビューリクエスト
        if count == 3 && !appState.hasRequestedReview {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if let scene = UIApplication.shared.connectedScenes
                    .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            appState.markReviewRequested()
            return
        }
        // Hard Paywall: 5回目/10回目のPaywall表示は削除（全員Subscriber前提）
    }
}
