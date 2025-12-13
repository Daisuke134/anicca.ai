import SwiftUI

struct FeelingCard: View {
    let emoji: String
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey

    var body: some View {
        HStack(spacing: AppTheme.Spacing.lg) {
            Text(emoji)
                .font(.system(size: 28))
                .frame(width: 36, height: 36, alignment: .center)

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(AppTheme.Typography.headlineDynamic)
                    .foregroundStyle(AppTheme.Colors.label)

                Text(subtitle)
                    .font(AppTheme.Typography.subheadlineDynamic)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(AppTheme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
                .fill(AppTheme.Colors.cardBackground)
                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
                .stroke(AppTheme.Colors.borderLight, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous))
    }
}

