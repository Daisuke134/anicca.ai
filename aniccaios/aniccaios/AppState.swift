import Foundation
import Combine
import UIKit

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published private(set) var authStatus: AuthStatus = .signedOut
    @Published private(set) var userProfile: UserProfile = UserProfile()
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
    private let userCredentialsKey = "com.anicca.userCredentials"
    private let userProfileKey = "com.anicca.userProfile"

    private let scheduler = WakeNotificationScheduler.shared
    private let promptBuilder = HabitPromptBuilder()

    private var pendingHabitPrompt: (habit: HabitType, prompt: String)?

    private init() {
        // Initialize all properties first
        self.habitSchedules = [:]
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)
        self.pendingHabitTrigger = nil
        
        // Load user credentials and profile
        self.authStatus = loadUserCredentials()
        self.userProfile = loadUserProfile()
        
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
        guard case .signedIn = authStatus else { return }
        
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
        guard case .signedIn = authStatus else { return }
        
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
        authStatus = .signedOut
        habitSchedules = [:]
        isOnboardingComplete = false
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        userProfile = UserProfile()
        clearUserCredentials()
        Task {
            await scheduler.cancelAllNotifications()
        }
    }
    
    // MARK: - Authentication
    
    func updateUserCredentials(_ credentials: UserCredentials) {
        authStatus = .signedIn(credentials)
        saveUserCredentials(credentials)
        
        // Update displayName in profile if empty and Apple provided a name
        if userProfile.displayName.isEmpty && !credentials.displayName.isEmpty {
            userProfile.displayName = credentials.displayName
            saveUserProfile()
        }
    }
    
    func clearUserCredentials() {
        authStatus = .signedOut
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.synchronize()
    }
    
    private func loadUserCredentials() -> AuthStatus {
        guard let data = defaults.data(forKey: userCredentialsKey),
              let credentials = try? JSONDecoder().decode(UserCredentials.self, from: data) else {
            return .signedOut
        }
        return .signedIn(credentials)
    }
    
    private func saveUserCredentials(_ credentials: UserCredentials) {
        if let data = try? JSONEncoder().encode(credentials) {
            defaults.set(data, forKey: userCredentialsKey)
            defaults.synchronize()
        }
    }
    
    // MARK: - User Profile
    
    func updateUserProfile(_ profile: UserProfile, sync: Bool = true) {
        userProfile = profile
        saveUserProfile()
        
        if sync {
            Task {
                await ProfileSyncService.shared.enqueue(profile: profile)
            }
        }
    }
    
    private func loadUserProfile() -> UserProfile {
        guard let data = defaults.data(forKey: userProfileKey),
              let profile = try? JSONDecoder().decode(UserProfile.self, from: data) else {
            return UserProfile()
        }
        return profile
    }
    
    private func saveUserProfile() {
        if let data = try? JSONEncoder().encode(userProfile) {
            defaults.set(data, forKey: userProfileKey)
            defaults.synchronize()
        }
    }
    
    // MARK: - Device ID
    
    func resolveDeviceId() -> String {
        return UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
    
    // MARK: - Next Habit Schedule
    
    func getNextHabitSchedule() -> (habit: HabitType, time: DateComponents, message: String)? {
        let now = Date()
        let calendar = Calendar.current
        let currentHour = calendar.component(.hour, from: now)
        let currentMinute = calendar.component(.minute, from: now)
        
        var candidates: [(habit: HabitType, date: Date)] = []
        
        for (habit, components) in habitSchedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            
            var targetComponents = DateComponents()
            targetComponents.hour = hour
            targetComponents.minute = minute
            targetComponents.second = 0
            
            guard let targetDate = calendar.date(from: targetComponents) else { continue }
            
            // If time has passed today, schedule for tomorrow
            let adjustedDate: Date
            if hour < currentHour || (hour == currentHour && minute <= currentMinute) {
                adjustedDate = calendar.date(byAdding: .day, value: 1, to: targetDate) ?? targetDate
            } else {
                adjustedDate = targetDate
            }
            
            candidates.append((habit: habit, date: adjustedDate))
        }
        
        guard let closest = candidates.min(by: { $0.date < $1.date }) else {
            return nil
        }
        
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        let timeString = formatter.string(from: closest.date)
        
        let habitName: String
        switch closest.habit {
        case .wake:
            habitName = "Wake-up"
        case .training:
            habitName = "Training"
        case .bedtime:
            habitName = "Bedtime"
        }
        
        let components = calendar.dateComponents([.hour, .minute], from: closest.date)
        return (habit: closest.habit, time: components, message: "\(timeString) I'll nudge you for \(habitName)")
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
