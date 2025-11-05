import Foundation
import Combine

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published private(set) var habitSchedules: [HabitType: DateComponents] = [:]
    @Published private(set) var isOnboardingComplete: Bool
    @Published private(set) var pendingHabitTrigger: PendingHabitTrigger?
    private(set) var shouldStartSessionImmediately = false

    // Legacy support: computed property for backward compatibility
    var wakeTime: DateComponents? {
        get { habitSchedules[.wake] }
        set {
            if let newValue = newValue {
                habitSchedules[.wake] = newValue
            } else {
                habitSchedules.removeValue(forKey: .wake)
            }
        }
    }

    private let defaults = UserDefaults.standard
    private let wakeTimeKey = "com.anicca.wakeTime"
    private let habitSchedulesKey = "com.anicca.habitSchedules"
    private let onboardingKey = "com.anicca.onboardingComplete"

    private let scheduler = WakeNotificationScheduler.shared
    private let promptBuilder = HabitPromptBuilder()

    private var pendingHabitPrompt: (habit: HabitType, prompt: String)?

    private init() {
        // Initialize all properties first
        self.habitSchedules = [:]
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)
        self.pendingHabitTrigger = nil
        
        // Load habit schedules (new format)
        if let data = defaults.data(forKey: habitSchedulesKey),
           let decoded = try? JSONDecoder().decode([String: [String: Int]].self, from: data) {
            var schedules: [HabitType: DateComponents] = [:]
            for (key, value) in decoded {
                if let habit = HabitType(rawValue: key),
                   let hour = value["hour"],
                   let minute = value["minute"] {
                    var components = DateComponents()
                    components.hour = hour
                    components.minute = minute
                    components.second = 0
                    schedules[habit] = components
                }
            }
            self.habitSchedules = schedules
        } else {
            // Migrate from legacy wakeTime format
            if let oldWakeTime = Self.loadWakeTime(from: defaults, key: wakeTimeKey) {
                self.habitSchedules[.wake] = oldWakeTime
            }
        }
    }

    // Legacy method for backward compatibility
    func updateWakeTime(_ date: Date) async {
        await updateHabit(.wake, time: date)
    }

    func updateHabit(_ habit: HabitType, time: Date) async {
        let calendar = Calendar.current
        var components = DateComponents()
        components.hour = calendar.component(.hour, from: time)
        components.minute = calendar.component(.minute, from: time)
        components.second = 0

        habitSchedules[habit] = components
        saveHabitSchedules()

        await scheduler.scheduleNotifications(for: habitSchedules)
    }

    func updateHabits(_ schedules: [HabitType: Date]) async {
        var componentsMap: [HabitType: DateComponents] = [:]
        let calendar = Calendar.current

        for (habit, date) in schedules {
            var components = DateComponents()
            components.hour = calendar.component(.hour, from: date)
            components.minute = calendar.component(.minute, from: date)
            components.second = 0
            componentsMap[habit] = components
        }

        habitSchedules = componentsMap
        saveHabitSchedules()

        await scheduler.scheduleNotifications(for: habitSchedules)
    }

    private func saveHabitSchedules() {
        var encoded: [String: [String: Int]] = [:]
        for (habit, components) in habitSchedules {
            encoded[habit.rawValue] = [
                "hour": components.hour ?? 0,
                "minute": components.minute ?? 0
            ]
        }
        if let data = try? JSONEncoder().encode(encoded) {
            defaults.set(data, forKey: habitSchedulesKey)
        }
        defaults.synchronize()
    }

    func markOnboardingComplete() {
        guard !isOnboardingComplete else { return }
        isOnboardingComplete = true
        defaults.set(true, forKey: onboardingKey)
        defaults.synchronize()
    }

    // Legacy methods for backward compatibility
    func prepareForImmediateSession() {
        prepareForImmediateSession(habit: .wake)
    }

    func handleWakeTrigger() {
        handleHabitTrigger(.wake)
    }

    func consumeWakePrompt() -> String? {
        consumePendingPrompt()
    }

    func clearPendingWakeTrigger() {
        clearPendingHabitTrigger()
    }

    // New habit-aware methods
    func prepareForImmediateSession(habit: HabitType) {
        let prompt = promptBuilder.buildPrompt(for: habit, scheduledTime: habitSchedules[habit], now: Date())
        pendingHabitPrompt = (habit: habit, prompt: prompt)
        pendingHabitTrigger = PendingHabitTrigger(id: UUID(), habit: habit)
        shouldStartSessionImmediately = true
    }

    func handleHabitTrigger(_ habit: HabitType) {
        let prompt = promptBuilder.buildPrompt(for: habit, scheduledTime: habitSchedules[habit], now: Date())
        pendingHabitPrompt = (habit: habit, prompt: prompt)
        pendingHabitTrigger = PendingHabitTrigger(id: UUID(), habit: habit)
    }

    func consumePendingPrompt() -> String? {
        let prompt = pendingHabitPrompt?.prompt
        pendingHabitPrompt = nil
        return prompt
    }

    func clearPendingHabitTrigger() {
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        shouldStartSessionImmediately = false
    }

    func resetState() {
        habitSchedules = [:]
        isOnboardingComplete = false
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        Task {
            await scheduler.cancelAllNotifications()
        }
    }

    private static func loadWakeTime(from defaults: UserDefaults, key: String) -> DateComponents? {
        guard let stored = defaults.dictionary(forKey: key) else { return nil }
        var components = DateComponents()
        if let hour = stored["hour"] as? Int { components.hour = hour }
        if let minute = stored["minute"] as? Int { components.minute = minute }
        if components.hour == nil && components.minute == nil {
            return nil
        }
        return components
    }
}
