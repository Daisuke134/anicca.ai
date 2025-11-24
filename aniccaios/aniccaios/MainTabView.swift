import SwiftUI

struct MainTabView: View {
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            TalkTabView()
                .tabItem {
                    Label("Talk", systemImage: "message")
                }
                .tag(0)
            
            HabitsTabView()
                .tabItem {
                    Label("Habits", systemImage: "list.bullet")
                }
                .tag(1)
        }
    }
}

// SessionViewをTalkTabViewにリネーム
typealias TalkTabView = SessionView

