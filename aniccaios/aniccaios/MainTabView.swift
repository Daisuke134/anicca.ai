import SwiftUI
import UIKit
import Combine
import StoreKit

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

        // Freeプランの場合、月間カウントもインクリメント
        if appState.subscriptionInfo.plan != .pro {
            appState.incrementMonthlyNudgeCount()
        }

        let count = appState.nudgeCardCompletedCount
        let monthlyCount = appState.monthlyNudgeCount
        let plan = appState.subscriptionInfo.plan

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

        // 5回目: Paywall
        if count == 5 && plan != .pro {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                SuperwallManager.shared.register(placement: SuperwallPlacement.nudgeCardComplete5.rawValue)
            }
            return
        }

        // 10回目（月間）: Paywall + 通知キャンセル
        if monthlyCount >= 10 && plan != .pro {
            // 全通知をキャンセル
            Task {
                await ProblemNotificationScheduler.shared.cancelAllNotifications()
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                SuperwallManager.shared.register(placement: SuperwallPlacement.nudgeCardComplete10.rawValue)
            }
            return
        }
    }
}
