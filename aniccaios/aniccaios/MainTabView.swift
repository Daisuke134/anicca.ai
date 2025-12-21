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
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }
}

