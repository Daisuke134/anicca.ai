import SwiftUI

struct FutureScenarioView: View {
    let future: BehaviorSummary.FutureScenario

    var body: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "behavior_title_future"))
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.label)

                VStack(alignment: .leading, spacing: 8) {
                    // migration-patch-v3.md 6.1 の JSON 順（ifContinue → ifImprove）に合わせて表示順を固定
                    Text(future.ifContinue)
                        .font(AppTheme.Typography.subheadlineDynamic)
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                    Text(future.ifImprove)
                        .font(AppTheme.Typography.subheadlineDynamic)
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                }
            }
        }
    }
}

