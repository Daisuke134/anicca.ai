import SwiftUI
import UIKit
import Combine
import StoreKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        MyPathTabView()
            .environmentObject(appState)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                        appState.maybePresentATTPromptAfterNudge()
                    }
                )
            }
            .fullScreenCover(isPresented: $appState.isPresentingATTPrompt) {
                ATTPermissionStepView {
                    appState.isPresentingATTPrompt = false
                }
                .environmentObject(appState)
            }
            .background(AppBackground())
            .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private func handleNudgeCardCompletion(content: NudgeContent) {
        appState.incrementNudgeCardCompletedCount()
        let count = appState.nudgeCardCompletedCount
        appState.dismissNudgeCard()
        appState.maybePresentATTPromptAfterNudge()

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
