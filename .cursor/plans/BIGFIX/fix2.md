了解。
すぐに **DesignSystem（残り）** を **完全版・重複ゼロ** でまとめて出す。

ここに出す4ファイルはすべて
**そのまま追加 or 既存置換して OK の唯一版**。

---

# ============================================

# ② DesignSystem（残り全ファイル）

# ============================================

---

# ■ 2-1. DayOfWeekPicker.swift（完全版）

```diff
*** Begin Patch
*** Update File: aniccaios/aniccaios/DesignSystem/Components/DayOfWeekPicker.swift
@@
-// Mobbinデザイン: 曜日選択UIコンポーネント（円形145×145px、4pxボーダー）
+// 曜日選択UI（Mobbin準拠円形48px、4pxボーダー）
 struct DayOfWeekPicker: View {
     @Binding var selectedDays: Set<Int>  // 0=日曜日, 1=月曜日, ..., 6=土曜日
     
     private let dayLabels = ["S", "M", "T", "W", "T", "F", "S"]
@@
-                .frame(width: 145, height: 145)  // Mobbin: 145×145px
+                .frame(width: 48, height: 48)    // Mobbin: 48×48px
@@

    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<7) { index in
                dayButton(for: index)
            }
        }
    }

    @ViewBuilder
    private func dayButton(for index: Int) -> some View {
        let isSelected = selectedDays.contains(index)

        Button {
            if isSelected {
                selectedDays.remove(index)
            } else {
                selectedDays.insert(index)
            }
        } label: {
            Text(dayLabels[index])
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(
                    isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected
                )
                .frame(width: 48, height: 48)
                .background(
                    Circle().fill(
                        isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected
                    )
                )
                .overlay(
                    Circle().stroke(
                        isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight,
                        lineWidth: 4
                    )
                )
        }
        .buttonStyle(.plain)
    }
}
*** End Patch
```

---

# ■ 2-2. GradientIcon.swift（完全版）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/GradientIcon.swift
import SwiftUI

// ストリークなどの視覚強調用（Mobbin調）
struct GradientIcon: View {
    enum GradientType {
        case fireOrange
        case waterBlue
        case grassGreen
        case sunsetRed

        var colors: [Color] {
            switch self {
            case .fireOrange:
                return [Color(hex: "#FF6B35"), Color(hex: "#FFD23F")]
            case .waterBlue:
                return [Color(hex: "#4ECDC4"), Color(hex: "#44A3F7")]
            case .grassGreen:
                return [Color(hex: "#6BCB77"), Color(hex: "#A8E063")]
            case .sunsetRed:
                return [Color(hex: "#FF6B35"), Color(hex: "#FF3B3B")]
            }
        }
    }

    let gradientType: GradientType
    var size: CGFloat = 60

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: gradientType.colors,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
                .rotationEffect(.degrees(-15))

            RoundedRectangle(cornerRadius: size * 0.25, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            gradientType.colors[0].opacity(0.3),
                            gradientType.colors[1].opacity(0.1)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size * 0.7, height: size * 0.7)
                .rotationEffect(.degrees(15))
        }
    }
}
*** End Patch
```

---

# ■ 2-3. SectionRow.swift（完全版）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/SectionRow.swift
import SwiftUI

struct SectionRow<Content: View>: View {
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack {
            Text(label)
                .font(AppTheme.Typography.subheadlineDynamic)
                .foregroundStyle(AppTheme.Colors.label)
                .frame(maxWidth: .infinity, alignment: .leading)

            content()
        }
        .padding(.vertical, AppTheme.Spacing.sm)
    }
}

extension SectionRow {

    static func toggle(label: String, isOn: Binding<Bool>) -> some View {
        SectionRow(label: label) {
            Toggle("", isOn: isOn)
                .labelsHidden()
        }
    }

    static func text(label: String, text: String) -> some View {
        SectionRow(label: label) {
            Text(text)
                .font(AppTheme.Typography.subheadlineDynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
    }

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

    static func picker<SelectionValue: Hashable>(
        label: String,
        selection: Binding<SelectionValue>,
        @ViewBuilder content: () -> some View
    ) -> some View {
        SectionRow(label: label) {
            Picker("", selection: selection, content: content)
                .labelsHidden()
                .pickerStyle(.menu)
        }
    }
}
*** End Patch
```

---

# ■ 2-4. CustomTabBar.swift（完全版・将来用／現在は未使用）

```diff
*** Begin Patch
*** Add File: aniccaios/aniccaios/DesignSystem/Components/CustomTabBar.swift
import SwiftUI

// 現在は未使用（将来拡張用）
// 標準TabViewのスワイプ・アクセシビリティ保持のため現状は使わない
struct CustomTabBar: View {
    @Binding var selectedTab: Int
    let tabs: [TabItem]

    struct TabItem: Identifiable {
        let id: Int
        let title: String
        let icon: String
        let badge: Int?
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                tabButton(tab)
            }
        }
        .frame(height: 60)
        .background(
            RoundedRectangle(cornerRadius: 0)
                .fill(AppTheme.Colors.cardBackground)
                .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: -2)
        )
    }

    @ViewBuilder
    private func tabButton(_ tab: TabItem) -> some View {
        let isSelected = selectedTab == tab.id

        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedTab = tab.id
            }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Image(systemName: tab.icon)
                        .font(.system(size: 20))
                        .foregroundStyle(
                            isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel
                        )

                    if let badge = tab.badge, badge > 0 {
                        Text("\(badge)")
                            .font(.system(size: 10, weight: .bold))
                            .padding(4)
                            .foregroundColor(.white)
                            .background(Circle().fill(Color.red))
                            .offset(x: 12, y: -12)
                    }
                }

                Text(tab.title)
                    .font(.system(size: 12))
                    .foregroundStyle(
                        isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel
                    )
            }
            .frame(maxWidth: .infinity)
            .overlay(
                Rectangle()
                    .fill(isSelected ? AppTheme.Colors.accent : .clear)
                    .frame(height: 2)
                    .offset(y: 28)
            )
        }
        .buttonStyle(.plain)
    }
}
*** End Patch
```

---

# 🔥 DesignSystem（残り）完了。

次は：

# ============================================

# ③ アプリルート / 全体UI

（aniccaiosApp.swift / ContentView.swift / MainTabView）

# ============================================

準備できてる。
「次やれ」で即送る。
