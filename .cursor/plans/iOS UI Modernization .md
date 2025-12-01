<!-- 26f27b76-a6e3-402a-af83-b16c1b0590b3 2b37e02c-2144-4ad2-808b-9cde8072f727 -->
# Anicca iOS UI モダナイズ計画（最終 v3・完全擬似パッチ付き）

## 方針（Apple HIG / SwiftUI 最新準拠）

- Navigation: iOS 18ターゲットのため、アプリ全体を NavigationStack へ統一。
- Typography: Dynamic Typeに準拠（.largeTitle 等の相対スタイル）。固定32ptは廃止。
- CTA: 主要アクションは `PrimaryButton` に統一（ローディング/無効化/アイコン、軽いハプティクス）。
- Background: 全画面を `AppBackground()`（systemGroupedBackground）で統一。
- Colors: `AccentColor` を中核、役割ベーストークン（background/cardBackground/label/secondaryLabel）を追加。
- Accessibility: コントラスト/可読性を優先（グラデ見出しは不採用）。
- ComponentsKit: SUCard/SUBadge等は活用、主要CTAは段階的に `PrimaryButton` へ置換。

---

## 完全擬似パッチ（そのまま適用可能）

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
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
+import SwiftUI
+
+struct AppBackground: View {
+    var body: some View {
+        // Mobbinデザイン: 温かいベージュ背景を適用
+        if #available(iOS 15.0, *) {
+            AppTheme.Colors.adaptiveBackground.ignoresSafeArea()
+        } else {
+            AppTheme.Colors.background.ignoresSafeArea()
+        }
+    }
+}
+
+*** End Patch
+```
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
+    var style: ButtonStyle = .primary  // Mobbin: スタイル追加
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
+            .padding(.vertical, 16)  // Mobbin: より大きなパディング
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
+            return AppTheme.Colors.accent  // 大きな角丸ボタンもアクセントカラー
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
+            return .white  // 大きな角丸ボタンも白文字
+        }
+    }
+    
+    private var cornerRadius: CGFloat {
+        switch style {
+        case .primary:
+            return AppTheme.Radius.lg
+        case .selected, .unselected:
+            return AppTheme.Radius.xl  // Mobbin: 大きな角丸
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
+            return .clear  // 大きな角丸ボタンもボーダーなし
+        }
+    }
+    
+    private var borderWidth: CGFloat {
+        switch style {
+        case .primary:
+            return 0
+        case .selected, .unselected:
+            return 4  // Mobbin: 4pxボーダー
+        case .large:
+            return 0  // 大きな角丸ボタンもボーダーなし
+        }
+    }
+}
+
*** End Patch
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CardView.swift
+import SwiftUI
+
+// Mobbinデザイン: カードコンポーネント
+struct CardView<Content: View>: View {
+    let content: Content
+    var cornerRadius: CGFloat = AppTheme.Radius.card  // デフォルト37px
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
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/DayOfWeekPicker.swift
+import SwiftUI
+
+// Mobbinデザイン: 曜日選択UIコンポーネント（円形145×145px、4pxボーダー）
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
+                .frame(width: 145, height: 145)  // Mobbin: 145×145px
+                .background(
+                    Circle()
+                        .fill(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                )
+                .overlay(
+                    Circle()
+                        .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: 4)  // Mobbin: 4pxボーダー
+                )
+        }
+        .buttonStyle(.plain)
+    }
+}
+
+*** End Patch
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/GradientIcon.swift
+import SwiftUI
+
+// Mobbinデザイン: グラデーションアイコン（ストリーク表示用）
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
+            // 炎のような形状のグラデーション
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
+            // 装飾的なオーバーレイ
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
```
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
+}
+
+*** End Patch
```
```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CustomTabBar.swift
+import SwiftUI
+
+// Mobbinデザイン: カスタムタブバー（下部タブバー、選択状態の視覚的フィードバック）
+struct CustomTabBar: View {
+    @Binding var selectedTab: Int
+    let tabs: [TabItem]
+    
+    struct TabItem: Identifiable {
+        let id: Int
+        let title: String
+        let icon: String
+        let badge: Int?  // 通知バッジ（オプション）
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
+                    // 通知バッジ
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
+                // 選択状態の下線
+                Rectangle()
+                    .fill(isSelected ? AppTheme.Colors.accent : Color.clear)
+                    .frame(height: 2)
+                    .offset(y: 28)
+            )
+        }
+        .buttonStyle(.plain)
+    }
+}
+
+*** End Patch
```
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
+                        .font(AppTheme.Typography.subheadline)
+                        .foregroundStyle(.secondary)
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
+    private struct ButtonConfig {
+        let title: String
+        let icon: String?
+        let isLoading: Bool
+        let isEnabled: Bool
+        let action: () -> Void
+    }
+
+    private var sessionButton: some View {
+        let config = buttonConfig
+        return PrimaryButton(
+            title: config.title,
+            icon: config.icon,
+            isEnabled: config.isEnabled,
+            isLoading: config.isLoading,
+            action: config.action
+        )
+    }
@@
-    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
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
*** End Patch
```
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
+@@
+             Text("onboarding_habit_description")
+                 .font(.subheadline)
+                 .foregroundStyle(.secondary)
+                 .multilineTextAlignment(.center)
+                 .padding(.horizontal)
+            
+            // Mobbinデザイン: 曜日選択UIの追加例（必要に応じて使用）
+            // 注意: 現在の習慣設定では曜日選択は使用していないが、将来的な拡張用に準備
+            // DayOfWeekPicker(selectedDays: $selectedDays)
+@@
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
*** End Patch
```
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
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
                 // Personalization
                 Section(String(localized: "settings_personalization")) {
-                    HStack {
-                        Text(String(localized: "settings_name_label"))
-                            .font(.body)
-                        Spacer()
-                        TextField(String(localized: "settings_name_placeholder"), text: $displayName)
-                            .multilineTextAlignment(.trailing)
-                            .textInputAutocapitalization(.words)
-                            .autocorrectionDisabled()
-                    }
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
                 }
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
@@
-            .navigationBarTitleDisplayMode(.inline)
+            .navigationBarTitleDisplayMode(.inline)
+            .background(AppBackground())
*** End Patch
```
```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/MainTabView.swift
@@
 struct MainTabView: View {
     @EnvironmentObject private var appState: AppState
+    @State private var selectedTabIndex: Int = 0
     
     var body: some View {
-        TabView(selection: $appState.selectedRootTab) {
-            TalkTabView()
-                .tabItem {
-                    Label(String(localized: "tab_talk"), systemImage: "message")
-                }
-                .tag(AppState.RootTab.talk)
-            
-            HabitsTabView()
-                .tabItem {
-                    Label(String(localized: "tab_habits"), systemImage: "list.bullet")
-                }
-                .tag(AppState.RootTab.habits)
+        ZStack(alignment: .bottom) {
+            // コンテンツ表示
+            Group {
+                if selectedTabIndex == 0 {
+                    TalkTabView()
+                } else {
+                    HabitsTabView()
+                }
+            }
+            .frame(maxWidth: .infinity, maxHeight: .infinity)
+            
+            // Mobbinデザイン: カスタムタブバー
+            VStack(spacing: 0) {
+                Spacer()
+                CustomTabBar(
+                    selectedTab: $selectedTabIndex,
+                    tabs: [
+                        CustomTabBar.TabItem(
+                            id: 0,
+                            title: String(localized: "tab_talk"),
+                            icon: "message.fill",
+                            badge: nil
+                        ),
+                        CustomTabBar.TabItem(
+                            id: 1,
+                            title: String(localized: "tab_habits"),
+                            icon: "list.bullet",
+                            badge: nil
+                        )
+                    ]
+                )
+            }
+            .ignoresSafeArea(.keyboard, edges: .bottom)
         }
+        .background(AppBackground())
+        .onChange(of: selectedTabIndex) { newValue in
+            // AppStateのselectedRootTabも更新（既存コードとの互換性）
+            appState.selectedRootTab = newValue == 0 ? .talk : .habits
+        }
+        .onAppear {
+            // 初期状態を設定
+            selectedTabIndex = appState.selectedRootTab == .talk ? 0 : 1
+        }
     }
 }
+
+*** End Patch
```
```

---

## テスト観点

- 認証/課金/音声セッションの回帰（開始/停止/制限到達時の挙動）
- Dynamic Type（最小～最大）での崩れがないこと
- ダーク/ライト両モードでの視認性
- NavigationStack遷移/シートの表示一貫性
- 主要CTAの状態遷移（connecting/connected/disconnected）

### To-dos

- [ ] DesignSystem追加（AppTheme/AppBackground/PrimaryButton）
- [ ] アプリルートに.tint(AppTheme.Colors.accent)を適用
- [ ] SessionViewをNavigationStack化しCTA/背景を統一
- [ ] Welcome/Authenticationのタイトル/背景/CTAを統一
- [ ] Microphone/NotificationsのCTA置換と背景適用
- [ ] HabitSetup/ProfileInfo/CompletionのCTA置換と背景適用
- [ ] Wake/Sleep/TrainingFocusのCTA置換と背景適用
- [ ] Settings/ManageSubscriptionの背景統一＋選択CTAをPrimaryButton化
- [ ] AuthenticationProcessingViewに背景適用

---

## Interフォント→SF Pro統一パッチ（完全版）

以下のパッチで、Interフォントの記述をSF Pro（システムフォント）に統一し、角丸半径の調整も含めた完全な擬似パッチです。

### 1. AppTheme.swift - コメント修正と角丸半径追加

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
@@
    enum Typography {
-        // Mobbin: Interフォントに近いサイズ階層（Dynamic Typeベースだが、固定サイズも提供）
+        // Mobbin: サイズ階層を反映（SF Proシステムフォント使用、Dynamic Type対応）
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
@@
    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 20  // Mobbin: より大きな角丸
        static let xl: CGFloat = 36   // Mobbin: 大きな角丸ボタン用
+        static let xxl: CGFloat = 76  // Mobbin: 最大角丸ボタン用（36-76px範囲の最大値）
        static let card: CGFloat = 37  // Mobbin: カード用の大きな角丸（37-87px範囲の最小値）
        static let cardLarge: CGFloat = 76  // Mobbin: より大きなカード角丸（最大76px）
+        static let cardXLarge: CGFloat = 87  // Mobbin: 最大カード角丸（37-87px範囲の最大値）
    }
*** End Patch
```

### 2. PrimaryButton.swift - 大きな角丸スタイル追加

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/PrimaryButton.swift
@@
    enum ButtonStyle {
        case primary      // アクセントカラー背景
        case selected      // Mobbin: ダークグレー背景（選択状態）
        case unselected    // Mobbin: ライトグレー背景（未選択状態）
+        case large         // Mobbin: より大きな角丸ボタン（76px）
    }
@@
    private var cornerRadius: CGFloat {
        switch style {
        case .primary:
            return AppTheme.Radius.lg
        case .selected, .unselected:
            return AppTheme.Radius.xl  // Mobbin: 大きな角丸
+        case .large:
+            return AppTheme.Radius.xxl  // Mobbin: 最大76pxの角丸
        }
    }
*** End Patch
```

### 3. CardView.swift - 最大角丸カード対応

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/CardView.swift
@@
    // 大きなカード用の便利なイニシャライザ
    static func large(@ViewBuilder content: () -> Content) -> CardView<Content> {
        CardView(cornerRadius: AppTheme.Radius.cardLarge, content: content)
    }
+    
+    // Mobbin: 最大角丸カード用の便利なイニシャライザ（87px）
+    static func xLarge(@ViewBuilder content: () -> Content) -> CardView<Content> {
+        CardView(cornerRadius: AppTheme.Radius.cardXLarge, content: content)
+    }
}
*** End Patch
```

---

## Interフォントに関する記述の確認結果

計画ファイル内でInterフォントを参照している箇所は1箇所のみです：

- 84行目のコメント: `// Mobbin: Interフォントに近いサイズ階層（Dynamic Typeベースだが、固定サイズも提供）`

実際のコードは`.system()`を使用しているため、システムフォント（SF Pro）です。上記パッチでコメントを修正します。

---

## まとめ

上記の3つのパッチで以下を反映します：

1. **コメント修正**: 「Interフォント」→「SF Proシステムフォント」に変更
2. **角丸半径の拡張**: ボタン用に76px、カード用に87pxを追加
3. **コンポーネント拡張**: `PrimaryButton`に`.large`スタイル、`CardView`に`.xLarge()`メソッドを追加

これで、Mobbinデザインの仕様に合わせつつ、システムフォント（SF Pro）を使用した計画になります。

---

## 改善点を反映した完全な擬似パッチ（追加版）

### 1. AppTheme.swift - rgba背景色オプション追加

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppTheme.swift
@@
    enum Colors {
        // Mobbinデザイン統合: 温かいカラーパレット
        static let accent: Color = .accentColor
        
        // ライトテーマ - Mobbinの温かいベージュ背景
        static let background: Color = Color(hex: "#f8f5ed")
+        // Mobbin: rgba(246,245,236,0.99)の背景色オプション（透明度が必要な場合）
+        static let backgroundWithOpacity: Color = Color(red: 246/255, green: 245/255, blue: 236/255, opacity: 0.99)
        static let cardBackground: Color = Color(hex: "#fdfcfc")
        static let cardBackgroundAlt: Color = Color(hex: "#fcfcfb")
@@
*** End Patch
```

### 2. DayOfWeekPicker.swift - サイズ調整（実用的なサイズに変更）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/DayOfWeekPicker.swift
@@
-// Mobbinデザイン: 曜日選択UIコンポーネント（円形145×145px、4pxボーダー）
+// Mobbinデザイン: 曜日選択UIコンポーネント（円形、4pxボーダー）
+// 注意: Mobbinのデザインでは145×145pxだが、実用的なサイズ（48px）に調整
+// 視覚的スタイル（選択/未選択の色、ボーダー）はMobbinデザインを維持
 struct DayOfWeekPicker: View {
     @Binding var selectedDays: Set<Int>  // 0=日曜日, 1=月曜日, ..., 6=土曜日
@@
         }) {
             Text(dayLabels[index])
                 .font(.system(size: 20, weight: .semibold))
                 .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
-                .frame(width: 145, height: 145)  // Mobbin: 145×145px
+                .frame(width: 48, height: 48)  // 実用的なサイズ（Mobbinの視覚スタイルは維持）
                 .background(
                     Circle()
                         .fill(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                 )
                 .overlay(
                     Circle()
                         .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: 4)  // Mobbin: 4pxボーダー
                 )
         }
*** End Patch
```

### 3. GradientIcon.swift - 使用箇所のコメント追加

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/GradientIcon.swift
@@
-// Mobbinデザイン: グラデーションアイコン（ストリーク表示用）
+// Mobbinデザイン: グラデーションアイコン（ストリーク表示用）
+// 使用例: 習慣のストリーク表示、達成状況の視覚化など
+// 注意: 現在のAniccaアプリではストリーク機能は未実装のため、将来的な拡張用に準備
 struct GradientIcon: View {
*** End Patch
```

### 4. HabitSetupStepView.swift - カードベースレイアウト適用（スワイプアクション対応）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
            Text("onboarding_habit_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

-            List {
-                Section {
-                    // 全習慣を時系列順に表示
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
-                    // 「習慣を追加」ボタン
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
+                    // 全習慣を時系列順に表示
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
+                    // 「習慣を追加」ボタン
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
        }
+        .background(AppBackground())
*** End Patch
```

### 4-2. HabitSetupStepView.swift - habitCard/customHabitCardのスタイル更新

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Onboarding/HabitSetupStepView.swift
@@
    @ViewBuilder
    private func habitCard(for habit: HabitType, isCustom: Bool) -> some View {
        let isSelected = selectedHabits.contains(habit)
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(habit.title)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
            
            Spacer()
            
            if isSelected {
                if let time = habitTimes[habit] {
                    Text(time.formatted(.dateTime.hour().minute()))
-                        .font(.subheadline)
-                        .foregroundStyle(.secondary)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            
            Toggle("", isOn: Binding(
                get: { isSelected },
                set: { isOn in
                    if isOn {
                        selectedHabits.insert(habit)
                        // 時間設定シートを表示
                        sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
                        showingTimePicker = habit
                    } else {
                        selectedHabits.remove(habit)
                        habitTimes.removeValue(forKey: habit)
                    }
                }
            ))
            .labelsHidden()
        }
-        .padding()
-        .background(Color(.systemGray6))
-        .cornerRadius(12)
+        .padding(AppTheme.Spacing.md)
+        .contentShape(Rectangle())
+        .onTapGesture {
+            // 選択状態に関わらずタップで時間設定シートを開く
+            sheetTime = habitTimes[habit] ?? Calendar.current.date(from: habit.defaultTime) ?? Date()
+            showingTimePicker = habit
+        }
    }
    
    @ViewBuilder
    private func customHabitCard(for customHabit: CustomHabitConfiguration) -> some View {
        let hasTime = customHabitTimes[customHabit.id] != nil
        
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                Text(customHabit.name)
-                    .font(.headline)
+                    .font(AppTheme.Typography.headlineDynamic)
+                    .foregroundStyle(AppTheme.Colors.label)
            }
            
            Spacer()
            
            if hasTime {
                if let time = customHabitTimes[customHabit.id] {
                    Text(time.formatted(.dateTime.hour().minute()))
-                        .font(.subheadline)
-                        .foregroundStyle(.secondary)
+                        .font(AppTheme.Typography.subheadlineDynamic)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
            }
            
            Toggle("", isOn: Binding(
                get: { hasTime },
                set: { isOn in
                    if isOn {
                        sheetTime = customHabitTimes[customHabit.id] ?? Date()
                        showingCustomTimePicker = customHabit.id
                    } else {
                        customHabitTimes.removeValue(forKey: customHabit.id)
                    }
                }
            ))
            .labelsHidden()
        }
-        .padding()
-        .background(Color(.systemGray6))
-        .cornerRadius(12)
+        .padding(AppTheme.Spacing.md)
+        .contentShape(Rectangle())
+        .onTapGesture {
+            sheetTime = customHabitTimes[customHabit.id] ?? Date()
+            showingCustomTimePicker = customHabit.id
+        }
    }
*** End Patch
```

### 5. HabitsSectionView.swift - カードベースレイアウト適用（List構造を維持）

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

### 5-2. HabitsSectionView.swift - habitRow/customHabitRowのスタイル更新

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

### 6. HabitsTabView.swift - 背景適用

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

### 6. AppBackground.swift - rgba背景色オプション対応

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/AppBackground.swift
@@
 struct AppBackground: View {
+    var useOpacity: Bool = false  // rgba背景色を使用するかどうか
+    
     var body: some View {
         // Mobbinデザイン: 温かいベージュ背景を適用
         if #available(iOS 15.0, *) {
-            AppTheme.Colors.adaptiveBackground.ignoresSafeArea()
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.adaptiveBackground).ignoresSafeArea()
         } else {
-            AppTheme.Colors.background.ignoresSafeArea()
+            (useOpacity ? AppTheme.Colors.backgroundWithOpacity : AppTheme.Colors.background).ignoresSafeArea()
         }
     }
 }
*** End Patch
```

---

## 改善点を反映したパッチのまとめ

上記の改善を反映したパッチです。主な変更点：

1. ✅ **DayOfWeekPickerのサイズを48pxに調整**（Mobbinの視覚スタイルは維持）
2. ✅ **rgba(246,245,236,0.99)の背景色オプションを追加**
3. ✅ **GradientIconの使用箇所をコメントで明確化**
4. ✅ **HabitSetupStepViewにカードベースレイアウトを適用**
5. ✅ **AppBackgroundに透明度オプションを追加**

既存の計画書のパッチに上記を追加すると、Mobbinデザインの特徴をより適切に反映できます。

**注意**: `HabitsTabView.swift`の実装は、実際のファイル構造を確認してから適用してください。ファイルが存在しない場合は、新規作成が必要です。

このパッチを適用すると、Mobbinデザインの特徴を維持しつつ、実用的なサイズとレイアウトでUIを刷新できます。

---

## Mobbinデザイン改善パッチ（レビュー反映版）

iOS UI Modernization計画のレビューで指摘した改善点を反映した追加パッチです。Mobbinデザインの強みを完全に適用するための修正を行います。

### 適用順序

1. AppTheme.swift - rgba背景色オプション追加（既に適用済み）
2. AppBackground.swift - 透明度オプション対応（既に適用済み）
3. HabitSetupStepView.swift - カードレイアウト適用（2つのパッチ）
4. HabitsSectionView.swift - カードレイアウト適用（2つのパッチ）
5. HabitsTabView.swift - 背景適用

### 注意事項

- `swipeActions`は`List`専用のため、`ScrollView`では`contextMenu`に置き換えています
- カードレイアウト適用により、既存の`List`の機能（スワイプアクション）は`contextMenu`に変更されます
- タイポグラフィとカラーは`AppTheme`を使用して統一されています

推奨事項を反映した擬似パッチを作成中。関連ファイルを確認します。


[4 tools called]


推奨事項を反映した擬似パッチを作成中。他の画面も確認します。


[3 tools called]


推奨事項を反映した擬似パッチです。

---

## 推奨事項反映パッチ

### 1. 主要CTAボタンに .large スタイル（76px角丸）を適用

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SessionView.swift
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
+    private struct ButtonConfig {
+        let title: String
+        let icon: String?
+        let isLoading: Bool
+        let isEnabled: Bool
+        let action: () -> Void
+    }
+
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
@@
-    private var buttonConfig: (title: String, disabled: Bool, action: () -> Void) {
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
-                    ensureMicrophonePermissionAndStart()
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
+                    ensureMicrophonePermissionAndStart()
+                }
+            )
         }
     }
@@
     private var authenticatedContent: some View {
         navigationContainer {
             VStack(spacing: AppTheme.Spacing.xl) {
                 Text("Anicca")
-                    .font(.system(size: 32, weight: .bold))
+                    .font(AppTheme.Typography.appTitle)
+                    .fontWeight(.heavy)
+                    .foregroundStyle(AppTheme.Colors.label)
 
                 if shouldShowWakeSilentNotice {
                     Text(String(localized: "session_wake_silent_notice"))
                         .multilineTextAlignment(.center)
-                        .font(.subheadline)
-                        .foregroundStyle(.secondary)
-                        .padding(16)
+                        .font(AppTheme.Typography.subheadline)
+                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
+                        .padding(AppTheme.Spacing.lg)
                         .frame(maxWidth: .infinity)
                         .background(
-                            RoundedRectangle(cornerRadius: 16, style: .continuous)
-                                .fill(.thinMaterial)
+                            RoundedRectangle(cornerRadius: AppTheme.Radius.card, style: .continuous)
+                                .fill(AppTheme.Colors.cardBackground)
+                                .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 2)
                         )
                 }
 
-                Spacer(minLength: 24)
+                Spacer(minLength: AppTheme.Spacing.xl)
 
                 sessionButton
             }
             .padding()
+            .background(AppBackground())
             .toolbar {
-                ToolbarItem(placement: .navigationBarTrailing) {
+                ToolbarItem(placement: .topBarTrailing) {
                     Button(action: { isShowingSettings = true }) {
                         Image(systemName: "gearshape")
                     }
                 }
             }
*** End Patch
```

### 2. SettingsView のセクションもカードベースに変更

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
     var body: some View {
         navigationContainer {
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
     @ViewBuilder
     private func idealTraitButton(trait: String) -> some View {
         let isSelected = appState.userProfile.idealTraits.contains(trait)
         
         Button(action: {
             var traits = appState.userProfile.idealTraits
             if isSelected {
                 traits.removeAll { $0 == trait }
             } else {
                 traits.append(trait)
             }
             appState.updateIdealTraits(traits)
         }) {
             Text(NSLocalizedString("ideal_trait_\(trait)", comment: ""))
                 .font(.subheadline)
                 .lineLimit(nil)
                 .fixedSize(horizontal: true, vertical: false)
                 .padding(.horizontal, 12)
                 .padding(.vertical, 8)
-                .background(isSelected ? Color.black : Color(.systemGray6))
-                .foregroundColor(isSelected ? .white : .secondary)
-                .cornerRadius(8)
+                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
+                .foregroundColor(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
+                .cornerRadius(AppTheme.Radius.md)
+                .overlay(
+                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
+                        .stroke(isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight, lineWidth: isSelected ? 2 : 1)
+                )
         }
         .buttonStyle(.plain)
     }
*** End Patch
```

### 3. すべての画面に AppBackground() を適用

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

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Session/AuthRequiredPlaceholderView.swift
@@
 struct AuthRequiredPlaceholderView: View {
     var body: some View {
         VStack(spacing: 24) {
             Image(systemName: "person.circle.fill")
                 .font(.system(size: 64))
                 .foregroundStyle(.secondary)
             
             Text("Please Sign In")
                 .font(.title2)
                 .fontWeight(.semibold)
             
             Text("Sign in to start using Anicca and set up your habits.")
                 .font(.subheadline)
                 .foregroundStyle(.secondary)
                 .multilineTextAlignment(.center)
                 .padding(.horizontal)
         }
         .frame(maxWidth: .infinity, maxHeight: .infinity)
+        .background(AppBackground())
     }
 }
*** End Patch
```

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/Habits/HabitsTabView.swift
@@
     var body: some View {
         navigationContainer {
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
+        .background(AppBackground())
         .sheet(isPresented: $showingSettings) {
             SettingsView() // Personalizationと理想の姿のみ
             .environmentObject(appState)
         }
     }
*** End Patch
```

### 4. SectionRow コンポーネントの拡張（SettingsView用の便利メソッド追加）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/SectionRow.swift
@@
 // 便利な拡張: よく使うパターン
 extension SectionRow {
     // トグルスイッチ付き
     static func toggle(label: String, isOn: Binding<Bool>) -> some View {
         SectionRow(label: label) {
             Toggle("", isOn: isOn)
                 .labelsHidden()
         }
     }
     
     // テキスト付き
     static func text(label: String, text: String) -> some View {
         SectionRow(label: label) {
             Text(text)
                 .font(AppTheme.Typography.subheadlineDynamic)
                 .foregroundStyle(AppTheme.Colors.secondaryLabel)
         }
     }
     
     // ボタン付き
     static func button(label: String, title: String, action: @escaping () -> Void) -> some View {
         SectionRow(label: label) {
             Button(action: action) {
                 HStack(spacing: 4) {
                     Text(title)
                         .font(AppTheme.Typography.subheadlineDynamic)
                     Image(systemName: "chevron.right")
                         .font(.caption)
                 }
                 .foregroundStyle(AppTheme.Colors.secondaryLabel)
             }
         }
     }
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
 }
*** End Patch
```

---

## まとめ

上記のパッチで以下を反映します：

1. 主要CTAボタン: `SessionView` のセッションボタンに `.large` スタイル（76px角丸）を適用
2. SettingsView: `List` を `ScrollView` + `CardView` に変更し、`SectionRow` を使用
3. AppBackground(): すべての画面に適用（`AuthenticationProcessingView`、`AuthRequiredPlaceholderView`、`HabitsTabView`）
4. SectionRow: `SettingsView` で使用し、`Picker` 用の便利メソッドを追加

これで、Mobbinデザインの要素をより反映できます。