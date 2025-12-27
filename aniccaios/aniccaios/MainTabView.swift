import SwiftUI
import UIKit
import Combine

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
        .onChange(of: appState.shouldStartSessionImmediately) { should in
            // ★ shouldStartSessionImmediatelyがtrueになった時もチェック
            // prepareForImmediateSessionでshouldStartSessionImmediatelyとpendingHabitTriggerが
            // 同時に設定されるため、両方の変更を監視する必要がある
            if should { checkPendingHabitTrigger() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            // ★ アプリがアクティブになった時もチェック（バックグラウンドからの復帰時）
            // 通知タップでアプリが開く時は必ずこのNotificationが発火する
            checkPendingHabitTrigger()
        }
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

