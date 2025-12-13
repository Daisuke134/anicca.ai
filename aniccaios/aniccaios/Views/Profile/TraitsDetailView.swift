import SwiftUI

/// v0.3: Big Five 詳細（v3-ui.md / 11-traits-detail.html）
struct TraitsDetailView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                ForEach(Trait.allCases, id: \.self) { t in
                    CardView {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(t.title)
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(AppTheme.Colors.label)
                                Spacer()
                                Text("\(t.score)/100")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            }

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(AppTheme.Colors.buttonUnselected)
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(AppTheme.Colors.buttonSelected)
                                        .frame(width: geo.size.width * CGFloat(t.score) / 100.0)
                                }
                            }
                            .frame(height: 10)

                            Text(t.description)
                                .font(AppTheme.Typography.subheadlineDynamic)
                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                                .lineLimit(2)
                        }
                    }
                }
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
        }
        .navigationTitle("Big Five Traits")
        .navigationBarTitleDisplayMode(.inline)
        .background(AppBackground())
    }

    enum Trait: CaseIterable {
        case agreeableness
        case openness
        case conscientiousness
        case emotionalStability
        case extraversion

        var title: String {
            switch self {
            case .agreeableness: return "Agreeableness"
            case .openness: return "Openness"
            case .conscientiousness: return "Conscientiousness"
            case .emotionalStability: return "Emotional Stability"
            case .extraversion: return "Extraversion"
            }
        }

        // NOTE: フェーズ3で Big5Scores が AppState へ入ったら差し替える
        var score: Int { 82 }

        var description: String {
            "Highly cooperative; you value harmony and tend to be considerate of others."
        }
    }
}

