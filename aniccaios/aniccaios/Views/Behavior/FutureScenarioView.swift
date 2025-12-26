import SwiftUI

struct FutureScenarioView: View {
    let future: BehaviorSummary.FutureScenario
    private var isEmpty: Bool {
        future.ifContinue.isEmpty && future.ifImprove.isEmpty
    }

    var body: some View {
        if isEmpty {
            CardView {
                VStack(alignment: .leading, spacing: 12) {
                    // ★ タイトルを追加
                    Text(String(localized: "behavior_title_future"))
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Text(String(localized: "behavior_not_enough_data"))
                        .font(AppTheme.Typography.subheadlineDynamic)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .frame(maxWidth: .infinity)  // ★ TimelineViewと同じ横幅
        } else {
            CardView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(String(localized: "behavior_title_future"))
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    VStack(alignment: .leading, spacing: 8) {
                        if !future.ifContinue.isEmpty {
                            Text(future.ifContinue)
                                .font(AppTheme.Typography.subheadlineDynamic)
                                .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        }
                        if !future.ifImprove.isEmpty {
                            Text(future.ifImprove)
                                .font(AppTheme.Typography.subheadlineDynamic)
                                .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)  // ★ TimelineViewと同じ横幅
        }
    }
}

