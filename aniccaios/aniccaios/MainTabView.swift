import SwiftUI
import UIKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        // コンテンツエリア
        Group {
            switch appState.selectedRootTab {
            case .talk:
                TalkView()
            case .habits:
                HabitsTabView()
                    .environmentObject(appState)
            case .behavior:
                BehaviorView()
            case .profile:
                ProfileView()
                    .environmentObject(appState)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .bottom) {
            // Figmaデザイン準拠のカスタムタブバー
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

