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
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)

                Spacer()

                // Icon and title
                VStack(spacing: 12) {
                    Text(content.problemType.icon)
                        .font(.system(size: 48))

                    Text(content.problemType.notificationTitle)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .textCase(.uppercase)
                        .tracking(1)
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

                    #if DEBUG
                    Text("DEBUG: variant \(content.variantIndex)")
                        .font(.caption)
                        .foregroundStyle(.gray)
                    #endif

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

                Spacer()

                // Buttons
                VStack(spacing: 24) {
                    Divider()
                        .padding(.horizontal, 40)

                    if content.problemType.hasSingleButton {
                        // 1択ボタン
                        singleButtonView
                    } else {
                        // 2択ボタン
                        twoButtonView
                    }

                    Divider()
                        .padding(.horizontal, 40)

                    // Feedback buttons
                    if showFeedbackButtons {
                        feedbackButtonsView
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }

    // MARK: - Single Button (センシティブな問題向け)
    private var singleButtonView: some View {
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
        .padding(.horizontal, 40)
    }

    // MARK: - Two Buttons (Primary left, Ghost right)
    private var twoButtonView: some View {
        HStack(spacing: 12) {
            // Primary button (左・ポジティブ)
            Button(action: {
                selectedAction = .positive
                onPositiveAction()
            }) {
                Text(content.problemType.positiveButtonText)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(AppTheme.Colors.buttonSelected)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            // Ghost button (右・ネガティブ)
            if let negativeText = content.problemType.negativeButtonText {
                Button(action: {
                    selectedAction = .negative
                    onNegativeAction?()
                }) {
                    Text(negativeText)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(AppTheme.Colors.buttonUnselected)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(.horizontal, 32)
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
