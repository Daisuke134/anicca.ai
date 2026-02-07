import SwiftUI

struct DemoNudgeStepView: View {
    @EnvironmentObject private var appState: AppState
    let next: () -> Void

    @State private var showCard = false
    @State private var cardDismissed = false

    private var demoContent: NudgeContent {
        let firstProblem = appState.userProfile.struggles
            .compactMap { ProblemType(rawValue: $0) }
            .first ?? .stayingUpLate
        return NudgeContent.content(for: firstProblem, variantIndex: 0)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 24) {
                Spacer()

                Text(String(localized: "live_demo_title"))
                    .font(.title2.bold())
                    .foregroundStyle(AppTheme.Colors.label)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("live_demo_title")

                Text(String(localized: "live_demo_subtitle"))
                    .font(.body)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .multilineTextAlignment(.center)

                if !showCard && !cardDismissed {
                    Button(action: triggerDemo) {
                        Text(String(localized: "live_demo_button"))
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AppTheme.Colors.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .accessibilityIdentifier("live_demo_trigger_button")
                    .padding(.horizontal, 32)
                }

                Spacer()
            }
            .padding()

            if showCard {
                NudgeCardView(
                    content: demoContent,
                    onPositiveAction: {
                        withAnimation(.easeOut(duration: 0.3)) {
                            showCard = false
                            cardDismissed = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            next()
                        }
                    },
                    onNegativeAction: nil,
                    onFeedback: { _ in },
                    onDismiss: {
                        withAnimation(.easeOut(duration: 0.3)) {
                            showCard = false
                            cardDismissed = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            next()
                        }
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private func triggerDemo() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                showCard = true
            }
        }
    }
}
