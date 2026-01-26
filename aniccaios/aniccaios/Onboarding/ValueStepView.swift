import SwiftUI

struct ValueStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text(String(localized: "onboarding_value_title"))
                .font(.system(size: 36, weight: .bold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 32)
                .padding(.bottom, 48)

            ScrollView {
                VStack(spacing: 16) {
                    valueCard(
                        emoji: "🤝",
                        titleKey: "onboarding_value_card1_title",
                        bodyKey: "onboarding_value_card1_body"
                    )
                    valueCard(
                        emoji: "🎯",
                        titleKey: "onboarding_value_card2_title",
                        bodyKey: "onboarding_value_card2_body"
                    )
                    valueCard(
                        emoji: "💭",
                        titleKey: "onboarding_value_card3_title",
                        bodyKey: "onboarding_value_card3_body"
                    )
                }
                .padding(.horizontal, 24)
            }

            Spacer()

            Button {
                next()
            } label: {
                Text(String(localized: "common_next"))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(AppTheme.Colors.label)
                    .clipShape(RoundedRectangle(cornerRadius: 28))
            }
            .accessibilityIdentifier("onboarding-value-next")
            .padding(.horizontal, 16)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
    }

    @ViewBuilder
    private func valueCard(
        emoji: String,
        titleKey: String,
        bodyKey: String
    ) -> some View {
        CardView(cornerRadius: 37) {
            HStack(alignment: .top, spacing: 16) {
                Text(emoji)
                    .font(.system(size: 36))
                    .padding(.top, 4)
                VStack(alignment: .leading, spacing: 8) {
                    Text(NSLocalizedString(titleKey, comment: ""))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(AppTheme.Colors.label)
                    Text(NSLocalizedString(bodyKey, comment: ""))
                        .font(.system(size: 14))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .lineSpacing(4)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

