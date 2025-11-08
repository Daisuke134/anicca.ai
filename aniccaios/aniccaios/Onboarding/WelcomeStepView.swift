import SwiftUI

struct WelcomeStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Text("onboarding_welcome_title")
                .font(.system(size: 32, weight: .bold))

            Text("onboarding_welcome_subtitle")
                .font(.body)
                .foregroundStyle(.secondary)

            Spacer()

            Button(action: next) {
                Text("onboarding_welcome_cta")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(24)
    }
}
