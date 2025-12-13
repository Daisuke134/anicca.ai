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
    
    // サーバーからのプロファイル取得中フラグ（UIフラッシュ防止用）
    @Published private(set) var isBootstrappingProfile: Bool = false
    @Published private(set) var purchaseEnvironmentStatus: PurchaseEnvironmentStatus = .ready
    @Published private(set) var subscriptionHold: Bool = false
    @Published private(set) var subscriptionHoldPlan: SubscriptionInfo.Plan? = nil
    
    enum QuotaHoldReason: String, Codable {
        case quotaExceeded       // 月間上限到達
        case sessionTimeCap      // 無料セッション5分上限
    }
    @Published private(set) var quotaHoldReason: QuotaHoldReason?
    @Published private(set) var habitSchedules: [HabitType: DateComponents] = [:]
    @Published private(set) var habitFollowupCounts: [HabitType: Int] = [:]
    @Published private(set) var customHabitFollowupCounts: [UUID: Int] = [:]
    @Published private(set) var isOnboardingComplete: Bool
    @Published private(set) var pendingHabitTrigger: PendingHabitTrigger?
    @Published private(set) var onboardingStep: OnboardingStep
    @Published private(set) var pendingHabitFollowUps: [OnboardingStep] = []
    @Published private(set) var cachedOffering: Offering?
    @Published private(set) var customHabit: CustomHabitConfiguration?
    // 変更: カスタム習慣を配列で管理
    @Published private(set) var customHabits: [CustomHabitConfiguration] = []
    @Published private(set) var customHabitSchedules: [UUID: DateComponents] = [:]
    private(set) var shouldStartSessionImmediately = false
    @Published private(set) var hasSeenWakeSilentTip: Bool = false
    
    // Phase-7: sensor permissions + integration toggles
    @Published private(set) var sensorAccess: SensorAccessState
    
    enum RootTab: Int, Hashable {
        case talk = 0
        case behavior = 1
        case profile = 2
    }
    @Published var selectedRootTab: RootTab = .talk

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
    private let followupCountsKey = "com.anicca.followupCounts"
    private let customFollowupCountsKey = "com.anicca.customFollowupCounts"
    private let userCredentialsKey = "com.anicca.userCredentials"
    private let userProfileKey = "com.anicca.userProfile"
    private let subscriptionKey = "com.anicca.subscription"
    private let customHabitsKey = "com.anicca.customHabits"
    private let customHabitSchedulesKey = "com.anicca.customHabitSchedules"
    private let sensorAccessKey = "com.anicca.sensorAccessState"
    private let hasSeenWakeSilentTipKey = "com.anicca.hasSeenWakeSilentTip"

    private let scheduler = NotificationScheduler.shared
    private let promptBuilder = HabitPromptBuilder()
    
    private var pendingHabitPrompt: (habit: HabitType, prompt: String)?
    private var pendingConsultPrompt: String?
    private var pendingAutoResponse: Bool = false

    private init() {
        // Initialize all properties first
        self.habitSchedules = [:]
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)
        self.pendingHabitTrigger = nil
        // オンボーディング未完了時は強制的に.welcomeから開始
        if defaults.bool(forKey: onboardingKey) {
            let rawValue = defaults.integer(forKey: onboardingStepKey)
            self.onboardingStep = OnboardingStep.migratedFromLegacyRawValue(rawValue)
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
        
        // カスタム習慣の読み込み
        self.customHabits = CustomHabitStore.shared.loadAll()
        self.customHabitSchedules = loadCustomHabitSchedules()
        
        // Phase-7: load sensor access state
        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessKey)
        
        // Phase-9: load wake silent tip seen flag
        self.hasSeenWakeSilentTip = defaults.bool(forKey: hasSeenWakeSilentTipKey)
        
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
        
        // Load followup counts (with defaults)
        loadFollowupCounts()
        
        // Sync scheduled alarms on app launch
        Task { await scheduler.applySchedules(habitSchedules) }
        Task { await applyCustomSchedulesToScheduler() }
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
    
    // MARK: Followups
    func followupCount(for habit: HabitType) -> Int {
        if let n = habitFollowupCounts[habit] { return bounded(n) }
        return defaultFollowupCount(for: habit)
    }
    
    func customFollowupCount(for id: UUID) -> Int {
        return bounded(customHabitFollowupCounts[id] ?? 2)
    }
    
    func updateFollowupCount(for habit: HabitType, count: Int) {
        habitFollowupCounts[habit] = bounded(count)
        saveFollowupCounts()
        Task { await scheduler.applySchedules(habitSchedules) }
    }
    
    func updateCustomFollowupCount(id: UUID, count: Int) {
        customHabitFollowupCounts[id] = bounded(count)
        saveCustomFollowupCounts()
        Task { await applyCustomSchedulesToScheduler() }
    }
    
    private func defaultFollowupCount(for habit: HabitType) -> Int {
        return 2  // すべての習慣で再通知回数を2に統一
    }
    
    private func bounded(_ n: Int) -> Int {
        max(1, min(10, n))
    }
    
    private func loadFollowupCounts() {
        if let data = defaults.data(forKey: followupCountsKey),
           let dict = try? JSONDecoder().decode([String: Int].self, from: data) {
            habitFollowupCounts = dict.compactMapKeys { HabitType(rawValue: $0) }
        } else {
            habitFollowupCounts = [.wake: 2, .bedtime: 2, .training: 2, .custom: 2]
        }
        if let data = defaults.data(forKey: customFollowupCountsKey),
           let dict = try? JSONDecoder().decode([String: Int].self, from: data) {
            customHabitFollowupCounts = dict.compactMapKeys { UUID(uuidString: $0) }
        }
    }
    
    private func saveFollowupCounts() {
        let enc = habitFollowupCounts.mapKeys { $0.rawValue }
        if let data = try? JSONEncoder().encode(enc) {
            defaults.set(data, forKey: followupCountsKey)
        }
    }
    
    private func saveCustomFollowupCounts() {
        let enc = customHabitFollowupCounts.mapKeys { $0.uuidString }
        if let data = try? JSONEncoder().encode(enc) {
            defaults.set(data, forKey: customFollowupCountsKey)
        }
    }
    
    private func applyCustomSchedulesToScheduler() async {
        var payload: [UUID: (String, DateComponents)] = [:]
        for h in customHabits {
            if let t = customHabitSchedules[h.id] {
                payload[h.id] = (h.name, t)
            }
        }
        await scheduler.applyCustomSchedules(payload)
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

    /// デフォルト習慣のスケジュールを削除（通知も更新）
    func removeHabitSchedule(_ habit: HabitType) {
        habitSchedules.removeValue(forKey: habit)
        saveHabitSchedules()
        Task {
            // 削除された習慣のAlarmKit/通知を明示的にキャンセル
            scheduler.cancelHabit(habit)
            // 残りの習慣を再スケジュール
            await scheduler.applySchedules(habitSchedules)
        }
    }

    private func saveHabitSchedules() {
        let encoded = serializedHabitSchedulesForSync()
        if let data = try? JSONEncoder().encode(encoded) {
            defaults.set(data, forKey: habitSchedulesKey)
        }
    }
    
    private func serializedHabitSchedulesForSync() -> [String: [String: Int]] {
        var encoded: [String: [String: Int]] = [:]
        for (habit, components) in habitSchedules {
            encoded[habit.rawValue] = [
                "hour": components.hour ?? 0,
                "minute": components.minute ?? 0
            ]
        }
        return encoded
    }

    func markOnboardingComplete() {
        guard !isOnboardingComplete else { return }
        isOnboardingComplete = true
        defaults.set(true, forKey: onboardingKey)
        setOnboardingStep(.completion)
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
    func prepareForImmediateSession(habit: HabitType, customHabitId: UUID? = nil) {
        pendingConsultPrompt = nil
        let customHabitName = customHabitId.flatMap { id in
            customHabits.first(where: { $0.id == id })?.name
        }
        let prompt = promptBuilder.buildPrompt(
            for: habit,
            scheduledTime: habitSchedules[habit],
            now: Date(),
            profile: userProfile,
            customHabitName: customHabitName
        )
        pendingHabitPrompt = (habit: habit, prompt: prompt)
        pendingHabitTrigger = PendingHabitTrigger(id: UUID(), habit: habit)
        shouldStartSessionImmediately = true
        selectedRootTab = .talk
    }

    func handleHabitTrigger(_ habit: HabitType, customHabitId: UUID? = nil) {
        pendingConsultPrompt = nil
        let customHabitName = customHabitId.flatMap { id in
            customHabits.first(where: { $0.id == id })?.name
        }
        let prompt = promptBuilder.buildPrompt(
            for: habit,
            scheduledTime: habitSchedules[habit],
            now: Date(),
            profile: userProfile,
            customHabitName: customHabitName
        )
        pendingHabitPrompt = (habit: habit, prompt: prompt)
        pendingHabitTrigger = PendingHabitTrigger(id: UUID(), habit: habit)
    }
    
    func prepareConsultSessionPrompt() {
        let base = promptBuilder.buildPrompt(for: .custom, scheduledTime: nil, now: Date(), profile: userProfile)
        let directive = """

追加指示:
- これは相談モード。ユーザーが望む言語(${LANGUAGE_LINE})のみで一貫して話すこと。
- ${PROBLEMS} や ${IDEAL_TRAITS} がある場合は、必ず前提にした寄り添いと行動提案を続けること。
- 起床用の強いトーンではなく、安心と伴走を重視すること。
"""
        pendingHabitPrompt = nil
        pendingConsultPrompt = base + directive
        pendingAutoResponse = false
    }

    /// v0.3: サーバから返ってきた openingScript 等を、そのまま Realtime instructions に流す
    /// - autoResponse=true の場合、VoiceSessionController が response.create を送って「Aniccaが先に話す」挙動にする
    func prepareExternalPrompt(_ prompt: String, autoResponse: Bool) {
        pendingHabitPrompt = nil
        pendingConsultPrompt = prompt
        pendingAutoResponse = autoResponse
    }

    func consumePendingPrompt() -> String? {
        let prompt = pendingHabitPrompt?.prompt
        pendingHabitPrompt = nil
        return prompt
    }
    
    func consumePendingConsultPrompt() -> String? {
        let prompt = pendingConsultPrompt
        pendingConsultPrompt = nil
        return prompt
    }

    func consumePendingAutoResponse() -> Bool {
        let v = pendingAutoResponse
        pendingAutoResponse = false
        return v
    }

    func clearPendingHabitTrigger() {
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        pendingConsultPrompt = nil
        shouldStartSessionImmediately = false
    }

    func resetState() {
        authStatus = .signedOut
        habitSchedules = [:]
        isOnboardingComplete = false
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        pendingConsultPrompt = nil
        onboardingStep = .welcome
        userProfile = UserProfile()
        subscriptionInfo = .free
        sensorAccess = .default
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
    }
    
    // MARK: - Authentication
    
    func setAuthStatus(_ status: AuthStatus) {
        authStatus = status
    }
    
    func updateUserCredentials(_ credentials: UserCredentials) {
        authStatus = .signedIn(credentials)
        saveUserCredentials(credentials)
        
        // Update displayName in profile if empty and Apple provided a name
        // Don't overwrite if credentials.displayName is empty or "User" (user will set it in profile step)
        if userProfile.displayName.isEmpty && !credentials.displayName.isEmpty && credentials.displayName != "User" {
            userProfile.displayName = credentials.displayName
            saveUserProfile()
        }
        Task { await SubscriptionManager.shared.handleLogin(appUserId: credentials.userId) }
    }
    
    // Update only access token in currently signed-in credentials
    func updateAccessToken(token: String?, expiresAtMs: TimeInterval?) {
        guard case .signedIn(var creds) = authStatus else { return }
        creds.jwtAccessToken = token
        if let ms = expiresAtMs {
            creds.accessTokenExpiresAt = Date(timeIntervalSince1970: ms / 1000)
        }
        authStatus = .signedIn(creds)
        saveUserCredentials(creds)
    }
    
    func clearUserCredentials() {
        authStatus = .signedOut
        defaults.removeObject(forKey: userCredentialsKey)
        Task { await SubscriptionManager.shared.handleLogout() }
    }
    
    // Guideline 5.1.1(v)対応: アカウント削除時の完全な状態リセット
    func signOutAndWipe() {
        authStatus = .signedOut
        userProfile = UserProfile()
        subscriptionInfo = .free
        habitSchedules = [:]
        customHabits = []
        customHabitSchedules = [:]
        pendingHabitTrigger = nil
        pendingHabitPrompt = nil
        pendingConsultPrompt = nil
        cachedOffering = nil
        
        // オンボーディング状態をリセット
        isOnboardingComplete = false
        defaults.removeObject(forKey: onboardingKey)
        setOnboardingStep(.welcome) // これでonboardingStepKeyもクリアされる
        
        // UserDefaultsからすべてのユーザーデータを削除
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.removeObject(forKey: userProfileKey)
        defaults.removeObject(forKey: subscriptionKey)
        defaults.removeObject(forKey: habitSchedulesKey)
        defaults.removeObject(forKey: customHabitsKey)
        defaults.removeObject(forKey: customHabitSchedulesKey)
        defaults.removeObject(forKey: sensorAccessKey)
        
        // 通知をすべてキャンセル
        Task {
            await scheduler.cancelAll()
        }
        
        // RevenueCatからログアウト
        Task {
            await SubscriptionManager.shared.handleLogout()
        }
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
        }
    }
    
    // MARK: - User Profile
    
    func updateUserProfile(_ profile: UserProfile, sync: Bool = true) {
        let previousProfile = userProfile
        userProfile = profile
        saveUserProfile()
        
        // AlarmKit設定が変更された場合、通知を再スケジュール
        if previousProfile.useAlarmKitForWake != profile.useAlarmKitForWake ||
            previousProfile.useAlarmKitForTraining != profile.useAlarmKitForTraining ||
            previousProfile.useAlarmKitForBedtime != profile.useAlarmKitForBedtime ||
            previousProfile.useAlarmKitForCustom != profile.useAlarmKitForCustom ||
            previousProfile.preferredLanguage != profile.preferredLanguage {
            Task { await scheduler.applySchedules(habitSchedules) }
        }
        
        if sync {
            Task {
                await ProfileSyncService.shared.enqueue(profile: profile)
            }
        }
    }
    
    private func saveUserProfile() {
        if let data = try? JSONEncoder().encode(userProfile) {
            defaults.set(data, forKey: userProfileKey)
        }
    }
    
    func profileSyncPayload(for profile: UserProfile) -> [String: Any] {
        var payload: [String: Any] = [
            "displayName": profile.displayName,
            "preferredLanguage": profile.preferredLanguage.rawValue,
            "sleepLocation": profile.sleepLocation,
            "trainingFocus": profile.trainingFocus,
            "wakeLocation": profile.wakeLocation,
            "wakeRoutines": profile.wakeRoutines,
            "sleepRoutines": profile.sleepRoutines,
            "trainingGoal": profile.trainingGoal,
            // v0.3 traits
            "ideals": profile.ideals,
            "struggles": profile.struggles,
            "keywords": profile.keywords,
            "summary": profile.summary,
            "nudgeIntensity": profile.nudgeIntensity.rawValue,
            "stickyMode": profile.stickyMode,
            "useAlarmKitForWake": profile.useAlarmKitForWake,
            "useAlarmKitForTraining": profile.useAlarmKitForTraining,
            "useAlarmKitForBedtime": profile.useAlarmKitForBedtime,
            "useAlarmKitForCustom": profile.useAlarmKitForCustom
        ]
        
        if let big5 = profile.big5 {
            var obj: [String: Any] = [
                "openness": big5.openness,
                "conscientiousness": big5.conscientiousness,
                "extraversion": big5.extraversion,
                "agreeableness": big5.agreeableness,
                "neuroticism": big5.neuroticism
            ]
            if let s = big5.summary { obj["summary"] = s }
            payload["big5"] = obj
        }
        
        payload["habitSchedules"] = serializedHabitSchedulesForSync()
        payload["habitFollowupCounts"] = habitFollowupCounts.mapKeys { $0.rawValue }
        payload["customHabits"] = customHabits.map { ["id": $0.id.uuidString, "name": $0.name, "updatedAt": $0.updatedAt.timeIntervalSince1970] }
        payload["customHabitSchedules"] = serializedCustomHabitSchedulesForSync()
        payload["customHabitFollowupCounts"] = customHabitFollowupCounts.mapKeys { $0.uuidString }
        
        return payload
    }
    
    func bootstrapProfileFromServerIfAvailable() async {
        guard case .signedIn(let credentials) = authStatus else { return }
        
        isBootstrappingProfile = true
        defer { isBootstrappingProfile = false }
        
        var request = URLRequest(url: AppConfig.profileSyncURL)
        request.httpMethod = "GET"
        request.setValue(resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        do {
            let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            applyRemoteProfilePayload(json)
        } catch {
            // ネットワークがない場合などは無視してローカル状態を継続
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
        let wasEntitled = subscriptionInfo.isEntitled
        subscriptionInfo = info
        if let data = try? JSONEncoder().encode(info) {
            defaults.set(data, forKey: subscriptionKey)
        }
        // 購読状態が「非→有」になった時だけホールド解除（購入完了など）
        // エビデンス: 利用量のバックグラウンド同期でホールドが勝手に落ちるのを防ぐ
        if !wasEntitled && info.isEntitled {
            subscriptionHold = false
            subscriptionHoldPlan = nil
            quotaHoldReason = nil
        }
    }
    
    func markQuotaHold(plan: SubscriptionInfo.Plan?, reason: QuotaHoldReason = .quotaExceeded) {
        subscriptionHoldPlan = plan
        subscriptionHold = plan != nil
        quotaHoldReason = reason
    }
    
    func markHasSeenWakeSilentTip() {
        hasSeenWakeSilentTip = true
        defaults.set(true, forKey: hasSeenWakeSilentTipKey)
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
    
    // MARK: - Custom Habit Management
    
    func addCustomHabit(_ configuration: CustomHabitConfiguration) {
        let name = configuration.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let exists = customHabits.contains { $0.name.compare(name, options: .caseInsensitive) == .orderedSame }
        guard !exists else { return }
        customHabits.append(configuration)
        CustomHabitStore.shared.add(configuration)
    }
    
    func removeCustomHabit(at index: Int) {
        guard index >= 0 && index < customHabits.count else { return }
        let habit = customHabits[index]
        customHabits.remove(at: index)
        customHabitSchedules.removeValue(forKey: habit.id)
        CustomHabitStore.shared.remove(id: habit.id)
        
        // 通知も削除
        // 注意: NotificationSchedulerは現在HabitType単位で管理しているため、
        // カスタム習慣が複数ある場合は、Scheduler側をID対応に拡張する必要がある
        // 現時点では、カスタム習慣の通知は個別に管理されていないため、この処理は将来の拡張時に実装
        // Task {
        //     await NotificationScheduler.shared.cancelCustomHabit(id: habit.id)
        // }
        
        saveCustomHabitSchedules()
    }
    
    func removeCustomHabit(id: UUID) {
        guard let index = customHabits.firstIndex(where: { $0.id == id }) else { return }
        removeCustomHabit(at: index)
    }
    
    func updateCustomHabitSchedule(id: UUID, time: DateComponents?) {
        if let time = time {
            customHabitSchedules[id] = time
        } else {
            customHabitSchedules.removeValue(forKey: id)
        }
        saveCustomHabitSchedules()
        
        // 通知を更新
        Task { await applyCustomSchedulesToScheduler() }
    }
    
    // MARK: - UserProfile Update Methods
    
    func updateWakeLocation(_ location: String) {
        var profile = userProfile
        profile.wakeLocation = location
        updateUserProfile(profile, sync: true)
    }
    
    func updateWakeRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.wakeRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateSleepRoutines(_ routines: [String]) {
        var profile = userProfile
        profile.sleepRoutines = routines.filter { !$0.isEmpty }
        updateUserProfile(profile, sync: true)
    }
    
    func updateTrainingGoal(_ goal: String) {
        var profile = userProfile
        profile.trainingGoal = goal
        updateUserProfile(profile, sync: true)
    }
    
    func updateIdealTraits(_ traits: [String]) {
        var profile = userProfile
        profile.idealTraits = traits
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - v0.3 Traits update helpers
    
    func updateTraits(ideals: [String], struggles: [String]) {
        var profile = userProfile
        profile.ideals = ideals
        profile.struggles = struggles
        updateUserProfile(profile, sync: true)
    }
    
    func updateBig5(_ scores: Big5Scores?) {
        var profile = userProfile
        profile.big5 = scores
        updateUserProfile(profile, sync: true)
    }
    
    func updateNudgeIntensity(_ intensity: NudgeIntensity) {
        var profile = userProfile
        profile.nudgeIntensity = intensity
        updateUserProfile(profile, sync: true)
    }
    
    func setStickyMode(_ enabled: Bool) {
        var profile = userProfile
        profile.stickyMode = enabled
        updateUserProfile(profile, sync: true)
    }
    
    // MARK: - v0.3 Quote
    
    var todayQuote: String {
        QuoteProvider.shared.todayQuote(
            preferredLanguage: userProfile.preferredLanguage,
            date: Date()
        )
    }
    
    // MARK: - Private Helpers
    
    private func loadCustomHabitSchedules() -> [UUID: DateComponents] {
        guard let data = defaults.data(forKey: customHabitSchedulesKey) else {
            return [:]
        }
        
        do {
            let decoded = try JSONDecoder().decode([String: [String: Int]].self, from: data)
            // String (UUID文字列) と [String: Int] を UUID と DateComponents に変換
            return decoded.compactMap { (uuidString: String, componentsDict: [String: Int]) -> (UUID, DateComponents)? in
                guard let uuid = UUID(uuidString: uuidString),
                      let hour = componentsDict["hour"],
                      let minute = componentsDict["minute"] else {
                    return nil
                }
                var components = DateComponents()
                components.hour = hour
                components.minute = minute
                return (uuid, components)
            }.reduce(into: [UUID: DateComponents]()) { (result: inout [UUID: DateComponents], pair: (UUID, DateComponents)) in
                result[pair.0] = pair.1
            }
        } catch {
            print("[AppState] Failed to decode custom habit schedules: \(error)")
            return [:]
        }
    }
    
    private func saveCustomHabitSchedules() {
        // UUID と DateComponents を String と [String: Int] に変換して保存
        let stringKeyed = serializedCustomHabitSchedulesForSync()
        do {
            let data = try JSONEncoder().encode(stringKeyed)
            defaults.set(data, forKey: customHabitSchedulesKey)
            // UserDefaults.synchronize() は削除（iOSでは自動同期されるため非推奨）
        } catch {
            print("[AppState] Failed to encode custom habit schedules: \(error)")
        }
    }
    
    private func serializedCustomHabitSchedulesForSync() -> [String: [String: Int]] {
        customHabitSchedules.mapKeys { $0.uuidString }
            .mapValues { components in
                [
                    "hour": components.hour ?? 0,
                    "minute": components.minute ?? 0
                ]
            }
    }
    
    private func decodeHabitSchedules(from payload: [String: [String: Int]]) -> [HabitType: DateComponents] {
        var schedules: [HabitType: DateComponents] = [:]
        for (key, value) in payload {
            guard let habit = HabitType(rawValue: key) else { continue }
            schedules[habit] = decodeComponents(from: value)
        }
        return schedules
    }
    
    private func decodeComponents(from payload: [String: Int]) -> DateComponents {
        var components = DateComponents()
        components.hour = payload["hour"]
        components.minute = payload["minute"]
        components.second = 0
        return components
    }
    
    private func applyRemoteProfilePayload(_ payload: [String: Any]) {
        var profile = userProfile
        if let name = payload["displayName"] as? String {
            profile.displayName = name
        }
        if let preferredLanguage = payload["preferredLanguage"] as? String,
           let language = LanguagePreference(rawValue: preferredLanguage) {
            profile.preferredLanguage = language
        }
        if let sleepLocation = payload["sleepLocation"] as? String {
            profile.sleepLocation = sleepLocation
        }
        if let trainingFocus = payload["trainingFocus"] as? [String] {
            profile.trainingFocus = trainingFocus
        }
        if let wakeLocation = payload["wakeLocation"] as? String {
            profile.wakeLocation = wakeLocation
        }
        if let wakeRoutines = payload["wakeRoutines"] as? [String] {
            profile.wakeRoutines = wakeRoutines
        }
        if let sleepRoutines = payload["sleepRoutines"] as? [String] {
            profile.sleepRoutines = sleepRoutines
        }
        if let trainingGoal = payload["trainingGoal"] as? String {
            profile.trainingGoal = trainingGoal
        }
        // v0.3 traits (prefer new keys, fallback to legacy)
        if let ideals = payload["ideals"] as? [String] {
            profile.ideals = ideals
        } else if let idealTraits = payload["idealTraits"] as? [String] {
            profile.ideals = idealTraits
        }
        if let struggles = payload["struggles"] as? [String] {
            profile.struggles = struggles
        } else if let problems = payload["problems"] as? [String] {
            profile.struggles = problems
        }
        if let keywords = payload["keywords"] as? [String] {
            profile.keywords = keywords
        }
        if let summary = payload["summary"] as? String {
            profile.summary = summary
        }
        if let intensity = payload["nudgeIntensity"] as? String,
           let v = NudgeIntensity(rawValue: intensity) {
            profile.nudgeIntensity = v
        }
        if let big5 = payload["big5"] as? [String: Any] {
            let scores = Big5Scores(
                openness: big5["openness"] as? Int ?? 0,
                conscientiousness: big5["conscientiousness"] as? Int ?? 0,
                extraversion: big5["extraversion"] as? Int ?? 0,
                agreeableness: big5["agreeableness"] as? Int ?? 0,
                neuroticism: big5["neuroticism"] as? Int ?? 0,
                summary: big5["summary"] as? String
            )
            profile.big5 = scores
        }
        // AlarmKit設定（各習慣ごと）
        if let useAlarmKit = payload["useAlarmKitForWake"] as? Bool {
            profile.useAlarmKitForWake = useAlarmKit
        }
        if let useAlarmKitTraining = payload["useAlarmKitForTraining"] as? Bool {
            profile.useAlarmKitForTraining = useAlarmKitTraining
        }
        if let useAlarmKitBedtime = payload["useAlarmKitForBedtime"] as? Bool {
            profile.useAlarmKitForBedtime = useAlarmKitBedtime
        }
        if let useAlarmKitCustom = payload["useAlarmKitForCustom"] as? Bool {
            profile.useAlarmKitForCustom = useAlarmKitCustom
        }
        // Stickyモード（後方互換: stickyModeEnabled / wakeStickyModeEnabled も読み取る）
        if let sticky = payload["stickyMode"] as? Bool {
            profile.stickyMode = sticky
        } else if let sticky = payload["stickyModeEnabled"] as? Bool {
            profile.stickyMode = sticky
        } else if let oldSticky = payload["wakeStickyModeEnabled"] as? Bool {
            profile.stickyMode = oldSticky
        }
        updateUserProfile(profile, sync: false)
        
        if let schedules = payload["habitSchedules"] as? [String: [String: Int]] {
            habitSchedules = decodeHabitSchedules(from: schedules)
            saveHabitSchedules()
            Task { await scheduler.applySchedules(habitSchedules) }
        }
        
        if let followups = payload["habitFollowupCounts"] as? [String: Int] {
            habitFollowupCounts = followups.compactMapKeys { HabitType(rawValue: $0) }
                .mapValues { bounded($0) }
            saveFollowupCounts()
            Task { await scheduler.applySchedules(habitSchedules) }
        }
        
        if let customHabitsPayload = payload["customHabits"] as? [[String: Any]] {
            let configs = customHabitsPayload.compactMap { entry -> CustomHabitConfiguration? in
                guard let idString = entry["id"] as? String,
                      let uuid = UUID(uuidString: idString),
                      let name = entry["name"] as? String else {
                    return nil
                }
                let updatedAt: Date
                if let ts = entry["updatedAt"] as? TimeInterval {
                    updatedAt = Date(timeIntervalSince1970: ts)
                } else {
                    updatedAt = Date()
                }
                return CustomHabitConfiguration(id: uuid, name: name, updatedAt: updatedAt)
            }
            if !configs.isEmpty {
                customHabits = configs
                CustomHabitStore.shared.saveAll(configs)
                customHabit = configs.first
            }
        }
        
        if let customSchedulesPayload = payload["customHabitSchedules"] as? [String: [String: Int]] {
            customHabitSchedules = customSchedulesPayload.compactMapKeys { UUID(uuidString: $0) }
                .mapValues { decodeComponents(from: $0) }
            saveCustomHabitSchedules()
            Task { await applyCustomSchedulesToScheduler() }
        }
        
        if let customFollowups = payload["customHabitFollowupCounts"] as? [String: Int] {
            customHabitFollowupCounts = customFollowups.compactMapKeys { UUID(uuidString: $0) }
                .mapValues { bounded($0) }
            saveCustomFollowupCounts()
            Task { await applyCustomSchedulesToScheduler() }
        }
        
        // サーバーにデータがあれば、オンボーディングを完全にスキップしてメイン画面へ直行
        if !habitSchedules.isEmpty && !isOnboardingComplete {
            isOnboardingComplete = true
            defaults.set(true, forKey: onboardingKey)
            // .completion ではなく、onboardingStepKeyを削除してメイン画面へ直行
            defaults.removeObject(forKey: onboardingStepKey)
            // Note: ContentView は isOnboardingComplete == true でメイン画面を表示
        }
    }
    
    private func updateHabitNotifications() async {
        await scheduler.applySchedules(habitSchedules)
    }
    
    // 後方互換性のため残す
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
    
    // MARK: - Phase-7: Sensor Access State
    
    private static func loadSensorAccess(from defaults: UserDefaults, key: String) -> SensorAccessState {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) else {
            return .default
        }
        return decoded
    }
    
    private func saveSensorAccess() {
        if let data = try? JSONEncoder().encode(sensorAccess) {
            defaults.set(data, forKey: sensorAccessKey)
        }
    }
    
    // MARK: - Phase-7: integration toggles entry points (quiet fallback)
    
    func setScreenTimeEnabled(_ enabled: Bool) {
        sensorAccess.screenTimeEnabled = enabled
        saveSensorAccess()
    }
    
    func setSleepEnabled(_ enabled: Bool) {
        sensorAccess.sleepEnabled = enabled
        saveSensorAccess()
    }
    
    func setStepsEnabled(_ enabled: Bool) {
        sensorAccess.stepsEnabled = enabled
        saveSensorAccess()
    }
    
    func setMotionEnabled(_ enabled: Bool) {
        sensorAccess.motionEnabled = enabled
        saveSensorAccess()
    }
    
    func updateScreenTimePermission(_ status: SensorPermissionStatus) {
        sensorAccess.screenTime = status
        if status != .authorized { sensorAccess.screenTimeEnabled = false }
        saveSensorAccess()
    }
    
    func updateHealthKitPermission(_ status: SensorPermissionStatus) {
        sensorAccess.healthKit = status
        if status != .authorized {
            sensorAccess.sleepEnabled = false
            sensorAccess.stepsEnabled = false
        }
        saveSensorAccess()
    }
    
    func updateMotionPermission(_ status: SensorPermissionStatus) {
        sensorAccess.motion = status
        if status != .authorized { sensorAccess.motionEnabled = false }
        saveSensorAccess()
    }
}

extension AuthStatus {
    var accessToken: String? {
        switch self {
        case .signedIn(let c): return c.jwtAccessToken
        default: return nil
        }
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
