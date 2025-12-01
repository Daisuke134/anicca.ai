import SwiftUI

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
        .background(AppBackground())
    }
}

// SessionViewをTalkTabViewにリネーム
typealias TalkTabView = SessionView

