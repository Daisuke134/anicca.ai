import SwiftUI

/// Figmaデザイン（talk-ios.md, Behavior.md）と完全一致するタブバー
/// - 高さ: 76px（ボーダー含む）
/// - 背景: #FDFCFC
/// - 上部ボーダー: 1px solid rgba(200, 198, 191, 0.2)
/// - 選択中タブ: #E9E6E0, border-radius: 24px
struct FigmaTabBar: View {
    @Binding var selectedTab: AppState.RootTab
    
    // Figmaより: タブバー高さ76px（ボーダー1px + コンテンツ75px）
    private let tabBarHeight: CGFloat = 76
    private let tabButtonHeight: CGFloat = 59
    // FiX.md指定: Talk 80 / Behavior 91 / Profile 80
    private let talkWidth: CGFloat = 80
    private let behaviorWidth: CGFloat = 91
    private let profileWidth: CGFloat = 80
    private let tabCornerRadius: CGFloat = 24
    
    var body: some View {
        VStack(spacing: 0) {
            // 上部ボーダー（Figma: border-top: 1px solid rgba(200, 198, 191, 0.2)）
            Rectangle()
                .fill(Color(red: 200/255, green: 198/255, blue: 191/255, opacity: 0.2))
                .frame(height: 1)
            
            // タブコンテナ（fixed width + 残りはSpacerで配分）
            HStack(spacing: 0) {
                tabButton(
                    tab: .talk,
                    icon: "message.fill",
                    title: String(localized: "tab_talk"),
                    width: talkWidth
                )
                Spacer(minLength: 0)
                tabButton(
                    tab: .behavior,
                    icon: "chart.bar",
                    title: String(localized: "tab_behavior"),
                    width: behaviorWidth
                )
                Spacer(minLength: 0)
                tabButton(
                    tab: .profile,
                    icon: "person",
                    title: String(localized: "tab_profile"),
                    width: profileWidth
                )
                Spacer()
            }
            .frame(height: tabBarHeight - 1) // ボーダー分を引く
        }
        // Figma: background: #FDFCFC
        .background(Color(hex: "#FDFCFC"))
    }
    
    @ViewBuilder
    private func tabButton(tab: AppState.RootTab, icon: String, title: String, width: CGFloat) -> some View {
        let isSelected = selectedTab == tab
        
        Button {
            withAnimation(.easeInOut(duration: 0.15)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundStyle(
                        isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel
                    )
                
                Text(title)
                    // Figma: font-size: 10px
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(
                        isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel
                    )
            }
            .frame(width: width, height: tabButtonHeight)
            .background(
                // Figma: 選択中は background: #E9E6E0, border-radius: 24px
                RoundedRectangle(cornerRadius: tabCornerRadius)
                    .fill(isSelected ? Color(hex: "#E9E6E0") : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .padding(.top, 8) // Figma: top: 8px
    }
}

