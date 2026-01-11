import SwiftUI
import UIKit
import Combine

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var activeHabitSession: ActiveHabitSession?
    
    var body: some View {
        // コンテンツエリア
        Group {
            switch appState.selectedRootTab {
            case .talk:
                TalkView()
            case .habits:
                HabitsTabView()
                    .environmentObject(appState)
            case .profile:
                ProfileView()
                    .environmentObject(appState)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fullScreenCover(item: $activeHabitSession, onDismiss: {
            appState.clearPendingHabitTrigger()
        }) { session in
            HabitSessionView(habit: session.habit, customHabitName: session.customHabitName)
                .environmentObject(appState)
        }
        .onAppear { checkPendingHabitTrigger(force: true) }
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
            handleAppOpenPaywall()
        }
        .safeAreaInset(edge: .bottom) {
            // Figmaデザイン準拠のカスタムタブバー
            FigmaTabBar(selectedTab: $appState.selectedRootTab)
        }
        .background(AppBackground())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
    
    private func checkPendingHabitTrigger(force: Bool = false) {
        guard let trigger = appState.pendingHabitTrigger else { return }
        guard appState.shouldStartSessionImmediately || force else { return }
        // item ベースの fullScreenCover を使うことで、表示時に必ず正しい値が渡される
        if activeHabitSession == nil {
            activeHabitSession = ActiveHabitSession(
                habit: trigger.habit,
                customHabitName: trigger.customHabitName
            )
        }
        appState.clearShouldStartSessionImmediately()
    }
    
    private func handleAppOpenPaywall() {
        // オンボーディング未完了 or 有料ユーザーはスキップ
        guard appState.isOnboardingComplete,
              appState.subscriptionInfo.plan == .free else { return }
        
        // 頻度制限: 3日に1回、最大3回まで
        let key = "lastAppLaunchPaywallDate"
        let countKey = "appLaunchPaywallCount"
        let defaults = UserDefaults.standard
        
        let count = defaults.integer(forKey: countKey)
        if count >= 3 { return }
        
        if let lastDate = defaults.object(forKey: key) as? Date,
           Calendar.current.dateComponents([.day], from: lastDate, to: Date()).day ?? 0 < 3 {
            return
        }
        
        defaults.set(Date(), forKey: key)
        defaults.set(count + 1, forKey: countKey)
        SuperwallManager.shared.register(placement: SuperwallPlacement.campaignAppLaunch.rawValue)
    }
}

/// セッション表示用の Identifiable ラッパー
struct ActiveHabitSession: Identifiable {
    let id = UUID()
    let habit: HabitType
    let customHabitName: String?
}

