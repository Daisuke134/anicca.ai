import SwiftUI

enum AppTheme {
    enum Colors {
        // Global accent (monochrome)
        static let accent: Color = Color(hex: "#222222")
        
        static let background: Color = Color(hex: "#f8f5ed")
        static let backgroundWithOpacity: Color = Color(red: 246/255, green: 245/255, blue: 236/255, opacity: 0.99)

        static let cardBackground: Color = Color(hex: "#fdfcfc")
        static let cardBackgroundAlt: Color = Color(hex: "#fcfcfb")

        static let label: Color = Color(hex: "#393634")
        static let secondaryLabel: Color = Color(hex: "#898783")

        static let buttonSelected: Color = Color(hex: "#222222")
        static let buttonUnselected: Color = Color(hex: "#e9e6e0")
        static let buttonTextSelected: Color = Color(hex: "#e1e1e1")
        static let buttonTextUnselected: Color = Color(hex: "#898783")

        static let border: Color = Color(hex: "#c8c6bf")
        static let borderLight: Color = Color(hex: "#f2f0ed")

        @available(iOS 15.0, *)
        static var adaptiveBackground: Color {
            Color(light: Color(hex: "#f8f5ed"), dark: Color(.systemGroupedBackground))
        }

        @available(iOS 15.0, *)
        static var adaptiveCardBackground: Color {
            Color(light: Color(hex: "#fdfcfc"), dark: Color(.secondarySystemGroupedBackground))
        }
    }
    
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }
    
    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 20
        static let xl: CGFloat = 36
        static let xxl: CGFloat = 76
        
        static let card: CGFloat = 37
        static let cardLarge: CGFloat = 76
        static let cardXLarge: CGFloat = 87
    }
    
    enum Typography {
        // オンボーディングの見出しを全画面で統一（1行収まる最大サイズ想定）
        static let onboardingTitle: Font = .system(size: 36, weight: .heavy)
        
        static let appTitleDynamic: Font = .largeTitle
        static let title2Dynamic: Font = .title2
        static let headlineDynamic: Font = .headline
        static let bodyDynamic: Font = .body
        static let subheadlineDynamic: Font = .subheadline

        static let appTitle: Font = .system(size: 48, weight: .bold)
        static let title2: Font = .system(size: 46, weight: .semibold)
        static let headline: Font = .system(size: 43, weight: .semibold)
        static let body: Font = .system(size: 40, weight: .regular)
        static let subheadline: Font = .system(size: 30, weight: .medium)
        static let footnote: Font = .footnote
        static let caption1Dynamic: Font = .caption
        static let caption2Dynamic: Font = .caption2
    }
}

// Color拡張: hex文字列からColorを生成
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
    
    @available(iOS 15.0, *)
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

