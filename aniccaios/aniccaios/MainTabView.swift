import SwiftUI
import UIKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // コンテンツエリア
            Group {
                switch appState.selectedRootTab {
                case .talk:
                    TalkView()
                case .behavior:
                    BehaviorView()
                case .profile:
                    ProfileView()
                        .environmentObject(appState)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            
            // Figmaデザイン準拠のカスタムタブバー
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

