import SwiftUI

/// 通知タップ後に表示される1枚画面カード
struct NudgeCardView: View {
    let content: NudgeContent
    let onPositiveAction: () -> Void
    let onNegativeAction: (() -> Void)?
    let onFeedback: (Bool) -> Void // true = 👍, false = 👎
    let onDismiss: () -> Void

    @State private var selectedAction: ActionType?
    @State private var showFeedbackButtons = true

    enum ActionType {
        case positive
        case negative
    }

    var body: some View {
        ZStack {
            // Background
            AppBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Close button
                HStack {
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .padding(12)
                    }
                    .accessibilityIdentifier("nudge-card-close")
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)

                Spacer()

                // Icon and title
                VStack(spacing: 12) {
                    ZStack(alignment: .topTrailing) {
                        Text(content.problemType.icon)
                            .font(.system(size: 48))

                        #if DEBUG
                        if content.isAIGenerated {
                            Text("🤖")
                                .font(.system(size: 16))
                                .offset(x: 8, y: -8)
                        }
                        #endif
                    }

                    HStack(spacing: 4) {
                        Text(content.problemType.notificationTitle)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .textCase(.uppercase)
                            .tracking(1)

                        #if DEBUG
                        if content.isAIGenerated {
                            Text("(LLM)")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.blue)
                        }
                        #endif
                    }
                }

                // Main quote
                VStack(spacing: 24) {
                    Divider()
                        .padding(.horizontal, 40)

                    Text(content.notificationText)
                        .font(.system(size: 22, weight: .semibold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(AppTheme.Colors.label)
                        .padding(.horizontal, 32)
                        .accessibilityIdentifier("nudge-hook-text")

                    Divider()
                        .padding(.horizontal, 40)
                }
                .padding(.vertical, 32)

                // Detail text
                Text(content.detailText)
                    .font(.system(size: 16))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineSpacing(6)
                    .padding(.horizontal, 40)
                    .accessibilityIdentifier("nudge-content-text")
                    .accessibilityValue(content.isAIGenerated ? "llm" : "rule")

                Spacer()

                // Buttons
                VStack(spacing: 24) {
                    Divider()
                        .padding(.horizontal, 40)

                    // 全ProblemTypeで主ボタン（ポジティブ）を1つだけ表示（選択肢を作らない）
                    primaryActionButtonView

                    Divider()
                        .padding(.horizontal, 40)

                    // Feedback buttons
                    if showFeedbackButtons {
                        feedbackButtonsView
                    } else {
                        Text("ありがとう！")
                            .font(.system(size: 16))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .accessibilityIdentifier("feedback-submitted")
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .accessibilityIdentifier("nudge-card-view")
    }

    // MARK: - Primary Action Button (single, unified style)
    private var primaryActionButtonView: some View {
        Button(action: {
            selectedAction = .positive
            onPositiveAction()
        }) {
            Text(content.problemType.positiveButtonText)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(AppTheme.Colors.buttonSelected)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityIdentifier("nudge-primary-action")
        .padding(.horizontal, 40)
    }

    // MARK: - Feedback Buttons
    private var feedbackButtonsView: some View {
        HStack(spacing: 32) {
            Button(action: {
                onFeedback(true)
                withAnimation {
                    showFeedbackButtons = false
                }
            }) {
                Text("👍")
                    .font(.system(size: 24))
                    .padding(8)
            }
            .accessibilityIdentifier("feedback-thumbs-up")

            Button(action: {
                onFeedback(false)
                withAnimation {
                    showFeedbackButtons = false
                }
            }) {
                Text("👎")
                    .font(.system(size: 24))
                    .padding(8)
            }
            .accessibilityIdentifier("feedback-thumbs-down")
        }
        .opacity(showFeedbackButtons ? 1 : 0)
    }
}

// MARK: - Preview
#Preview {
    let content = NudgeContent.contentForToday(for: .stayingUpLate)
    NudgeCardView(
        content: content,
        onPositiveAction: { print("Positive") },
        onNegativeAction: { print("Negative") },
        onFeedback: { good in print("Feedback: \(good)") },
        onDismiss: { print("Dismiss") }
    )
}
