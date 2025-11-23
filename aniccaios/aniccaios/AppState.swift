import Foundation
import Combine
import UIKit
import SwiftUI
import RevenueCat

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published private(set) var authStatus: AuthStatus = .signedOut
    @Published private(set) var userProfile: UserProfile = UserProfile()
    @Published private(set) var subscriptionInfo: SubscriptionInfo = .free
    @Published private(set) var purchaseEnvironmentStatus: PurchaseEnvironmentStatus = .ready
    @Published private(set) var subscriptionHold: Bool = false
    @Published private(set) var subscriptionHoldPlan: SubscriptionInfo.Plan? = nil
    
    enum QuotaHoldReason: String, Codable {
        case quotaExceeded       // 月間上限到達
        case sessionTimeCap      // 無料セッション5分上限
    }
    @Published private(set) var quotaHoldReason: QuotaHoldReason?
    @Published private(set) var habitSchedules: [HabitType: DateComponents] = [:]
    @Published private(set) var isOnboardingComplete: Bool
    @Published private(set) var pendingHabitTrigger: PendingHabitTrigger?
    @Published private(set) var onboardingStep: OnboardingStep
    @Published private(set) var pendingHabitFollowUps: [OnboardingStep] = []
    @Published private(set) var cachedOffering: Offering?
    @Published private(set) var customHabit: CustomHabitConfiguration?
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
    private let onboardingStepKey = "com.anicca.onboardingStep"
    private let userCredentialsKey = "com.anicca.userCredentials"
    private let userProfileKey = "com.anicca.userProfile"
    private let subscriptionKey = "com.anicca.subscription"

    private let scheduler = NotificationScheduler.shared
    private let promptBuilder = HabitPromptBuilder()

    private var pendingHabitPrompt: (habit: HabitType, prompt: String)?

    private init() {
        // Initialize all properties first
        self.habitSchedules = [:]
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)
        self.pendingHabitTrigger = nil
        // オンボーディング未完了時は強制的に.welcomeから開始
        if defaults.bool(forKey: onboardingKey) {
            self.onboardingStep = OnboardingStep(rawValue: defaults.integer(forKey: onboardingStepKey)) ?? .completion
        } else {
            // オンボーディング未完了なら、保存されたステップをクリアして.welcomeから開始
            defaults.removeObject(forKey: onboardingStepKey)
            self.onboardingStep = .welcome
        }
        
        // Load user credentials and profile
        self.authStatus = loadUserCredentials()
        self.userProfile = loadUserProfile()
        self.subscriptionInfo = loadSubscriptionInfo()
        self.customHabit = CustomHabitStore.shared.load()
        
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
        
        // Sync scheduled alarms on app launch
        Task {
            await scheduler.applySchedules(habitSchedules)
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

        await scheduler.applySchedules(habitSchedules)
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

        await scheduler.applySchedules(habitSchedules)
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
        setOnboardingStep(.completion)
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
        onboardingStep = .welcome
        userProfile = UserProfile()
        subscriptionInfo = .free
        clearCustomHabit()
        clearUserCredentials()
        defaults.removeObject(forKey: onboardingStepKey)
        Task {
            await scheduler.cancelAll()
        }
    }
    
    func setOnboardingStep(_ step: OnboardingStep) {
        onboardingStep = step
        // オンボーディング未完了時のみステップを保存
        if !isOnboardingComplete {
            defaults.set(step.rawValue, forKey: onboardingStepKey)
        } else {
            // オンボーディング完了後はステップ情報を削除
            defaults.removeObject(forKey: onboardingStepKey)
        }
        defaults.synchronize()
    }
    
    // MARK: - Authentication
    
    func setAuthStatus(_ status: AuthStatus) {
        authStatus = status
    }
    
    func updateUserCredentials(_ credentials: UserCredentials) {
        authStatus = .signedIn(credentials)
        saveUserCredentials(credentials)
        
        // Update displayName in profile if empty and Apple provided a name
        // Don't overwrite if credentials.displayName is empty (user will set it in profile step)
        if userProfile.displayName.isEmpty && !credentials.displayName.isEmpty {
            userProfile.displayName = credentials.displayName
            saveUserProfile()
        }
        Task { await SubscriptionManager.shared.handleLogin(appUserId: credentials.userId) }
    }
    
    func clearUserCredentials() {
        authStatus = .signedOut
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.synchronize()
        Task { await SubscriptionManager.shared.handleLogout() }
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
            habitName = NSLocalizedString("next_schedule_habit_wake", comment: "")
        case .training:
            habitName = NSLocalizedString("next_schedule_habit_training", comment: "")
        case .bedtime:
            habitName = NSLocalizedString("next_schedule_habit_bedtime", comment: "")
        case .custom:
            habitName = CustomHabitStore.shared.displayName(
                fallback: NSLocalizedString("habit_title_custom_fallback", comment: "")
            )
        }
        let messageFormat = NSLocalizedString("next_schedule_message", comment: "")
        let message = String(format: messageFormat, timeString, habitName)
        
        let components = calendar.dateComponents([.hour, .minute], from: closest.date)
        return (habit: closest.habit, time: components, message: message)
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
    
    // MARK: - Habit Follow-up Questions
    
    func prepareHabitFollowUps(selectedHabits: Set<HabitType>) {
        var followUps: [OnboardingStep] = []
        
        // Wake location: if Wake is selected, ask wake location
        // If both Wake and Bedtime are selected, only ask wake location (reuse for bedtime)
        if selectedHabits.contains(.wake) {
            followUps.append(.habitWakeLocation)
        } else if selectedHabits.contains(.bedtime) {
            // Only Bedtime selected, ask sleep location
            followUps.append(.habitSleepLocation)
        }
        
        // Training focus: if Training is selected, ask training focus
        if selectedHabits.contains(.training) {
            followUps.append(.habitTrainingFocus)
        }
        
        pendingHabitFollowUps = followUps
    }
    
    func consumeNextHabitFollowUp() -> OnboardingStep? {
        guard !pendingHabitFollowUps.isEmpty else { return nil }
        return pendingHabitFollowUps.removeFirst()
    }
    
    func clearHabitFollowUps() {
        pendingHabitFollowUps = []
    }
    
    func updateSleepLocation(_ location: String) {
        var profile = userProfile
        profile.sleepLocation = location
        updateUserProfile(profile, sync: true)
    }
    
    func updateTrainingFocus(_ focus: [String]) {
        var profile = userProfile
        profile.trainingFocus = focus
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - Language Detection
    
    private func loadUserProfile() -> UserProfile {
        guard let data = defaults.data(forKey: userProfileKey),
              let profile = try? JSONDecoder().decode(UserProfile.self, from: data) else {
            // Initialize with detected language from device locale
            return UserProfile(preferredLanguage: LanguagePreference.detectDefault())
        }
        // If preferredLanguage is not set or invalid, detect from locale
        var loadedProfile = profile
        if loadedProfile.preferredLanguage.rawValue.isEmpty {
            loadedProfile.preferredLanguage = LanguagePreference.detectDefault()
        }
        return loadedProfile
    }
    
    // MARK: - Subscription Info
    
    var shouldShowPaywall: Bool {
        !subscriptionInfo.isEntitled && !subscriptionHold
    }
    
    func clearSubscriptionCache() {
        subscriptionInfo = .free
        updateOffering(nil)
    }
    
    func updateSubscriptionInfo(_ info: SubscriptionInfo) {
        subscriptionInfo = info
        if let data = try? JSONEncoder().encode(info) {
            defaults.set(data, forKey: subscriptionKey)
        }
        // 購読状態が更新されたらホールド解除
        subscriptionHold = false
        subscriptionHoldPlan = nil
        quotaHoldReason = nil
    }
    
    func markQuotaHold(plan: SubscriptionInfo.Plan?, reason: QuotaHoldReason = .quotaExceeded) {
        subscriptionHoldPlan = plan
        subscriptionHold = plan != nil
        quotaHoldReason = reason
    }
    
    func updatePurchaseEnvironment(_ status: PurchaseEnvironmentStatus) {
        purchaseEnvironmentStatus = status
    }
    
    func updateOffering(_ offering: Offering?) {
        cachedOffering = offering
    }
    
    func loadSubscriptionInfo() -> SubscriptionInfo {
        guard let data = defaults.data(forKey: subscriptionKey),
              let info = try? JSONDecoder().decode(SubscriptionInfo.self, from: data) else {
            return .free
        }
        return info
    }
    
    // MARK: - Custom Habit
    
    func setCustomHabitName(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let config = CustomHabitConfiguration(name: trimmed)
        customHabit = config
        CustomHabitStore.shared.save(config)
    }

    func clearCustomHabit() {
        customHabit = nil
        CustomHabitStore.shared.save(nil)
    }
}

enum PurchaseEnvironmentStatus: Codable, Equatable {
    case ready
    case accountMissing
    case paymentsDisabled
    
    var message: LocalizedStringKey {
        switch self {
        case .ready:
            return ""
        case .accountMissing:
            return "settings_subscription_account_missing"
        case .paymentsDisabled:
            return "settings_subscription_payments_disabled"
        }
    }
}
