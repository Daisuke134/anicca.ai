import SwiftUI

struct WelcomeStepView: View {
    let next: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Text("Welcome to Anicca")
                .font(.system(size: 32, weight: .bold))

            Text("Let's configure your routines.")
                .font(.body)
                .foregroundStyle(.secondary)

            Spacer()

            Button(action: next) {
                Text("Get Started")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(24)
    }
}
