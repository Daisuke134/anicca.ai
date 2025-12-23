import SwiftUI
import Combine

struct HighlightsCard: View {
    let highlights: BehaviorSummary.Highlights
    let streaks: BehaviorSummary.Streaks

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "behavior_title_today_highlights"))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 2)

            LazyVGrid(columns: columns, spacing: 12) {
                highlightMiniCard(title: String(localized: "behavior_highlight_wake"), apiStatus: highlights.wake.status, valueLabel: highlights.wake.label, streak: streaks.wake)
                highlightMiniCard(title: String(localized: "behavior_highlight_screen"), apiStatus: highlights.screen.status, valueLabel: highlights.screen.label, streak: streaks.screen)
                highlightMiniCard(title: String(localized: "behavior_highlight_workout"), apiStatus: highlights.workout.status, valueLabel: highlights.workout.label, streak: streaks.workout)
                highlightMiniCard(title: String(localized: "behavior_highlight_rumination"), apiStatus: highlights.rumination.status, valueLabel: highlights.rumination.label, streak: streaks.rumination)
            }
        }
    }

    private func highlightMiniCard(title: String, apiStatus: String, valueLabel: String, streak: Int) -> some View {
        let ui = mapToUI(apiStatus)

        return ZStack(alignment: .topTrailing) {
            CardView(cornerRadius: 24) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text(ui.icon)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(ui.iconColor)
                        Text(title)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.label)
                        Spacer()
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(ui.label)
                            .font(.system(size: 12))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        
                        // v3.1: バックエンドから返される具体的な数値（例: "Wake 6:30", "Steps 8524"）を表示
                        if !valueLabel.isEmpty {
                            Text(valueLabel)
                                .font(.system(size: 11))
                                .foregroundStyle(AppTheme.Colors.tertiaryLabel)
                        }
                    }
                }
            }

            HStack(spacing: 6) {
                Text("🌱").font(.system(size: 12))
                Text("\(streak)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color(red: 0.42, green: 0.56, blue: 0.44)) // #6B8E6F
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(AppTheme.Colors.buttonUnselected.opacity(0.6))
            .clipShape(Capsule())
            .padding(10)
        }
    }

    private func mapToUI(_ apiStatus: String) -> (icon: String, iconColor: Color, label: String) {
        // v3-ui.md: ✓ / → / ⚠︎ と "Moving Forward / Stable / Needs Attention"
        switch apiStatus {
        case "on_track":
            return ("✓", Color(red: 0.18, green: 0.80, blue: 0.44), String(localized: "behavior_status_moving_forward"))
        case "warning", "missed":
            return ("⚠︎", Color(red: 0.96, green: 0.65, blue: 0.14), String(localized: "behavior_status_needs_attention"))
        case "ok":
            return ("→", AppTheme.Colors.secondaryLabel, String(localized: "behavior_status_stable"))
        default:
            return ("→", AppTheme.Colors.secondaryLabel, String(localized: "behavior_status_stable"))
        }
    }
}

