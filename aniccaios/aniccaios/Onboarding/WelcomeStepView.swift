import SwiftUI

struct WelcomeStepView: View {
    let next: () -> Void

    var body: some View {
        VStack {
            Spacer()
            
            VStack(spacing: 32) {
                Text(String(localized: "onboarding_welcome_title"))
                    .font(.system(size: 52, weight: .bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.Colors.label)

                VStack(spacing: 8) {
                    Text(String(localized: "onboarding_welcome_subtitle_line1"))
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        .multilineTextAlignment(.center)

                    Text(String(localized: "onboarding_welcome_subtitle_line2"))
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
            }
            
            Spacer()
            
            PrimaryButton(
                title: String(localized: "onboarding_welcome_cta"),
                style: .large
            ) { next() }
            .padding(.horizontal, 16)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
    }
}
