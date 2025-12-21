import SwiftUI
import UIKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        TabView(selection: $appState.selectedRootTab) {
            TalkView()
                .tabItem {
                    Label(String(localized: "tab_talk"), systemImage: "message")
                }
                .tag(AppState.RootTab.talk)
            
            BehaviorView()
                .tabItem {
                    Label(String(localized: "tab_behavior"), systemImage: "chart.bar")
                }
                .tag(AppState.RootTab.behavior)
            
            ProfileView()
                .environmentObject(appState)
                .tabItem {
                    Label(String(localized: "tab_profile"), systemImage: "person")
                }
                .tag(AppState.RootTab.profile)
        }
        .background(AppBackground())
        .onAppear {
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(AppTheme.Colors.background)
            
            // タブバーを固定（フロートしないように）
            appearance.shadowColor = .clear  // 影を削除
            appearance.shadowImage = UIImage()  // 影画像を削除
            
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
            
            // iOS 15+ でタブバーを常に表示（フロートしない）
            if #available(iOS 15.0, *) {
                UITabBar.appearance().isTranslucent = false
            }
        }
    }
}

