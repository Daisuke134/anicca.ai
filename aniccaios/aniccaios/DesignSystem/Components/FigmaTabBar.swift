import SwiftUI

/// Figmaデザイン（profile.md）と完全一致するタブバー
/// - 高さ: 76px（ボーダー含む）
/// - 背景: アダプティブ（ライト #FDFCFC / ダーク #2c2b2a）
/// - 上部ボーダー: 1px solid アダプティブ
/// - 選択中タブ: アダプティブ, border-radius: 24px
struct FigmaTabBar: View {
    @Binding var selectedTab: AppState.RootTab
    
    // Figmaより: タブバー高さ76px（ボーダー1px + コンテンツ75px）
    private let tabBarHeight: CGFloat = 76
    private let tabButtonHeight: CGFloat = 59
    // Figma指定: 3タブ均等配置（水平中央揃え）
    private let tabCornerRadius: CGFloat = 24
    
    var body: some View {
        VStack(spacing: 0) {
            // 上部ボーダー（アダプティブ）
            Rectangle()
                .fill(AppTheme.Colors.tabBarBorder)
                .frame(height: 1)
            
            // タブコンテナ（2タブ均等配置）
            // Note: Talkタブは非表示（コードはMainTabViewに残す）
            HStack(spacing: 0) {
                tabButton(
                    tab: .myPath,
                    icon: "leaf.fill",
                    title: String(localized: "tab_mypath")
                )
                .accessibilityIdentifier("tab-mypath")
                tabButton(
                    tab: .profile,
                    icon: "person",
                    title: String(localized: "tab_profile")
                )
                .accessibilityIdentifier("tab-profile")
            }
            .frame(height: tabBarHeight - 1) // ボーダー分を引く
            .frame(maxWidth: .infinity)
        }
        // アダプティブ背景
        .background(AppTheme.Colors.tabBarBackground)
    }
    
    @ViewBuilder
    private func tabButton(tab: AppState.RootTab, icon: String, title: String) -> some View {
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
                    // Figma: font-size: 10px, font-weight: 500
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(
                        isSelected ? AppTheme.Colors.label : AppTheme.Colors.secondaryLabel
                    )
            }
            .frame(maxWidth: .infinity)
            .frame(height: tabButtonHeight)
            .background(
                // アダプティブ選択背景
                RoundedRectangle(cornerRadius: tabCornerRadius)
                    .fill(isSelected ? AppTheme.Colors.tabBarSelectedBackground : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .padding(.top, 8) // Figma: top: 8px
    }
}
