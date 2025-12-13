import SwiftUI
import UIKit

/// tech-ema-v3 準拠: 「楽になった？」Yes/No/Skip（dismissはSkip扱い）
struct EMAModal: View {
    let onAnswer: (Bool?) -> Void

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Text(String(localized: "ema_question"))
                .font(.system(size: 20, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, AppTheme.Spacing.lg)

            HStack(spacing: AppTheme.Spacing.lg) {
                PrimaryButton(
                    title: String(localized: "ema_yes"),
                    isEnabled: true,
                    isLoading: false,
                    style: .primary,
                    action: { haptic(); onAnswer(true) }
                )
                PrimaryButton(
                    title: String(localized: "ema_no"),
                    isEnabled: true,
                    isLoading: false,
                    style: .unselected,
                    action: { haptic(); onAnswer(false) }
                )
            }
            .padding(.horizontal, AppTheme.Spacing.xl)

            Button {
                haptic()
                onAnswer(nil)
            } label: {
                Text(String(localized: "ema_skip"))
                    .font(AppTheme.Typography.caption1Dynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(.top, AppTheme.Spacing.lg)

            Spacer(minLength: 0)
        }
        .padding(.bottom, AppTheme.Spacing.xxl)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private func haptic() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}

