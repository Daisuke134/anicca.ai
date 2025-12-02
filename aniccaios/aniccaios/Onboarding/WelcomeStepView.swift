import SwiftUI

struct WelcomeStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Text("onboarding_welcome_title")
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)

            Text("onboarding_welcome_subtitle")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            PrimaryButton(
                title: String(localized: "onboarding_welcome_cta")
            ) { next() }
        }
        .padding(24)
        .background(AppBackground())
    }
}
