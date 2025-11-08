import AppIntents
import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct StartConversationIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Conversation"
    static var description = IntentDescription("Start a conversation with Anicca for your habit routine.")
    
    @Parameter(title: "Habit Type")
    var habitType: String
    
    static var openAppWhenRun: Bool = true
    
    @MainActor
    func perform() async throws -> some IntentResult {
        // Parse habit type from string
        guard let habit = HabitType(rawValue: habitType) else {
            throw IntentError.invalidHabitType
        }
        
        // Configure audio session
        try? AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
        
        // Prepare for immediate session
        AppState.shared.prepareForImmediateSession(habit: habit)
        
        return .result()
    }
}
#endif

enum IntentError: Error {
    case invalidHabitType
}

