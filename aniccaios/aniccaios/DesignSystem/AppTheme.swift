import SwiftUI

enum AppTheme {
    enum Colors {
        // Mobbinデザイン統合: 温かいカラーパレット
        static let accent: Color = .accentColor
        
        // ライトテーマ - Mobbinの温かいベージュ背景
        static let background: Color = Color(hex: "#f8f5ed")
        static let cardBackground: Color = Color(hex: "#fdfcfc")
        static let cardBackgroundAlt: Color = Color(hex: "#fcfcfb")
        
        // テキストカラー - Mobbinのダークグレー
        static let label: Color = Color(hex: "#393634")
        static let secondaryLabel: Color = Color(hex: "#898783")
        
        // ボタンカラー - Mobbinの選択状態
        static let buttonSelected: Color = Color(hex: "#222222")
        static let buttonUnselected: Color = Color(hex: "#e9e6e0")
        static let buttonTextSelected: Color = Color(hex: "#e1e1e1")
        static let buttonTextUnselected: Color = Color(hex: "#898783")
        
        // ボーダーカラー
        static let border: Color = Color(hex: "#c8c6bf")
        static let borderLight: Color = Color(hex: "#f2f0ed")
        
        // システムカラー（アクセシビリティ維持）
        static let success: Color = .green
        static let danger: Color = .red
        
        // ダークモード対応（必要に応じて）
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
        static let lg: CGFloat = 20  // Mobbin: より大きな角丸
        static let xl: CGFloat = 36   // Mobbin: 大きな角丸ボタン用
        static let card: CGFloat = 37  // Mobbin: カード用の大きな角丸（37-87px範囲の最小値）
        static let cardLarge: CGFloat = 76  // Mobbin: より大きなカード角丸（最大76px）
    }
    
    enum Typography {
        // Mobbin: Interフォントに近いサイズ階層（Dynamic Typeベースだが、固定サイズも提供）
        static let appTitle: Font = .system(size: 48, weight: .bold, design: .default)  // Mobbin: 44-50px
        static let title2: Font = .system(size: 46, weight: .semibold, design: .default)  // Mobbin: 42-49px
        static let headline: Font = .system(size: 43, weight: .semibold, design: .default)  // Mobbin: 見出し
        static let body: Font = .system(size: 40, weight: .regular, design: .default)  // Mobbin: 37-48px
        static let subheadline: Font = .system(size: 30, weight: .medium, design: .default)  // Mobbin: ラベル29-31px
        static let footnote: Font = .footnote
        
        // Dynamic Type対応版（アクセシビリティ維持）
        static let appTitleDynamic: Font = .largeTitle
        static let title2Dynamic: Font = .title2
        static let headlineDynamic: Font = .headline
        static let bodyDynamic: Font = .body
        static let subheadlineDynamic: Font = .subheadline
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

