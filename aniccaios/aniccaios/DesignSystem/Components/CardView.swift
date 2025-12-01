import SwiftUI

struct CardView<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = AppTheme.Radius.card
    var backgroundColor: Color? = nil

    init(
        cornerRadius: CGFloat = AppTheme.Radius.card,
        backgroundColor: Color? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.backgroundColor = backgroundColor
        self.content = content()
    }

    var body: some View {
        content
            .padding(AppTheme.Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(backgroundColor ?? AppTheme.Colors.cardBackground)
            )
            .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
    }

    static func large(@ViewBuilder content: () -> Content) -> CardView {
        CardView(cornerRadius: AppTheme.Radius.cardLarge, content: content)
    }

    static func xLarge(@ViewBuilder content: () -> Content) -> CardView {
        CardView(cornerRadius: AppTheme.Radius.cardXLarge, content: content)
    }
}

