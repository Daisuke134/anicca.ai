import SwiftUI
import UIKit
import Combine
import StoreKit
import RevenueCat
import RevenueCatUI

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showUpgradePaywall = false

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
                    }
                )
            }
            .fullScreenCover(isPresented: $showUpgradePaywall, onDismiss: {
                // Upgrade Paywall の X閉じ — Free のまま、特別な処理不要
            }) {
                ZStack(alignment: .topTrailing) {
                    upgradePaywallView()

                    Button { showUpgradePaywall = false } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.gray, Color(.systemGray5))
                    }
                    .padding(.top, 16)
                    .padding(.trailing, 16)
                    .accessibilityIdentifier("paywall-close-button")
                }
            }
            .task {
                // Free ユーザーの日替わりローテーション再スケジュール
                if !appState.subscriptionInfo.isEntitled {
                    let problems = appState.userProfile.struggles.compactMap { ProblemType(rawValue: $0) }
                    FreePlanService.shared.rescheduleIfNeeded(problems: problems)
                }
            }
            .background(AppBackground())
            .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private func handleNudgeCardCompletion(content: NudgeContent) {
        appState.incrementNudgeCardCompletedCount()
        let count = appState.nudgeCardCompletedCount
        appState.dismissNudgeCard()

        // Free ユーザーのみ: 3回目 or 7回目に Paywall 表示
        if (count == 3 || count == 7) && !appState.subscriptionInfo.isEntitled {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showUpgradePaywall = true
            }
            return
        }
    }

    @ViewBuilder
    private func upgradePaywallView() -> some View {
        if let offering = appState.cachedOffering {
            PaywallView(offering: offering, displayCloseButton: false)
                .applyDebugIntroEligibility()
                .onPurchaseCompleted { customerInfo in
                    handleUpgradePurchase(customerInfo: customerInfo)
                }
                .onRestoreCompleted { customerInfo in
                    if customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true {
                        handleUpgradePurchase(customerInfo: customerInfo)
                    }
                }
        } else {
            PaywallView(displayCloseButton: false)
                .applyDebugIntroEligibility()
                .onPurchaseCompleted { customerInfo in
                    handleUpgradePurchase(customerInfo: customerInfo)
                }
                .onRestoreCompleted { customerInfo in
                    if customerInfo.entitlements[AppConfig.revenueCatEntitlementId]?.isActive == true {
                        handleUpgradePurchase(customerInfo: customerInfo)
                    }
                }
        }
    }

    private func handleUpgradePurchase(customerInfo: CustomerInfo) {
        AnalyticsManager.shared.track(.upgradePaywallPurchased)
        Task {
            appState.updateSubscriptionInfo(from: customerInfo)
            await ProblemNotificationScheduler.shared
                .scheduleNotifications(for: appState.userProfile.struggles)
            showUpgradePaywall = false
        }
    }
}
