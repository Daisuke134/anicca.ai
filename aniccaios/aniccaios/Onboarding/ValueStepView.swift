import SwiftUI

struct ValueStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_value_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            ScrollView {
                VStack(spacing: 16) {
                    valueCard(
                        leading: "😔💬",
                        titleKey: "onboarding_value_card1_title",
                        bodyKey: "onboarding_value_card1_body"
                    )
                    valueCard(
                        leading: "⏰📱",
                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
                        bodyKey: "onboarding_value_card2_body"
                    )
                    valueCard(
                        leading: "📅➡️",
                        titleKey: nil, // v3-ui.md にタイトルが無い（推測禁止）
                        bodyKey: "onboarding_value_card3_body"
                    )
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }

            Spacer()

            PrimaryButton(
                title: String(localized: "common_continue"),
                style: .primary
            ) {
                next()
            }
            .padding(.horizontal, 16)
            .padding(.bottom)
        }
        .background(AppBackground())
    }

    @ViewBuilder
    private func valueCard(
        leading: String,
        titleKey: String?,
        bodyKey: String
    ) -> some View {
        CardView {
            HStack(alignment: .top, spacing: 12) {
                Text(leading)
                    .font(.title2)
                VStack(alignment: .leading, spacing: 6) {
                    if let titleKey {
                        Text(String(localized: titleKey))
                            .font(.headline)
                            .foregroundStyle(AppTheme.Colors.label)
                    }
                    Text(String(localized: bodyKey))
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

