import AppIntents
import Foundation
import UIKit
import UserNotifications

@available(iOS 26.0, *)
struct StartConversationIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start Conversation"
    static var description = IntentDescription("Start a conversation with Anicca for your habit routine.")
    
    @Parameter(title: "Habit Type")
    var habitType: HabitType
    
    static var openAppWhenRun: Bool = true
    
    @MainActor
    func perform() async throws -> some IntentResult {
        // Intentプロセスからアプリ本体へ渡すため、AppGroupに起動要求を永続化。
        // 重要: ここで重い処理（音声セッション構成/画面遷移等）を行うと、起動ラグの原因になる。
        // アプリ本体側（AppState/AppDelegate）が起動直後にこのフラグを回収してUIを即表示する。
        let appGroupDefaults = AppGroup.userDefaults
        appGroupDefaults.set(habitType.rawValue, forKey: "pending_habit_launch_habit")
        appGroupDefaults.set(Date().timeIntervalSince1970, forKey: "pending_habit_launch_ts")
        
        if UIApplication.shared.applicationState == .background {
            await UNUserNotificationCenter.current().postLaunchShortcut(habit: habitType)
        }
        
        return .result()
    }
}

// iOS 26未満向けの後方互換Intent
@available(iOS 16.0, *)
@available(iOS, deprecated: 26.0, message: "Use the LiveActivityIntent version for iOS 26+")
struct StartConversationIntentLegacy: AppIntent {
    static var title: LocalizedStringResource = "Start Conversation"
    static var description = IntentDescription("Start a conversation with Anicca for your habit routine.")
    
    @Parameter(title: "Habit Type")
    var habitType: HabitType
    
    static var openAppWhenRun: Bool = true
    
    @MainActor
    func perform() async throws -> some IntentResult {
        try? AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
        AppState.shared.selectedRootTab = .talk
        AppState.shared.prepareForImmediateSession(habit: habitType)
        return .result()
    }
}

