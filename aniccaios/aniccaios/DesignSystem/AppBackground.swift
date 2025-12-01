import SwiftUI

struct AppBackground: View {
    var body: some View {
        // Mobbinデザイン: 温かいベージュ背景を適用
        if #available(iOS 15.0, *) {
            AppTheme.Colors.adaptiveBackground.ignoresSafeArea()
        } else {
            AppTheme.Colors.background.ignoresSafeArea()
        }
    }
}

