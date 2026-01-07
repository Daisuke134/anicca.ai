import SwiftUI

struct QuoteCard: View {
    let quote: String

    var body: some View {
        Text(quote)
            .font(AppTheme.Typography.bodyDynamic)
            .foregroundStyle(AppTheme.Colors.label)
            .multilineTextAlignment(.center)
            .padding(AppTheme.Spacing.xl)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
                    .fill(AppTheme.Colors.cardBackground)
                    .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
                    .stroke(AppTheme.Colors.borderLight, lineWidth: 1)
            )
    }
}





