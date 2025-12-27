import SwiftUI
import UIKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var habitSessionActive = false
    @State private var pendingHabit: HabitType?
    
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
        .fullScreenCover(isPresented: $habitSessionActive) {
            if let habit = pendingHabit {
                HabitSessionView(habit: habit)
                    .environmentObject(appState)
            }
        }
        .onAppear { checkPendingHabitTrigger() }
        .onChange(of: appState.pendingHabitTrigger) { _ in checkPendingHabitTrigger() }
        .safeAreaInset(edge: .bottom) {
            // Figmaデザイン準拠のカスタムタブバー
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
    
    private func checkPendingHabitTrigger() {
        guard let trigger = appState.pendingHabitTrigger,
              appState.shouldStartSessionImmediately else { return }
        pendingHabit = trigger.habit
        habitSessionActive = true
        appState.clearShouldStartSessionImmediately()
    }
}

