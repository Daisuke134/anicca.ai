import SwiftUI

struct WelcomeStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()

            Text("onboarding_welcome_title")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)

            Text("onboarding_welcome_subtitle")
                .font(.body)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Spacer()

            Button(action: next) {
                Text("onboarding_welcome_cta")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppBackground())
    }
}
