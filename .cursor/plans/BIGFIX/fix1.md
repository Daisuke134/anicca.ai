了解。
**即開始する。**

ここからは **中断なしで連続で出す。**
（あなたは何も反応しなくていい、全部出し切る。）

---

# =========================================================

# ① DesignSystem

# =========================================================

# ■ 1-1. AppTheme.swift（完全版）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
import SwiftUI

enum AppTheme {
    enum Colors {
        static let accent: Color = .accentColor
        
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
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
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
*** End Patch
```

---

# ■ 1-2. AppBackground.swift（完全版）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
import SwiftUI

struct AppBackground: View {
    var useOpacity: Bool = false
    
    var body: some View {
        if #available(iOS 15.0, *) {
            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.adaptiveBackground)
                .ignoresSafeArea()
        } else {
            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.background)
                .ignoresSafeArea()
        }
    }
}
*** End Patch
```

---

# ■ 1-3. PrimaryButton.swift（完全版）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
import SwiftUI
import UIKit

struct PrimaryButton: View {
    let title: String
    var icon: String? = nil
    var isEnabled: Bool = true
    var isLoading: Bool = false
    var style: ButtonStyle = .primary
    let action: () -> Void

    enum ButtonStyle {
        case primary
        case selected
        case unselected
        case large
    }

    var body: some View {
        Button {
            guard isEnabled, !isLoading else { return }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        } label: {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().progressViewStyle(.circular)
                } else if let icon {
                    Image(systemName: icon)
                }
                Text(title)
                    .font(.headline)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .foregroundStyle(foregroundColor)
        .background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(backgroundColor)
        )
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(borderColor, lineWidth: borderWidth)
        )
        .opacity(isEnabled ? 1 : 0.6)
        .disabled(!isEnabled || isLoading)
    }

    private var backgroundColor: Color {
        switch style {
        case .primary, .large:
            return AppTheme.Colors.accent
        case .selected:
            return AppTheme.Colors.buttonSelected
        case .unselected:
            return AppTheme.Colors.buttonUnselected
        }
    }

    private var foregroundColor: Color {
        switch style {
        case .primary, .large:
            return .white
        case .selected:
            return AppTheme.Colors.buttonTextSelected
        case .unselected:
            return AppTheme.Colors.buttonTextUnselected
        }
    }

    private var cornerRadius: CGFloat {
        switch style {
        case .primary:
            return AppTheme.Radius.lg
        case .selected, .unselected:
            return AppTheme.Radius.xl
        case .large:
            return AppTheme.Radius.xxl
        }
    }

    private var borderColor: Color {
        switch style {
        case .primary, .large:
            return .clear
        case .selected:
            return AppTheme.Colors.border
        case .unselected:
            return AppTheme.Colors.borderLight
        }
    }

    private var borderWidth: CGFloat {
        switch style {
        case .primary, .large:
            return 0
        case .selected, .unselected:
            return 4
        }
    }
}
*** End Patch
```

---

# ■ 1-4. CardView.swift（完全版）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CardView.swift
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
*** End Patch
```

---

これが **DesignSystem ① 完全版**。

---

# 次メッセージで

## **DesignSystem（残り）**

DayOfWeekPicker.swift
GradientIcon.swift
SectionRow.swift
CustomTabBar.swift

を **全部一気に送る**。

（続ける）
