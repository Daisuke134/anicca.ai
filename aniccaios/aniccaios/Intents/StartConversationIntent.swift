import AppIntents
import Foundation

@available(iOS 26.0, *)
struct StartConversationIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start Conversation"
    static var description = IntentDescription("Start a conversation with Anicca for your habit routine.")
    
    @Parameter(title: "Habit Type")
    var habitType: HabitType
    
    static var openAppWhenRun: Bool = true
    
    @MainActor
    func perform() async throws -> some IntentResult {
        // Configure audio session
        try? AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
        
        // Prepare for immediate session
        AppState.shared.selectedRootTab = .talk
        AppState.shared.prepareForImmediateSession(habit: habitType)
        
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

