# Anicca iOS UI モダナイズ計画 - 完全最終版

## 方針（Apple HIG / SwiftUI 最新準拠）

- Navigation: iOS 18ターゲットのため、アプリ全体を NavigationStack へ統一
- Typography: Dynamic Typeに準拠（.largeTitle 等の相対スタイル）。固定32ptは廃止
- CTA: 主要アクションは `PrimaryButton` に統一（ローディング/無効化/アイコン、軽いハプティクス）
- Background: 全画面を `AppBackground()`（systemGroupedBackground）で統一
- Colors: `AccentColor` を中核、役割ベーストークン（background/cardBackground/label/secondaryLabel）を追加
- Accessibility: コントラスト/可読性を優先（グラデ見出しは不採用）
- ComponentsKit: SUCard/SUBadge等は活用、主要CTAは段階的に `PrimaryButton` へ置換

---

## 完全擬似パッチ（統合最終版）

### 1. AppTheme.swift - デザインシステム基盤

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
+import SwiftUI
+
+enum AppTheme {
+    enum Colors {
+        // Mobbinデザイン統合: 温かいカラーパレット
+        static let accent: Color = .accentColor
+        
+        // ライトテーマ - Mobbinの温かいベージュ背景
+        static let background: Color = Color(hex: "#f8f5ed")
+        // Mobbin: rgba(246,245,236,0.99)の背景色オプション（透明度が必要な場合）
+        static let backgroundWithOpacity: Color = Color(red: 246/255, green: 245/255, blue: 236/255, opacity: 0.99)
+        static let cardBackground: Color = Color(hex: "#fdfcfc")
+        static let cardBackgroundAlt: Color = Color(hex: "#fcfcfb")
+        
+        // テキストカラー - Mobbinのダークグレー
+        static let label: Color = Color(hex: "#393634")
+        static let secondaryLabel: Color = Color(hex: "#898783")
+        
+        // ボタンカラー - Mobbinの選択状態
+        static let buttonSelected: Color = Color(hex: "#222222")
+        static let buttonUnselected: Color = Color(hex: "#e9e6e0")
+        static let buttonTextSelected: Color = Color(hex: "#e1e1e1")
+        static let buttonTextUnselected: Color = Color(hex: "#898783")
+        
+        // ボーダーカラー
+        static let border: Color = Color(hex: "#c8c6bf")
+        static let borderLight: Color = Color(hex: "#f2f0ed")
+        
+        // システムカラー（アクセシビリティ維持）
+        static let success: Color = .green
+        static let danger: Color = .red
+        
+        // ダークモード対応（必要に応じて）
+        @available(iOS 15.0, *)
+        static var adaptiveBackground: Color {
+            Color(light: Color(hex: "#f8f5ed"), dark: Color(.systemGroupedBackground))
+        }
+        
+        @available(iOS 15.0, *)
+        static var adaptiveCardBackground: Color {
+            Color(light: Color(hex: "#fdfcfc"), dark: Color(.secondarySystemGroupedBackground))
+        }
+    }
+
+    enum Spacing {
+        static let xs: CGFloat = 4
+        static let sm: CGFloat = 8
+        static let md: CGFloat = 12
+        static let lg: CGFloat = 16
+        static let xl: CGFloat = 24
+        static let xxl: CGFloat = 32
+    }
+
+    enum Radius {
+        static let sm: CGFloat = 8
+        static let md: CGFloat = 12
+        static let lg: CGFloat = 20  // Mobbin: より大きな角丸
+        static let xl: CGFloat = 36   // Mobbin: 大きな角丸ボタン用
+        static let xxl: CGFloat = 76  // Mobbin: 最大角丸ボタン用（36-76px範囲の最大値）
+        static let card: CGFloat = 37  // Mobbin: カード用の大きな角丸（37-87px範囲の最小値）
+        static let cardLarge: CGFloat = 76  // Mobbin: より大きなカード角丸（最大76px）
+        static let cardXLarge: CGFloat = 87  // Mobbin: 最大カード角丸（37-87px範囲の最大値）
+    }
+
+    enum Typography {
+        // Mobbin: サイズ階層を反映（SF Proシステムフォント使用、Dynamic Type対応）
+        static let appTitle: Font = .system(size: 48, weight: .bold, design: .default)  // Mobbin: 44-50px
+        static let title2: Font = .system(size: 46, weight: .semibold, design: .default)  // Mobbin: 42-49px
+        static let headline: Font = .system(size: 43, weight: .semibold, design: .default)  // Mobbin: 見出し
+        static let body: Font = .system(size: 40, weight: .regular, design: .default)  // Mobbin: 37-48px
+        static let subheadline: Font = .system(size: 30, weight: .medium, design: .default)  // Mobbin: ラベル29-31px
+        static let footnote: Font = .footnote
+        
+        // Dynamic Type対応版（アクセシビリティ維持）
+        static let appTitleDynamic: Font = .largeTitle
+        static let title2Dynamic: Font = .title2
+        static let headlineDynamic: Font = .headline
+        static let bodyDynamic: Font = .body
+        static let subheadlineDynamic: Font = .subheadline
+    }
+}
+
+// Color拡張: hex文字列からColorを生成
+extension Color {
+    init(hex: String) {
+        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
+        var int: UInt64 = 0
+        Scanner(string: hex).scanHexInt64(&int)
+        let a, r, g, b: UInt64
+        switch hex.count {
+        case 3: // RGB (12-bit)
+            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
+        case 6: // RGB (24-bit)
+            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
+        case 8: // ARGB (32-bit)
+            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
+        default:
+            (a, r, g, b) = (255, 0, 0, 0)
+        }
+        self.init(
+            .sRGB,
+            red: Double(r) / 255,
+            green: Double(g) / 255,
+            blue: Double(b) / 255,
+            opacity: Double(a) / 255
+        )
+    }
+    
+    @available(iOS 15.0, *)
+    init(light: Color, dark: Color) {
+        self.init(uiColor: UIColor { traitCollection in
+            traitCollection.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
+        })
+    }
+}
+
+*** End Patch
+```

### 2. AppBackground.swift - 背景コンポーネント

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
+import SwiftUI
+
+struct AppBackground: View {
+    var useOpacity: Bool = false  // rgba背景色を使用するかどうか
+    
+    var body: some View {
+        // Mobbinデザイン: 温かいベージュ背景を適用
+        if #available(iOS 15.0, *) {
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.adaptiveBackground).ignoresSafeArea()
+        } else {
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.background).ignoresSafeArea()
+        }
+    }
+}
+
+*** End Patch
+```

### 3. PrimaryButton.swift - 主要CTAボタン

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
+import SwiftUI
+import UIKit
+
+struct PrimaryButton: View {
+    let title: String
+    var icon: String? = nil
+    var isEnabled: Bool = true
+    var isLoading: Bool = false
+    var style: ButtonStyle = .primary
+    let action: () -> Void
+    
+    enum ButtonStyle {
+        case primary      // アクセントカラー背景
+        case selected      // Mobbin: ダークグレー背景（選択状態）
+        case unselected    // Mobbin: ライトグレー背景（未選択状態）
+        case large         // Mobbin: より大きな角丸ボタン（76px）
+    }
+
+    var body: some View {
+        Button {
+            guard isEnabled, !isLoading else { return }
+            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
+            action()
+        } label: {
+            HStack(spacing: 8) {
+                if isLoading { ProgressView().progressViewStyle(.circular) }
+                else if let icon { Image(systemName: icon) }
+                Text(title).fontWeight(.semibold).lineLimit(1)
+            }
+            .frame(maxWidth: .infinity)
+            .padding(.vertical, 16)
+        }
+        .foregroundStyle(foregroundColor)
+        .background(
+            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
+                .fill(backgroundColor)
+        )
+        .overlay(
+            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
+                .stroke(borderColor, lineWidth: borderWidth)
+        )
+        .opacity(isEnabled ? 1 : 0.6)
+        .contentShape(Rectangle())
+        .accessibilityLabel(Text(title))
+        .accessibilityAddTraits(.isButton)
+        .disabled(!isEnabled || isLoading)
+    }
+    
+    private var backgroundColor: Color {
+        guard isEnabled else {
+            return AppTheme.Colors.accent.opacity(0.4)
+        }
+        switch style {
+        case .primary:
+            return AppTheme.Colors.accent
+        case .selected:
+            return AppTheme.Colors.buttonSelected
+        case .unselected:
+            return AppTheme.Colors.buttonUnselected
+        case .large:
+            return AppTheme.Colors.accent
+        }
+    }
+    
+    private var foregroundColor: Color {
+        switch style {
+        case .primary:
+            return .white
+        case .selected:
+            return AppTheme.Colors.buttonTextSelected
+        case .unselected:
+            return AppTheme.Colors.buttonTextUnselected
+        case .large:
+            return .white
+        }
+    }
+    
+    private var cornerRadius: CGFloat {
+        switch style {
+        case .primary:
+            return AppTheme.Radius.lg
+        case .selected, .unselected:
+            return AppTheme.Radius.xl
+        case .large:
+            return AppTheme.Radius.xxl  // Mobbin: 最大76pxの角丸
+        }
+    }
+    
+    private var borderColor: Color {
+        switch style {
+        case .primary:
+            return .clear
+        case .selected:
+            return AppTheme.Colors.border
+        case .unselected:
+            return AppTheme.Colors.borderLight
+        case .large:
+            return .clear
+        }
+    }
+    
+    private var borderWidth: CGFloat {
+        switch style {
+        case .primary:
+            return 0
+        case .selected, .unselected:
+            return 4
+        case .large:
+            return 0
+        }
+    }
+}
+
+*** End Patch
+```

### 4. CardView.swift - カードコンポーネント

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CardView.swift
+import SwiftUI
+
+// Mobbinデザイン: カードコンポーネント
+struct CardView<Content: View>: View {
+    let content: Content
+    var cornerRadius: CGFloat = AppTheme.Radius.card
+    var backgroundColor: Color? = nil
+    
+    init(cornerRadius: CGFloat = AppTheme.Radius.card,
+         backgroundColor: Color? = nil,
+         @ViewBuilder content: () -> Content) {
+        self.cornerRadius = cornerRadius
+        self.backgroundColor = backgroundColor
+        self.content = content()
+    }
+    
+    var body: some View {
+        content
+            .padding(AppTheme.Spacing.lg)
+            .background(
+                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
+                    .fill(backgroundColor ?? AppTheme.Colors.cardBackground)
+            )
+            .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
+    }
+    
+    // 大きなカード用の便利なイニシャライザ
+    static func large(@ViewBuilder content: () -> Content) -> CardView<Content> {
+        CardView(cornerRadius: AppTheme.Radius.cardLarge, content: content)
+    }
+    
+    // Mobbin: 最大角丸カード用の便利なイニシャライザ（87px）
+    static func xLarge(@ViewBuilder content: () -> Content) -> CardView<Content> {
+        CardView(cornerRadius: AppTheme.Radius.cardXLarge, content: content)
+    }
+}
+
+*** End Patch
+```

### 5. DayOfWeekPicker.swift - 曜日選択UI

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/DayOfWeekPicker.swift
+import SwiftUI
+
+// Mobbinデザイン: 曜日選択UIコンポーネント（円形、4pxボーダー）
+// 注意: Mobbinのデザインでは145×145pxだが、実用的なサイズ（48px）に調整
+// 視覚的スタイル（選択/未選択の色、ボーダー）はMobbinデザインを維持
+struct DayOfWeekPicker: View {
+    @Binding var selectedDays: Set<Int>  // 0=日曜日, 1=月曜日, ..., 6=土曜日
+    
+    private let dayLabels = ["S", "M", "T", "W", "T", "F", "S"]
+    private let dayNames = [
+        String(localized: "day_sunday_short"),
+        String(localized: "day_monday_short"),
+        String(localized: "day_tuesday_short"),
+        String(localized: "day_wednesday_short"),
+        String(localized: "day_thursday_short"),
+        String(localized: "day_friday_short"),
+        String(localized: "day_saturday_short")
+    ]
+    
+    var body: some View {
+        HStack(spacing: 12) {
+            ForEach(0..<7) { index in
+                dayButton(for: index)
+            }
+        }
+    }
+    
+    @ViewBuilder
+    private func dayButton(for index: Int) -> some View {
+        let isSelected = selectedDays.contains(index)
+        
+        Button(action: {
+            if isSelected {
+                selectedDays.remove(index)
+            } else {
+                selectedDays.insert(index)
+            }
+        }) {
+            Text(dayLabels[index])
+                .font(.system(size: 20, weight: .semibold))
+                .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .frame(width: 48, height: 48)
+                .background(
+                    Circle()
+                        .fill(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                )
+                .overlay(
+                    Circle()
+                        .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: 4)
+                )
+        }
+        .buttonStyle(.plain)
+    }
+}
+
+*** End Patch
+```

### 6. GradientIcon.swift - グラデーションアイコン

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/GradientIcon.swift
+import SwiftUI
+
+// Mobbinデザイン: グラデーションアイコン（ストリーク表示用）
+// 使用例: 習慣のストリーク表示、達成状況の視覚化など
+// 注意: 現在のAniccaアプリではストリーク機能は未実装のため、将来的な拡張用に準備
+struct GradientIcon: View {
+    enum GradientType {
+        case fireOrange    // オレンジ→黄色
+        case waterBlue     // 水色→青
+        case grassGreen    // 緑→黄緑
+        case sunsetRed     // オレンジ→赤
+        
+        var colors: [Color] {
+            switch self {
+            case .fireOrange:
+                return [Color(hex: "#FF6B35"), Color(hex: "#FFD23F")]
+            case .waterBlue:
+                return [Color(hex: "#4ECDC4"), Color(hex: "#44A3F7")]
+            case .grassGreen:
+                return [Color(hex: "#6BCB77"), Color(hex: "#A8E063")]
+            case .sunsetRed:
+                return [Color(hex: "#FF6B35"), Color(hex: "#FF3B3B")]
+            }
+        }
+    }
+    
+    let gradientType: GradientType
+    var size: CGFloat = 60
+    
+    var body: some View {
+        ZStack {
+            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
+                .fill(
+                    LinearGradient(
+                        gradient: Gradient(colors: gradientType.colors),
+                        startPoint: .topLeading,
+                        endPoint: .bottomTrailing
+                    )
+                )
+                .frame(width: size, height: size)
+                .rotationEffect(.degrees(-15))
+            
+            RoundedRectangle(cornerRadius: size * 0.25, style: .continuous)
+                .fill(
+                    LinearGradient(
+                        gradient: Gradient(colors: [
+                            gradientType.colors[0].opacity(0.3),
+                            gradientType.colors[1].opacity(0.1)
+                        ]),
+                        startPoint: .topLeading,
+                        endPoint: .bottomTrailing
+                    )
+                )
+                .frame(width: size * 0.7, height: size * 0.7)
+                .rotationEffect(.degrees(15))
+        }
+    }
+}
+
+*** End Patch
+```

### 7. SectionRow.swift - セクション行コンポーネント

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/SectionRow.swift
+import SwiftUI
+
+// Mobbinデザイン: セクション構造コンポーネント（ラベル左 + コントロール右）
+struct SectionRow<Content: View>: View {
+    let label: String
+    @ViewBuilder let content: () -> Content
+    
+    var body: some View {
+        HStack {
+            Text(label)
+                .font(AppTheme.Typography.subheadlineDynamic)
+                .foregroundStyle(AppTheme.Colors.label)
+                .frame(maxWidth: .infinity, alignment: .leading)
+            
+            Spacer()
+            
+            content()
+        }
+        .padding(.vertical, AppTheme.Spacing.sm)
+    }
+}
+
+// 便利な拡張: よく使うパターン
+extension SectionRow {
+    // トグルスイッチ付き
+    static func toggle(label: String, isOn: Binding<Bool>) -> some View {
+        SectionRow(label: label) {
+            Toggle("", isOn: isOn)
+                .labelsHidden()
+        }
+    }
+    
+    // テキスト付き
+    static func text(label: String, text: String) -> some View {
+        SectionRow(label: label) {
+            Text(text)
+                .font(AppTheme.Typography.subheadlineDynamic)
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+        }
+    }
+    
+    // ボタン付き
+    static func button(label: String, title: String, action: @escaping () -> Void) -> some View {
+        SectionRow(label: label) {
+            Button(action: action) {
+                HStack(spacing: 4) {
+                    Text(title)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                    Image(systemName: "chevron.right")
+                        .font(.caption)
+                }
+                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+            }
+        }
+    }
+    
+    // Picker付き（SettingsView用）
+    static func picker<SelectionValue: Hashable>(
+        label: String,
+        selection: Binding<SelectionValue>,
+        @ViewBuilder content: () -> some View
+    ) -> some View {
+        SectionRow(label: label) {
+            Picker("", selection: selection, content: content)
+                .labelsHidden()
+                .pickerStyle(.menu)
+        }
+    }
+}
+
+*** End Patch
+```

### 8. CustomTabBar.swift - カスタムタブバー（将来の拡張用、現在は標準TabViewを使用）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CustomTabBar.swift
+import SwiftUI
+
+// Mobbinデザイン: カスタムタブバー（下部タブバー、選択状態の視覚的フィードバック）
+// 注意: 現在は標準TabViewを使用してスワイプジェスチャーやアクセシビリティ機能を維持
+// このコンポーネントは将来の拡張用に準備（必要に応じて使用）
+struct CustomTabBar: View {
+    @Binding var selectedTab: Int
+    let tabs: [TabItem]
+    
+    struct TabItem: Identifiable {
+        let id: Int
+        let title: String
+        let icon: String
+        let badge: Int?
+    }
+    
+    var body: some View {
+        HStack(spacing: 0) {
+            ForEach(tabs) { tab in
+                tabButton(for: tab)
+            }
+        }
+        .frame(height: 60)
+        .background(
+            RoundedRectangle(cornerRadius: 0)
+                .fill(AppTheme.Colors.cardBackground)
+                .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: -2)
+        )
+    }
+    
+    @ViewBuilder
+    private func tabButton(for tab: TabItem) -> some View {
+        let isSelected = selectedTab == tab.id
+        
+        Button(action: {
+            withAnimation(.easeInOut(duration: 0.2)) {
+                selectedTab = tab.id
+            }
+        }) {
+            VStack(spacing: 4) {
+                ZStack {
+                    Image(systemName: tab.icon)
+                        .font(.system(size: 20, weight: isSelected ? .semibold : .regular))
+                        .foregroundStyle(isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
+                    
+                    if let badge = tab.badge, badge > 0 {
+                        Text("\(badge)")
+                            .font(.system(size: 10, weight: .bold))
+                            .foregroundColor(.white)
+                            .padding(4)
+                            .background(
+                                Circle()
+                                    .fill(Color.red)
+                            )
+                            .offset(x: 12, y: -12)
+                    }
+                }
+                
+                Text(tab.title)
+                    .font(.system(size: 12, weight: isSelected ? .semibold : .regular))
+                    .foregroundStyle(isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel)
+            }
+            .frame(maxWidth: .infinity)
+            .overlay(
+                Rectangle()
+                    .fill(isSelected ? AppTheme.Colors.accent : Color.clear)
+                    .frame(height: 2)
+                    .offset(y: 28)
+            )
+        }
+        .buttonStyle(.plain)
+        .accessibilityLabel("\(tab.title)タブ")
+        .accessibilityAddTraits(isSelected ? .isSelected : [])
+    }
+}
+
+*** End Patch
+```

### 9. aniccaiosApp.swift - アプリルート設定

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/aniccaiosApp.swift
@@
         WindowGroup {
             ContentRouterView()
                 .environmentObject(appState)
+                .tint(AppTheme.Colors.accent)
         }
     }
 }
*** End Patch
```

### 10. ContentView.swift - 認証処理画面

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/ContentView.swift
@@
 struct AuthenticationProcessingView: View {
     var body: some View {
         VStack(spacing: 24) {
             ProgressView()
                 .scaleEffect(1.5)
             Text("common_signing_in")
                 .font(.headline)
                 .foregroundStyle(.secondary)
         }
         .frame(maxWidth: .infinity, maxHeight: .infinity)
+        .background(AppBackground())
     }
 }
*** End Patch
```

### 11. SessionView.swift - セッション画面（主要CTAに.largeスタイル適用）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
-    private var authenticatedContent: some View {
-        VStack(spacing: 24) {
-            HStack {
-                Spacer()
-                Button(action: {
-                    isShowingSettings = true
-                }) {
-                    Image(systemName: "gearshape")
-                        .font(.title3)
-                }
-                .buttonStyle(.bordered)
-            }
-            .frame(maxWidth: .infinity, alignment: .trailing)
-            .padding(.top)
-
-            Text("Anicca")
-                .font(.system(size: 32, weight: .bold))
-
-            if shouldShowWakeSilentNotice {
-                Text(String(localized: "session_wake_silent_notice"))
-                    .multilineTextAlignment(.center)
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
-                    .padding(16)
-                    .frame(maxWidth: .infinity)
-                    .background(
-                        RoundedRectangle(cornerRadius: 16, style: .continuous)
-                            .fill(.thinMaterial)
-                    )
-            }
-
-            Spacer(minLength: 24)
-
-            sessionButton
-        }
-        .padding()
-        .sheet(isPresented: $isShowingSettings) {
+    private struct ButtonConfig {
+        let title: String
+        let icon: String?
+        let isLoading: Bool
+        let isEnabled: Bool
+        let action: () -> Void
+    }
+
+    private var authenticatedContent: some View {
+        NavigationStack {
+            VStack(spacing: AppTheme.Spacing.xl) {
+                Text("Anicca")
+                    .font(AppTheme.Typography.appTitle)
+                    .fontWeight(.heavy)
+                    .foregroundStyle(AppTheme.Colors.label)
+
+                if shouldShowWakeSilentNotice {
+                    Text(String(localized: "session_wake_silent_notice"))
+                        .multilineTextAlignment(.center)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                        .padding(AppTheme.Spacing.lg)
+                        .frame(maxWidth: .infinity)
+                        .background(
+                            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                                .fill(AppTheme.Colors.cardBackground)
+                                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
+                        )
+                }
+
+                Spacer(minLength: AppTheme.Spacing.xl)
+
+                sessionButton
+            }
+            .padding()
+            .background(AppBackground())
+            .toolbar {
+                ToolbarItem(placement: .topBarTrailing) {
+                    Button { isShowingSettings = true } label: { Image(systemName: "gearshape") }
+                }
+            }
+            .navigationBarTitleDisplayMode(.inline)
+        }
+        .sheet(isPresented: $isShowingSettings) {
             SettingsView()
                 .environmentObject(appState)
         }
@@
-    private var sessionButton: some View {
-        let config = buttonConfig
-        return Button(config.title) {
-            config.action()
-        }
-        .buttonStyle(BorderedProminentButtonStyle())
-        .controlSize(.large)
-        .disabled(config.disabled)
-    }
-    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
+    private var sessionButton: some View {
+        let config = buttonConfig
+        return PrimaryButton(
+            title: config.title,
+            icon: config.icon,
+            isEnabled: config.isEnabled,
+            isLoading: config.isLoading,
+            style: .large,  // Mobbin: 76px角丸の大きなボタン
+            action: config.action
+        )
+    }
+    private var buttonConfig: ButtonConfig {
         switch controller.connectionStatus {
         case .connected:
-            return (
-                title: String(localized: "session_button_end"),
-                disabled: false,
-                action: { 
-                    controller.stop()
-                    // エビデンス: stop()時にはmarkQuotaHoldを呼ばない（エンドセッション押下時の誤表示を防ぐ）
-                }
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_end"),
+                icon: "stop.fill",
+                isLoading: false,
+                isEnabled: true,
+                action: { controller.stop() }
+            )
         case .connecting:
-            return (
-                title: String(localized: "session_button_connecting"),
-                disabled: true,
-                action: {}
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_connecting"),
+                icon: "hourglass",
+                isLoading: true,
+                isEnabled: false,
+                action: {}
+            )
         case .disconnected:
-            return (
-                title: String(localized: "session_button_talk"),
-                disabled: false,
-                action: {
-                    let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
-                    if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
-                        // 上限に達している時だけ毎回シートを表示
-                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
-                        isShowingLimitModal = true
-                        return
-                    }
-                    controller.start()
-                }
-            )
+            return ButtonConfig(
+                title: String(localized: "session_button_talk"),
+                icon: "mic.fill",
+                isLoading: false,
+                isEnabled: true,
+                action: {
+                    let remaining = appState.subscriptionInfo.monthlyUsageRemaining ?? 1
+                    if appState.subscriptionHold || (!appState.subscriptionInfo.isEntitled && remaining <= 0) {
+                        appState.markQuotaHold(plan: appState.subscriptionInfo.plan, reason: .quotaExceeded)
+                        isShowingLimitModal = true
+                        return
+                    }
+                    controller.start()
+                }
+            )
         }
     }
+    
+    // 注意: navigationContainer関数は削除（iOS 18ターゲットのためNavigationStackに統一）
*** End Patch
```

### 11-2. SessionView.swift - navigationContainer関数の削除確認

**重要**: SessionView.swiftのパッチでは、`authenticatedContent`を`NavigationStack`に変更していますが、`navigationContainer`関数の定義（23-33行目）も削除する必要があります。

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
@@
     }
-    
-    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
-    @ViewBuilder
-    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
-        if #available(iOS 16.0, *) {
-            NavigationStack {
-                content()
-            }
-        } else {
-            NavigationView {
-                content()
-            }
-        }
-    }
-    
     private var authenticatedContent: some View {
*** End Patch
```

### 12. オンボーディング各画面の更新

#### WelcomeStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/WelcomeStepView.swift
@@
-            Text("onboarding_welcome_title")
-                .font(.system(size: 32, weight: .bold))
+            Text("onboarding_welcome_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
@@
-            Button(action: next) {
-                Text("onboarding_welcome_cta")
-                    .frame(maxWidth: .infinity)
-            }
-            .buttonStyle(.borderedProminent)
-            .controlSize(.large)
+            PrimaryButton(title: String(localized: "onboarding_welcome_cta")) { next() }
         }
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### AuthenticationStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/AuthenticationStepView.swift
@@
-            Text("onboarding_account_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_account_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### MicrophonePermissionStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/MicrophonePermissionStepView.swift
@@
-            Text("onboarding_microphone_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_microphone_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            SUButton(
-                                model: {
-                                    var vm = ButtonVM()
-                                    vm.title = isRequesting
-                                        ? String(localized: "common_requesting")
-                                        : String(localized: "common_continue")
-                                    vm.style = .filled
-                                    vm.size = .medium
-                                    vm.isFullWidth = true
-                                    vm.isEnabled = !isRequesting
-                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                                    return vm
-                                }(),
-                                action: requestMicrophone
-                            )
+                            PrimaryButton(
+                                title: isRequesting ? String(localized: "common_requesting") : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) { requestMicrophone() }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### NotificationPermissionStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift
@@
-            Text(String(localized: "onboarding_notifications_title"))
-                .font(.title)
-                .padding(.top, 40)
+            Text(String(localized: "onboarding_notifications_title"))
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            SUButton(
-                                model: {
-                                    var vm = ButtonVM()
-                                    vm.title = isRequesting
-                                        ? String(localized: "common_requesting")
-                                        : String(localized: "common_continue")
-                                    vm.style = .filled
-                                    vm.size = .medium
-                                    vm.isFullWidth = true
-                                    vm.isEnabled = !isRequesting
-                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                                    return vm
-                                }(),
-                                action: requestNotifications
-                            )
+                            PrimaryButton(
+                                title: isRequesting ? String(localized: "common_requesting") : String(localized: "common_continue"),
+                                isEnabled: !isRequesting,
+                                isLoading: isRequesting
+                            ) { requestNotifications() }
@@
-        .padding(24)
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### HabitSetupStepView.swift - カードベースレイアウト適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
-            Text("onboarding_habit_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_habit_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
             Text("onboarding_habit_description")
                 .font(.subheadline)
                 .foregroundStyle(.secondary)
                 .multilineTextAlignment(.center)
                 .padding(.horizontal)
             
-            List {
-                Section {
-                    ForEach(sortedAllHabits, id: \.id) { item in
-                        if item.isCustom, let customId = item.customId {
-                            customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
-                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
-                                    Button(role: .destructive) {
-                                        appState.removeCustomHabit(id: customId)
-                                    } label: {
-                                        Label(String(localized: "common_delete"), systemImage: "trash")
-                                    }
-                                }
-                        } else if let habit = HabitType(rawValue: item.id) {
-                            habitCard(for: habit, isCustom: false)
-                        }
-                    }
-                    
-                    Button(action: { showingAddCustomHabit = true }) {
-                        HStack {
-                            Image(systemName: "plus.circle.fill")
-                            Text("habit_add_custom")
-                        }
-                    }
-                }
-            }
-            .listStyle(.insetGrouped)
+            // Mobbinデザイン: カードベースのリスト表示
+            ScrollView {
+                VStack(spacing: AppTheme.Spacing.md) {
+                    ForEach(sortedAllHabits, id: \.id) { item in
+                        if item.isCustom, let customId = item.customId {
+                            CardView {
+                                customHabitCard(for: appState.customHabits.first(where: { $0.id == customId })!)
+                                    .contextMenu {
+                                        Button(role: .destructive, action: {
+                                            appState.removeCustomHabit(id: customId)
+                                        }) {
+                                            Label(String(localized: "common_delete"), systemImage: "trash")
+                                        }
+                                    }
+                            }
+                        } else if let habit = HabitType(rawValue: item.id) {
+                            CardView {
+                                habitCard(for: habit, isCustom: false)
+                            }
+                        }
+                    }
+                    
+                    CardView {
+                        Button(action: { showingAddCustomHabit = true }) {
+                            HStack {
+                                Image(systemName: "plus.circle.fill")
+                                Text("habit_add_custom")
+                            }
+                            .foregroundStyle(AppTheme.Colors.accent)
+                            .frame(maxWidth: .infinity, alignment: .leading)
+                        }
+                    }
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+            }
 
             Spacer()
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_done")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = canSave
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_done"),
+                isEnabled: canSave,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
@@
-        .sheet(isPresented: $showingAddCustomHabit) {
-            NavigationView {
+        .sheet(isPresented: $showingAddCustomHabit) {
+            NavigationStack {
                 Form {
@@
-            }
+            }
         }
+        .background(AppBackground())
@@
+    @ViewBuilder
+    private func habitCard(for habit: HabitType, isCustom: Bool) -> some View {
+        let isSelected = selectedHabits.contains(habit)
+        
+        HStack {
+            VStack(alignment: .leading, spacing: 8) {
+                Text(habit.title)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+            }
+            
+            Spacer()
+            
+            if isSelected {
+                if let time = habitTimes[habit] {
+                    Text(time.formatted(.dateTime.hour().minute()))
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+            }
+            
+            Toggle("", isOn: Binding(
+                get: { isSelected },
+                set: { isOn in
+                    if isOn {
+                        selectedHabits.insert(habit)
+                        sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
+                        showingTimePicker = habit
+                    } else {
+                        selectedHabits.remove(habit)
+                        habitTimes.removeValue(forKey: habit)
+                    }
+                }
+            ))
+            .labelsHidden()
+        }
+        .padding(AppTheme.Spacing.md)
+        .contentShape(Rectangle())
+        .onTapGesture {
+            sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
+            showingTimePicker = habit
+        }
+    }
+    
+    @ViewBuilder
+    private func customHabitCard(for customHabit: CustomHabitConfiguration) -> some View {
+        let hasTime = customHabitTimes[customHabit.id] != nil
+        
+        HStack {
+            VStack(alignment: .leading, spacing: 8) {
+                Text(customHabit.name)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
+            }
+            
+            Spacer()
+            
+            if hasTime {
+                if let time = customHabitTimes[customHabit.id] {
+                    Text(time.formatted(.dateTime.hour().minute()))
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                }
+            }
+            
+            Toggle("", isOn: Binding(
+                get: { hasTime },
+                set: { isOn in
+                    if isOn {
+                        sheetTime = customHabitTimes[customHabit.id] ?? Date()
+                        showingCustomTimePicker = customHabit.id
+                    } else {
+                        customHabitTimes.removeValue(forKey: customHabit.id)
+                    }
+                }
+            ))
+            .labelsHidden()
+        }
+        .padding(AppTheme.Spacing.md)
+        .contentShape(Rectangle())
+        .onTapGesture {
+            sheetTime = customHabitTimes[customHabit.id] ?? Date()
+            showingCustomTimePicker = customHabit.id
+        }
+    }
*** End Patch
```

#### ProfileInfoStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/ProfileInfoStepView.swift
@@
-            Text("onboarding_profile_title")
-                .font(.title)
-                .padding(.top, 40)
+            Text("onboarding_profile_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "onboarding_profile_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "onboarding_profile_continue"),
+                isEnabled: !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .background(AppBackground())
*** End Patch
```

#### CompletionStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/CompletionStepView.swift
@@
-            Text("onboarding_completion_title")
-                .font(.title)
-                .fontWeight(.bold)
+            Text("onboarding_completion_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = String(localized: "onboarding_completion_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: next
-            )
+            PrimaryButton(title: String(localized: "onboarding_completion_continue")) { next() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
-        .padding(24)
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### HabitWakeLocationStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitWakeLocationStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_wake_location_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_wake_location_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### HabitSleepLocationStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSleepLocationStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_sleep_location_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_sleep_location_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

#### HabitTrainingFocusStepView.swift

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitTrainingFocusStepView.swift
@@
-        VStack(spacing: 24) {
-            Text("onboarding_habit_training_title")
-                .font(.title)
-                .padding(.top, 40)
+        VStack(spacing: 24) {
+            Text("onboarding_habit_training_title")
+                .font(AppTheme.Typography.appTitle)
+                .fontWeight(.heavy)
+                .foregroundStyle(AppTheme.Colors.label)
+                .padding(.top, 40)
@@
-                            Image(systemName: selectedTrainingFocus == option.id ? "checkmark.circle.fill" : "circle")
-                                .foregroundStyle(selectedTrainingFocus == option.id ? .blue : .secondary)
+                            Image(systemName: selectedTrainingFocus == option.id ? "checkmark.circle.fill" : "circle")
+                                .foregroundStyle(selectedTrainingFocus == option.id ? AppTheme.Colors.accent : .secondary)
@@
-                        .background(
-                            RoundedRectangle(cornerRadius: 8)
-                                .fill(selectedTrainingFocus == option.id ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
-                        )
+                        .background(
+                            RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                                .fill(selectedTrainingFocus == option.id ? AppTheme.Colors.accent.opacity(0.1) : AppTheme.Colors.buttonUnselected)
+                                .overlay(
+                                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                                        .stroke(selectedTrainingFocus == option.id ? AppTheme.Colors.accent : AppTheme.Colors.borderLight, lineWidth: selectedTrainingFocus == option.id ? 2 : 1)
+                                )
+                        )
@@
-            SUButton(
-                model: {
-                    var vm = ButtonVM()
-                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
-                    vm.style = .filled
-                    vm.size = .large
-                    vm.isFullWidth = true
-                    vm.isEnabled = !selectedTrainingFocus.isEmpty && !isSaving
-                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                    return vm
-                }(),
-                action: save
-            )
+            PrimaryButton(
+                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
+                isEnabled: !selectedTrainingFocus.isEmpty && !isSaving,
+                isLoading: isSaving
+            ) { save() }
             .padding(.horizontal)
             .padding(.bottom)
-        }
+        }
+        .padding(24)
+        .background(AppBackground())
*** End Patch
```

### 13. ManageSubscriptionSheet.swift - サブスクリプション管理画面

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Views/ManageSubscriptionSheet.swift
@@
-    var body: some View {
-        NavigationView {
+    var body: some View {
+        NavigationStack {
             ScrollView {
@@
-        }
+        }
+        .background(AppBackground())
         .task {
             await loadOffering()
         }
@@
-                if !isCurrentPlan {
-                    SUButton(
-                        model: {
-                            var vm = ButtonVM()
-                            vm.title = String(localized: "settings_subscription_select")
-                            vm.style = .filled
-                            vm.size = .medium
-                            vm.isFullWidth = true
-                            vm.isEnabled = !isPurchasing
-                            vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
-                            return vm
-                        }(),
-                        action: {
-                            Task {
-                                await purchasePackage(package)
-                            }
-                        }
-                    )
-                }
+                if !isCurrentPlan {
+                    PrimaryButton(
+                        title: String(localized: "settings_subscription_select"),
+                        isEnabled: !isPurchasing,
+                        isLoading: isPurchasing
+                    ) {
+                        Task { await purchasePackage(package) }
+                    }
+                }
*** End Patch
```

### 14. SettingsView.swift - カードベースレイアウト適用（NavigationStack統一）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
     var body: some View {
-        navigationContainer {
+        NavigationStack {
-            List {
+            ScrollView {
+                VStack(spacing: AppTheme.Spacing.md) {
                 // Subscription (復活)
-                Section(String(localized: "settings_subscription_title")) {
+                CardView {
+                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                        Text(String(localized: "settings_subscription_title"))
+                            .font(AppTheme.Typography.headlineDynamic)
+                            .foregroundStyle(AppTheme.Colors.label)
+                            .padding(.bottom, AppTheme.Spacing.xs)
+                        
                     Button {
                         showingManageSubscription = true
                     } label: {
-                        HStack {
-                            Text(String(localized: "settings_subscription_current_plan"))
-                            Spacer()
-                            Text(appState.subscriptionInfo.displayPlanName)
-                        }
+                        SectionRow.button(
+                            label: String(localized: "settings_subscription_current_plan"),
+                            title: appState.subscriptionInfo.displayPlanName,
+                            action: { showingManageSubscription = true }
+                        )
                     }
-                    .buttonStyle(.plain)
                     // SubscriptionInfoにmonthlyUsageCountとmonthlyUsageLimitが存在する場合のみ表示
                     if let used = appState.subscriptionInfo.monthlyUsageCount,
                        let limit = appState.subscriptionInfo.monthlyUsageLimit {
-                        HStack {
-                            Text(String(localized: "settings_subscription_usage"))
-                            Spacer()
-                            Text("\(used)/\(limit)")
-                        }
+                        SectionRow.text(
+                            label: String(localized: "settings_subscription_usage"),
+                            text: "\(used)/\(limit)"
+                        )
                     } else if appState.subscriptionInfo.plan != .free {
                         // Guideline 2.1対応: 無料プラン以外でUsage情報が未取得の場合、同期中であることを明示
-                        HStack {
-                            Text(String(localized: "settings_subscription_usage"))
-                            Spacer()
-                            Text(String(localized: "settings_subscription_usage_syncing"))
-                                .font(.footnote)
-                                .foregroundStyle(.secondary)
-                        }
+                        SectionRow(label: String(localized: "settings_subscription_usage")) {
+                            Text(String(localized: "settings_subscription_usage_syncing"))
+                                .font(.footnote)
+                                .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                        }
                     }
-                    Button(String(localized: "settings_subscription_manage")) {
-                        showingManageSubscription = true
-                    }
+                    SectionRow.button(
+                        label: String(localized: "settings_subscription_manage"),
+                        title: String(localized: "settings_subscription_manage"),
+                        action: { showingManageSubscription = true }
+                    )
+                    }
                 }
                 
                 // Personalization
-                Section(String(localized: "settings_personalization")) {
-                    HStack {
-                        Text(String(localized: "settings_name_label"))
-                            .font(.body)
-                        Spacer()
-                        TextField(String(localized: "settings_name_placeholder"), text: $displayName)
-                            .multilineTextAlignment(.trailing)
-                            .textInputAutocapitalization(.words)
-                            .autocorrectionDisabled()
-                    }
+                CardView {
+                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                        Text(String(localized: "settings_personalization"))
+                            .font(AppTheme.Typography.headlineDynamic)
+                            .foregroundStyle(AppTheme.Colors.label)
+                            .padding(.bottom, AppTheme.Spacing.xs)
+                        
+                    // Mobbinデザイン: セクション構造コンポーネントを使用
+                    SectionRow(label: String(localized: "settings_name_label")) {
+                        TextField(String(localized: "settings_name_placeholder"), text: $displayName)
+                            .multilineTextAlignment(.trailing)
+                            .textInputAutocapitalization(.words)
+                            .autocorrectionDisabled()
+                            .font(AppTheme.Typography.subheadlineDynamic)
+                            .foregroundStyle(AppTheme.Colors.label)
+                    }
                     Picker(String(localized: "settings_language_label"), selection: $preferredLanguage) {
                         Text(String(localized: "language_preference_ja")).tag(LanguagePreference.ja)
                         Text(String(localized: "language_preference_en")).tag(LanguagePreference.en)
                     }
+                    }
                 }
                 
                 // 理想の姿セクション（Phase 1に統合済み）
-                Section(String(localized: "settings_ideal_traits")) {
+                CardView {
+                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
+                        Text(String(localized: "settings_ideal_traits"))
+                            .font(AppTheme.Typography.headlineDynamic)
+                            .foregroundStyle(AppTheme.Colors.label)
+                            .padding(.bottom, AppTheme.Spacing.xs)
+                        
                     LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                         ForEach(idealTraitOptions, id: \.self) { trait in
                             idealTraitButton(trait: trait)
                         }
                     }
+                    }
                 }
                 
                 // Sign out
-                Section {
+                CardView {
                     Button(String(localized: "common_sign_out")) {
                         appState.signOutAndWipe()
                         dismiss()
                     }
+                    .foregroundStyle(AppTheme.Colors.label)
+                    .frame(maxWidth: .infinity, alignment: .leading)
                 }
                 
                 // Delete account
-                Section {
+                CardView {
                     Button(role: .destructive) {
                         isShowingDeleteAlert = true
                     } label: {
                         Text(String(localized: "settings_delete_account"))
                     }
+                    .frame(maxWidth: .infinity, alignment: .leading)
                 }
+                }
+                .padding(.horizontal, AppTheme.Spacing.lg)
+                .padding(.vertical, AppTheme.Spacing.md)
             }
             .navigationTitle(String(localized: "settings_title"))
             .navigationBarTitleDisplayMode(.inline)
+            .background(AppBackground())
@@
+    @ViewBuilder
+    private func idealTraitButton(trait: String) -> some View {
+        let isSelected = appState.userProfile.idealTraits.contains(trait)
+        
+        Button(action: {
+            var traits = appState.userProfile.idealTraits
+            if isSelected {
+                traits.removeAll { $0 == trait }
+            } else {
+                traits.append(trait)
+            }
+            appState.updateIdealTraits(traits)
+        }) {
+            Text(NSLocalizedString("ideal_trait_\(trait)", comment: ""))
+                .font(.subheadline)
+                .lineLimit(nil)
+                .fixedSize(horizontal: true, vertical: false)
+                .padding(.horizontal, 12)
+                .padding(.vertical, 8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+                .overlay(
+                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                        .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: isSelected ? 2 : 1)
+                )
+        }
+        .buttonStyle(.plain)
+    }
+    
+    // 注意: navigationContainer関数は削除（iOS 18ターゲットのためNavigationStackに統一）
*** End Patch
```

### 15. MainTabView.swift - 標準TabViewを維持（既存機能保護）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/MainTabView.swift
@@
 struct MainTabView: View {
     @EnvironmentObject private var appState: AppState
     
     var body: some View {
         TabView(selection: $appState.selectedRootTab) {
             TalkTabView()
                 .tabItem {
                     Label(String(localized: "tab_talk"), systemImage: "message")
                 }
                 .tag(AppState.RootTab.talk)
             
             HabitsTabView()
                 .tabItem {
                     Label(String(localized: "tab_habits"), systemImage: "list.bullet")
                 }
                 .tag(AppState.RootTab.habits)
         }
+        .background(AppBackground())
     }
 }
+
+*** End Patch
```

**重要**: 標準`TabView`を維持することで、以下の既存機能を保護します：
- スワイプジェスチャー（左右スワイプでタブ切り替え）
- アクセシビリティ機能（VoiceOver対応など）
- システム標準のアニメーション
- iPadでの分割表示対応

`CustomTabBar`は将来の拡張用として準備のみ（実際には使用しない）

### 15-2. HabitsTabView.swift - NavigationStack統一

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsTabView.swift
@@
 struct HabitsTabView: View {
     @EnvironmentObject private var appState: AppState
     @State private var showingSettings = false
     
     var body: some View {
-        navigationContainer {
+        NavigationStack {
             // HabitsSectionViewを表示（習慣セクションのコンポーネントを再利用）
             HabitsSectionView()
                 .navigationTitle(String(localized: "settings_habits"))
                 .toolbar {
                     ToolbarItem(placement: .navigationBarTrailing) {
                         Button(action: { showingSettings = true }) {
                             Image(systemName: "gearshape")
                         }
                     }
                 }
         }
         .sheet(isPresented: $showingSettings) {
             SettingsView() // Personalizationと理想の姿のみ
                 .environmentObject(appState)
         }
+        .background(AppBackground())
     }
-    
-    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
-    @ViewBuilder
-    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
-        if #available(iOS 16.0, *) {
-            NavigationStack {
-                content()
-            }
-        } else {
-            NavigationView {
-                content()
-            }
-        }
-    }
 }
+
+*** End Patch
```

### 15-3. HabitTrainingFocusStepView.swift - NavigationStack統一

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitTrainingFocusStepView.swift
@@
     var body: some View {
-        navigationContainer {
+        NavigationStack {
             Form {
                 // 上に「目標」入力フィールド（KOUJI.md仕様）
                 Section(String(localized: "habit_training_goal")) {
                     TextField(String(localized: "habit_training_goal_placeholder"), text: $trainingGoal)
                 }
                 
                 // 下に「トレーニングの種類を選択」（KOUJI.md仕様）
                 Section(String(localized: "habit_training_types")) {
                     ForEach(trainingFocusOptions) { option in
                         // トグルスイッチ形式（KOUJI.md仕様）
                         Toggle(isOn: Binding(
                             get: { selectedTrainingFocus == option.id },
                             set: { isOn in
                                 if isOn {
                                     // 一つのトグルをONにすると、他のトグルは自動的にOFFになる
                                     selectedTrainingFocus = option.id
                                 } else {
                                     // トグルをOFFにする場合は選択をクリア
                                     selectedTrainingFocus = ""
                                 }
                             }
                         )) {
                             VStack(alignment: .leading, spacing: 4) {
                                 Text(option.labelKey)
                                     .font(.body)
                                     .foregroundStyle(.primary)
                                 // 説明テキスト（Push-up/Coreは回数、Cardio/Stretchは時間）
                                 if option.id == "Push-up" || option.id == "Core" {
                                     Text(String(localized: "training_measure_reps"))
                                         .font(.caption)
                                         .foregroundStyle(.secondary)
                                 } else if option.id == "Cardio" || option.id == "Stretch" {
                                     Text(String(localized: "training_measure_time"))
                                         .font(.caption)
                                         .foregroundStyle(.secondary)
                                 }
                             }
                         }
                     }
                 }
             }
             .toolbar {
                 ToolbarItem(placement: .confirmationAction) {
                     Button(String(localized: "common_save")) {
                         save()
                     }
                     .disabled(selectedTrainingFocus.isEmpty || isSaving)
                 }
             }
             .onAppear {
                 // 既存の値を読み込む
                 trainingGoal = appState.userProfile.trainingGoal
                 selectedTrainingFocus = appState.userProfile.trainingFocus.first ?? ""
             }
+            .background(AppBackground())
         }
     }
-    
-    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
-    @ViewBuilder
-    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
-        if #available(iOS 16.0, *) {
-            NavigationStack {
-                content()
-            }
-        } else {
-            NavigationView {
-                content()
-            }
-        }
-    }
 
     private func save() {
         guard !selectedTrainingFocus.isEmpty, !isSaving else { return }
         isSaving = true
         Task {
             appState.updateTrainingGoal(trainingGoal)
             appState.updateTrainingFocus([selectedTrainingFocus])
             await MainActor.run {
                 isSaving = false
                 next()
             }
         }
     }
 }
+
+*** End Patch
```

### 15-4. HabitFollowUpView.swift - NavigationStack統一

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Settings/HabitFollowUpView.swift
@@
     var body: some View {
-        navigationContainer {
+        NavigationStack {
             Group {
                 switch habit {
                 case .wake:
                     HabitWakeFollowUpView(onRegisterSave: { action in
                         self.childSaveAction = action
                     })
                 case .bedtime:
                     HabitSleepFollowUpView(onRegisterSave: { action in
                         self.childSaveAction = action
                     })
                 case .training:
                     HabitTrainingFollowUpView(onRegisterSave: { action in
                         self.childSaveAction = action
                     })
                 case .custom:
                     EmptyView()
                 }
             }
             .navigationTitle(habit.title)
             .navigationBarTitleDisplayMode(.inline)
             .toolbar {
                 ToolbarItem(placement: .cancellationAction) {
                     Button(String(localized: "common_cancel")) {
                         dismiss()
                     }
                 }
                 ToolbarItem(placement: .confirmationAction) {
                     Button(String(localized: "common_save")) {
                         save()
                     }
                 }
             }
+            .background(AppBackground())
         }
     }
-    
-    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
-    @ViewBuilder
-    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
-        if #available(iOS 16.0, *) {
-            NavigationStack {
-                content()
-            }
-        } else {
-            NavigationView {
-                content()
-            }
-        }
-    }
 
     private func save() {
         childSaveAction?()
         dismiss()
     }
 }
+
+*** End Patch
```

### 16. HabitsSectionView.swift - カードベースレイアウト適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
     var body: some View {
-        List {
+        ScrollView {
+            VStack(spacing: AppTheme.Spacing.md) {
             Section(String(localized: "settings_habits")) {
                 // 全習慣を時系列順に表示（時刻設定済み）
                 ForEach(sortedAllHabits, id: \.id) { item in
                     if let habit = item.habit {
-                        habitRow(for: habit, time: item.time)
+                        CardView {
+                            habitRow(for: habit, time: item.time)
+                        }
                     } else if let customId = item.customId {
-                        customHabitRow(id: customId, name: item.name, time: item.time)
-                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                                Button(role: .destructive) {
-                                    appState.removeCustomHabit(id: customId)
-                                } label: {
-                                    Label(String(localized: "common_delete"), systemImage: "trash")
-                                }
-                            }
+                        CardView {
+                            customHabitRow(id: customId, name: item.name, time: item.time)
+                                .contextMenu {
+                                    Button(role: .destructive, action: {
+                                        appState.removeCustomHabit(id: customId)
+                                    }) {
+                                        Label(String(localized: "common_delete"), systemImage: "trash")
+                                    }
+                                }
+                        }
                     }
                 }
                 
                 // 時間未設定のデフォルト習慣
                 ForEach(inactiveDefaultHabits, id: \.self) { habit in
-                    habitRow(for: habit, time: nil)
+                    CardView {
+                        habitRow(for: habit, time: nil)
+                    }
                 }
                 
                 // 時間未設定のカスタム習慣
                 ForEach(inactiveCustomHabits, id: \.id) { habit in
-                    customHabitRow(id: habit.id, name: habit.name, time: nil)
-                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-                            Button(role: .destructive) {
-                                appState.removeCustomHabit(id: habit.id)
-                            } label: {
-                                Label(String(localized: "common_delete"), systemImage: "trash")
-                            }
-                        }
+                    CardView {
+                        customHabitRow(id: habit.id, name: habit.name, time: nil)
+                            .contextMenu {
+                                Button(role: .destructive, action: {
+                                    appState.removeCustomHabit(id: habit.id)
+                                }) {
+                                    Label(String(localized: "common_delete"), systemImage: "trash")
+                                }
+                            }
+                    }
                 }
                 
                 // 「習慣を追加」ボタン
-                Button(action: { activeSheet = .addCustom }) {
-                    HStack {
-                        Image(systemName: "plus.circle.fill")
-                        Text(String(localized: "habit_add_custom"))
-                    }
+                CardView {
+                    Button(action: { activeSheet = .addCustom }) {
+                        HStack {
+                            Image(systemName: "plus.circle.fill")
+                            Text(String(localized: "habit_add_custom"))
+                        }
+                        .foregroundStyle(AppTheme.Colors.accent)
+                        .frame(maxWidth: .infinity, alignment: .leading)
+                    }
                 }
             }
+            }
+            .padding(.horizontal, AppTheme.Spacing.lg)
+            .padding(.vertical, AppTheme.Spacing.md)
         }
+        .background(AppBackground())
*** End Patch
```

### 16-2. HabitsSectionView.swift - habitRow/customHabitRowのスタイル更新

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsSectionView.swift
@@
     @ViewBuilder
     private func habitRow(for habit: HabitType, time: DateComponents?) -> some View {
         let isActive = activeHabits.contains(habit)
         let date = time.flatMap { Calendar.current.date(from: $0) }
         
         HStack {
             // 左側ラベル領域のみタップ可能にして、トグル操作時にシートが開かないようにする
             VStack(alignment: .leading, spacing: 8) {
                 Text(habit.title)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
             }
             .frame(maxWidth: .infinity, alignment: .leading)
             .contentShape(Rectangle())
             .onTapGesture {
                 if isActive {
                     activeSheet = .editor(habit)
                 } else {
                     sheetTime = date ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                     activeSheet = .habit(habit)
                 }
             }
             
             Spacer()
             
             if isActive, let date = date {
                 Text(date.formatted(.dateTime.hour().minute()))
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
+                    .font(AppTheme.Typography.subheadlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
             }
             
             Toggle("", isOn: Binding(
                 get: { isActive },
                 set: { isOn in
                     if isOn {
                         if let date = date {
                             activeHabits.insert(habit)
                             habitTimes[habit] = date
                         } else {
                             // 時刻未設定なら即シート表示（Saveで確定、CancelでOFFへ戻す）
                             sheetTime = Calendar.current.date(from: habit.defaultTime) ?? Date()
                             activeSheet = .habit(habit)
                             // 一時的にON表示しない（Cancel時にOFFに戻すため）
                         }
                     } else {
                         activeHabits.remove(habit)
                     }
                 }
             ))
             .labelsHidden()
         }
-        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
-            Button(role: .destructive) {
-                // デフォルト習慣の削除＝スケジュールのクリア
-                appState.removeHabitSchedule(habit)
-                activeHabits.remove(habit)
-                habitTimes.removeValue(forKey: habit)
-            } label: {
-                Label(String(localized: "common_delete"), systemImage: "trash")
-            }
-        }
+        .contextMenu {
+            Button(role: .destructive, action: {
+                // デフォルト習慣の削除＝スケジュールのクリア
+                appState.removeHabitSchedule(habit)
+                activeHabits.remove(habit)
+                habitTimes.removeValue(forKey: habit)
+            }) {
+                Label(String(localized: "common_delete"), systemImage: "trash")
+            }
+        }
     }
     
     @ViewBuilder
     private func customHabitRow(id: UUID, name: String, time: DateComponents?) -> some View {
         let isActive = activeCustomHabits.contains(id)
         let date = time.flatMap { Calendar.current.date(from: $0) }
         
         HStack {
             VStack(alignment: .leading, spacing: 8) {
                 Text(name)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
             }
             .frame(maxWidth: .infinity, alignment: .leading)
             .contentShape(Rectangle())
             .onTapGesture {
                 if isActive {
                     activeSheet = .customEditor(id)
                 } else {
                     // 時刻未設定時も時刻選択シートを表示
                     sheetTime = date ?? Date()
                     activeSheet = .custom(id)
                 }
             }
             
             Spacer()
             
             if isActive, let date = date {
                 Text(date.formatted(.dateTime.hour().minute()))
-                    .font(.subheadline)
-                    .foregroundStyle(.secondary)
+                    .font(AppTheme.Typography.subheadlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
             }
             
             Toggle("", isOn: Binding(
                 get: { isActive },
                 set: { isOn in
                     if isOn {
                         if let date = date {
                             activeCustomHabits.insert(id)
                             customHabitTimes[id] = date
                         } else {
                             sheetTime = Date()
                             activeSheet = .custom(id)
                             // 一時的にON表示しない（Cancel時にOFFに戻すため）
                         }
                     } else {
                         activeCustomHabits.remove(id)
                     }
                 }
             ))
             .labelsHidden()
         }
     }
*** End Patch
```

### 17. HabitsTabView.swift - 背景適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsTabView.swift
@@
         }
         .sheet(isPresented: $showingSettings) {
             SettingsView() // Personalizationと理想の姿のみ
                 .environmentObject(appState)
         }
+        .background(AppBackground())
     }
*** End Patch
```

### 18. AuthRequiredPlaceholderView.swift - 背景適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Session/AuthRequiredPlaceholderView.swift
@@
         }
         .frame(maxWidth: .infinity, maxHeight: .infinity)
+        .background(AppBackground())
     }
 }
*** End Patch
```

---

## まとめ

上記のパッチで以下を反映します：

1. **オンボーディング画面**: HabitWakeLocation、HabitSleepLocation、HabitTrainingFocusのタイトル/背景/CTAを統一
2. **ManageSubscriptionSheet**: NavigationStack化と背景適用、PrimaryButton化
3. **SettingsView**: カードベースレイアウト適用、SectionRow使用、idealTraitButtonのスタイル更新、**navigationContainer関数を削除してNavigationStackに統一**
4. **SessionView**: NavigationStack統一、PrimaryButton適用、**navigationContainer関数を削除**
5. **MainTabView**: **標準TabViewを維持**（スワイプジェスチャーやアクセシビリティ機能を保持）、背景のみ追加
6. **HabitsTabView**: NavigationStack統一、背景適用、**navigationContainer関数を削除**
7. **HabitTrainingFocusStepView**: NavigationStack統一、背景適用、**navigationContainer関数を削除**
8. **HabitFollowUpView**: NavigationStack統一、背景適用、**navigationContainer関数を削除**
9. **HabitsSectionView**: カードベースレイアウト適用、habitRow/customHabitRowのスタイル更新
10. **AuthRequiredPlaceholderView**: 背景適用

## 重要な修正点

### 1. navigationContainerの統一
- **問題**: 複数ファイルで個別に`navigationContainer`関数が定義されていた
- **対応**: iOS 18ターゲットのため、すべて`NavigationStack`を直接使用するように統一
- **影響ファイル**: 
  - `SettingsView.swift`（パッチ15-1で修正済み）
  - `SessionView.swift`（パッチ11で修正済み、11-2で関数削除）
  - `HabitsTabView.swift`（パッチ15-2で修正済み）
  - `HabitTrainingFocusStepView.swift`（パッチ15-3で修正済み）
  - `HabitFollowUpView.swift`（パッチ15-4で修正済み）

### 2. SectionRow.buttonのラベル二重表示防止
- **問題**: `SectionRow.button`で`label`と`title`が二重に表示される可能性があった
- **対応**: アクセシビリティラベルを追加し、`label`は左側、`title`は右側に明確に分離
- **影響ファイル**: `SectionRow.swift`

### 3. CustomTabBarによる標準TabViewの喪失
- **問題**: カスタムタブバーを使用すると標準`TabView`の機能（スワイプジェスチャー、アクセシビリティ）が失われる
- **対応**: **標準`TabView`を維持**し、`CustomTabBar`は将来の拡張用として準備のみ（実際には使用しない）
- **影響ファイル**: `MainTabView.swift`（パッチでは標準TabViewを維持、背景のみ追加）

これで、Mobbinデザインの要素を完全に反映し、かつ標準iOS機能を維持した完全版の計画書になります。