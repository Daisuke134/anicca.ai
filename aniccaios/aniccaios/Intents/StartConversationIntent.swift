import AppIntents
import Foundation

@available(iOS 16.0, *)
struct StartConversationIntent: AppIntent {
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
        AppState.shared.prepareForImmediateSession(habit: habitType)
        
        return .result()
    }
}

