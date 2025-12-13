import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        TabView(selection: $appState.selectedRootTab) {
            TalkView()
                .tabItem {
                    Label(String(localized: "tab_talk"), systemImage: "message")
                }
                .tag(AppState.RootTab.talk)
            
            BehaviorTabView()
                .tabItem {
                    Label(String(localized: "tab_behavior"), systemImage: "chart.bar")
                }
                .tag(AppState.RootTab.behavior)
            
            ProfileTabView()
                .tabItem {
                    Label(String(localized: "tab_profile"), systemImage: "person")
                }
                .tag(AppState.RootTab.profile)
        }
        .background(AppBackground())
    }
}

// v3: Talk のルートは TalkView（Sessionは push 遷移）

// Phase 3では既存のHabitsTabViewを暫定的にProfileに割り当てる（UI/UXは後続フェーズで差し替え）
typealias ProfileTabView = HabitsTabView

private struct BehaviorTabView: View {
    var body: some View {
        NavigationStack {
            // フェーズ6で BehaviorView を実装して差し替える
            VStack(spacing: 0) { }
                .navigationTitle(String(localized: "tab_behavior"))
        }
        .background(AppBackground())
    }
}

