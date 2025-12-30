import Foundation
import Combine
import UIKit
import SwiftUI
import RevenueCat
import OSLog

// MARK: - HabitStreakData
struct HabitStreakData: Codable {
    var lastCompletedDate: Date?
    var currentStreak: Int
    
    init() {
        self.lastCompletedDate = nil
        self.currentStreak = 0
    }
}

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
    @Published private(set) var cachedOffering: Offering?
    @Published private(set) var customHabit: CustomHabitConfiguration?
    // 変更: カスタム習慣を配列で管理
    @Published private(set) var customHabits: [CustomHabitConfiguration] = []
    @Published private(set) var customHabitSchedules: [UUID: DateComponents] = [:]
    private(set) var shouldStartSessionImmediately = false
    @Published private(set) var hasSeenWakeSilentTip: Bool = false
    
    // MARK: - Habit Streaks
    @Published private(set) var habitStreaks: [String: HabitStreakData] = [:]
    @Published var pendingMilestone: (habitName: String, streak: Int)? = nil
    private let milestones: Set<Int> = [7, 14, 21, 30, 60, 90, 100, 365]
    
    // Phase-7: sensor permissions + integration toggles
    @Published private(set) var sensorAccess: SensorAccessState
    private(set) var needsSensorRepairAfterOnboarding: Bool = false
    
    enum SensorRepairSource {
        case remoteSync
        case onboardingCompleted
        case explicitUserAction
        case foreground
    }
    
    enum RootTab: Int, Hashable {
        case talk = 0
        case habits = 1      // 新規追加
        case behavior = 2    // 1 → 2
        case profile = 3     // 2 → 3
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
    private let sensorAccessBaseKey = "com.anicca.sensorAccessState"
    private let sensorRepairPendingKey = "com.anicca.sensorRepairPending"
    private let hasSeenWakeSilentTipKey = "com.anicca.hasSeenWakeSilentTip"
    private let habitStreaksKey = "com.anicca.habitStreaks"

    private let scheduler = NotificationScheduler.shared
    private let promptBuilder = HabitPromptBuilder()
    private let sensorLogger = Logger(subsystem: "com.anicca.ios", category: "SensorAccess")
    
    private var pendingHabitPrompt: (habit: HabitType, prompt: String)?
    private var pendingConsultPrompt: String?
    private var pendingAutoResponse: Bool = false
    
    // AlarmKit / LiveActivityIntent → App 本体の起動要求（AppGroup 経由）
    private let pendingHabitLaunchHabitKey = "pending_habit_launch_habit"
    private let pendingHabitLaunchTsKey = "pending_habit_launch_ts"

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
        
        let initialAuthStatus = AuthStatus.signedOut
        self.authStatus = initialAuthStatus
        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: nil)
        self.userProfile = UserProfile()
        self.subscriptionInfo = .free
        self.authStatus = loadUserCredentials()
        if case .signedOut = self.authStatus {
            self.isOnboardingComplete = false
            defaults.set(false, forKey: onboardingKey)
            defaults.removeObject(forKey: onboardingStepKey)
            self.onboardingStep = .welcome
        }
        self.userProfile = loadUserProfile()
        syncPreferredLanguageWithSystem()
        self.subscriptionInfo = loadSubscriptionInfo()
        self.sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: authStatus.userId)
        self.needsSensorRepairAfterOnboarding = defaults.bool(forKey: sensorRepairPendingKey)
        self.customHabit = CustomHabitStore.shared.load()
        
        // カスタム習慣の読み込み
        self.customHabits = CustomHabitStore.shared.loadAll()
        self.customHabitSchedules = loadCustomHabitSchedules()
        
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
        
        // Load habit streaks
        loadHabitStreaks()
        
        Task { [weak self] in
            await self?.refreshSensorAccessAuthorizations(forceReauthIfNeeded: false)
        }
        
        // AlarmKit/Intent 経由の起動要求は、UI初期表示より前に回収して「白画面ラグ」を避ける
        consumePendingHabitLaunchIfAny()
        
        // Sync scheduled alarms on app launch
        Task { await scheduler.applySchedules(habitSchedules) }
        Task { await applyCustomSchedulesToScheduler() }
    }

    /// Intentプロセス（AlarmKit / LiveActivityIntent）からの「会話開始」要求をAppGroupから回収する。
    /// - NOTE: この処理は UI を即表示するため、なるべく早いタイミング（init内）で実行する。
    private func consumePendingHabitLaunchIfAny() {
        // オンボーディング前にセッション画面へ飛ぶのはUX的に破綻するため抑止
        guard isOnboardingComplete else { return }
        
        let defaults = AppGroup.userDefaults
        var queue = defaults.array(forKey: "pending_habit_launch_queue") as? [[String: Any]] ?? []
        var consumed: [[String: Any]] = []
        for entry in queue {
            guard let raw = entry["habit"] as? String,
                  let habit = HabitType(rawValue: raw),
                  let ts = entry["ts"] as? TimeInterval,
                  Date().timeIntervalSince1970 - ts < 300 else { continue }
            // ★ カスタム習慣IDを取得
            let customHabitId = (entry["customHabitId"] as? String).flatMap { UUID(uuidString: $0) }
            prepareForImmediateSession(habit: habit, customHabitId: customHabitId)
            shouldStartSessionImmediately = true
            consumed.append(entry)
            break
        }
        queue.removeAll { candidate in
            guard let ts = candidate["ts"] as? TimeInterval else { return false }
            return consumed.contains(where: { ($0["ts"] as? TimeInterval) == ts })
        }
        defaults.set(queue, forKey: "pending_habit_launch_queue")
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
        return bounded(customHabitFollowupCounts[id] ?? 1)
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
        return 1  // すべての習慣で再通知回数を1に統一
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
    
    // MARK: - Habit Streaks
    
    /// 今日完了済みかを判定
    func isDailyCompleted(for habitId: String) -> Bool {
        guard let data = habitStreaks[habitId],
              let lastDate = data.lastCompletedDate else {
            return false
        }
        return Calendar.current.isDateInToday(lastDate)
    }
    
    /// 現在のストリークを取得（日付変更時の自動更新含む）
    func currentStreak(for habitId: String) -> Int {
        updateStreaksIfNeeded()
        return habitStreaks[habitId]?.currentStreak ?? 0
    }
    
    /// 完了をマーク（ストリーク+1）
    func markDailyCompleted(for habitId: String) {
        updateStreaksIfNeeded()
        
        var data = habitStreaks[habitId] ?? HabitStreakData()
        let today = Calendar.current.startOfDay(for: Date())
        
        // 既に今日完了済みなら何もしない
        if let lastDate = data.lastCompletedDate,
           Calendar.current.isDate(lastDate, inSameDayAs: today) {
            return
        }
        
        // ストリーク計算
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
        
        if let lastDate = data.lastCompletedDate,
           Calendar.current.isDate(lastDate, inSameDayAs: yesterday) {
            // 昨日完了していた → ストリーク継続
            data.currentStreak += 1
        } else {
            // それ以外 → リセットして1から
            data.currentStreak = 1
        }
        
        data.lastCompletedDate = today
        habitStreaks[habitId] = data
        saveHabitStreaks()
        
        // マイルストーン達成チェック
        if milestones.contains(data.currentStreak) {
            let habitName = getHabitDisplayName(for: habitId)
            pendingMilestone = (habitName: habitName, streak: data.currentStreak)
        }
    }
    
    /// 完了を解除（ストリーク-1）
    func unmarkDailyCompleted(for habitId: String) {
        guard var data = habitStreaks[habitId],
              let lastDate = data.lastCompletedDate,
              Calendar.current.isDateInToday(lastDate) else {
            return
        }
        
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Calendar.current.startOfDay(for: Date()))!
        
        if data.currentStreak > 1 {
            data.currentStreak -= 1
            data.lastCompletedDate = yesterday
        } else {
            data.currentStreak = 0
            data.lastCompletedDate = nil
        }
        
        habitStreaks[habitId] = data
        saveHabitStreaks()
    }
    
    /// 日付変更時にストリークを更新（昨日も今日も完了していない場合は0にリセット）
    private func updateStreaksIfNeeded() {
        let today = Calendar.current.startOfDay(for: Date())
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
        var updated = false
        
        for (habitId, var data) in habitStreaks {
            guard let lastDate = data.lastCompletedDate else { continue }
            
            // 今日でも昨日でもなければストリークをリセット
            if !Calendar.current.isDate(lastDate, inSameDayAs: today) &&
               !Calendar.current.isDate(lastDate, inSameDayAs: yesterday) {
                data.currentStreak = 0
                data.lastCompletedDate = nil
                habitStreaks[habitId] = data
                updated = true
            }
        }
        
        if updated {
            saveHabitStreaks()
        }
    }
    
    private func saveHabitStreaks() {
        if let data = try? JSONEncoder().encode(habitStreaks) {
            defaults.set(data, forKey: habitStreaksKey)
        }
    }
    
    private func loadHabitStreaks() {
        guard let data = defaults.data(forKey: habitStreaksKey),
              let decoded = try? JSONDecoder().decode([String: HabitStreakData].self, from: data) else {
            return
        }
        habitStreaks = decoded
    }
    
    private func getHabitDisplayName(for habitId: String) -> String {
        if let habitType = HabitType(rawValue: habitId) {
            return habitType.title
        }
        if let customConfig = customHabits.first(where: { $0.id.uuidString == habitId }) {
            return customConfig.name
        }
        return habitId
    }
    
    // MARK: - Debug Methods for Recording
    #if DEBUG
    /// 撮影用: 指定したストリーク値を強制設定
    func setStreakForRecording(habitId: String, streak: Int, completed: Bool) {
        var data = habitStreaks[habitId] ?? HabitStreakData()
        let today = Calendar.current.startOfDay(for: Date())
        
        if completed {
            data.lastCompletedDate = today
            data.currentStreak = streak
        } else {
            // 未完了だがストリークは表示（昨日まで継続していた状態）
            let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!
            data.lastCompletedDate = yesterday
            data.currentStreak = streak
        }
        
        habitStreaks[habitId] = data
        saveHabitStreaks()
    }
    
    /// 撮影用パターン設定
    func setupRecording(pattern: Int) {
        let customStreaksCompleted = [14, 21, 10, 5]
        let customStreaksUncompleted = [13, 20, 9, 4]
        
        switch pattern {
        case 1: // リスト全体（バラバラ、全チェック済み）
            setStreakForRecording(habitId: "wake", streak: 30, completed: true)
            setStreakForRecording(habitId: "training", streak: 7, completed: true)
            setStreakForRecording(habitId: "bedtime", streak: 30, completed: true)
            for (index, config) in customHabits.enumerated() {
                setStreakForRecording(habitId: config.id.uuidString, streak: customStreaksCompleted[index % 4], completed: true)
            }
            
        case 2: // チェック動作用（全部未完了、タップで+1）
            setStreakForRecording(habitId: "wake", streak: 29, completed: false)
            setStreakForRecording(habitId: "training", streak: 6, completed: false)
            setStreakForRecording(habitId: "bedtime", streak: 29, completed: false)
            for (index, config) in customHabits.enumerated() {
                setStreakForRecording(habitId: config.id.uuidString, streak: customStreaksUncompleted[index % 4], completed: false)
            }
            
        case 4: // 6→7用（7日達成ダイアログ撮影用）
            setStreakForRecording(habitId: "wake", streak: 30, completed: true)
            setStreakForRecording(habitId: "training", streak: 6, completed: false)
            setStreakForRecording(habitId: "bedtime", streak: 30, completed: true)
            for (index, config) in customHabits.enumerated() {
                setStreakForRecording(habitId: config.id.uuidString, streak: customStreaksCompleted[index % 4], completed: true)
            }
            
        case 5: // 全部30日
            setStreakForRecording(habitId: "wake", streak: 30, completed: true)
            setStreakForRecording(habitId: "training", streak: 30, completed: true)
            setStreakForRecording(habitId: "bedtime", streak: 30, completed: true)
            for config in customHabits {
                setStreakForRecording(habitId: config.id.uuidString, streak: 30, completed: true)
            }
            
        default:
            break
        }
    }
    #endif
    
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
        // v3: 完了後はステップ情報を持たない（Habit/All set等の誤表示を根絶）
        defaults.removeObject(forKey: onboardingStepKey)
        Task {
            // 初回ログイン直後に即座に当日分の指標をアップロードして挙動タブを埋める
            await MetricsUploader.shared.runUploadIfDue(force: true)
            MetricsUploader.shared.scheduleNextIfPossible()
            await scheduleSensorRepairIfNeeded(source: .onboardingCompleted)
        }
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
        pendingHabitTrigger = PendingHabitTrigger(
            id: UUID(),
            habit: habit,
            customHabitId: customHabitId,
            customHabitName: customHabitName
        )
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
        pendingHabitTrigger = PendingHabitTrigger(
            id: UUID(),
            habit: habit,
            customHabitId: customHabitId,
            customHabitName: customHabitName
        )
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
    
    func clearShouldStartSessionImmediately() {
        shouldStartSessionImmediately = false
        if pendingHabitTrigger == nil {
            AppGroup.userDefaults.removeObject(forKey: "pending_habit_launch_queue")
        }
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
        
        // App Groups に userId と deviceId を保存（Notification Service Extension 用）
        let appGroupDefaults = AppGroup.userDefaults
        appGroupDefaults.set(credentials.userId, forKey: "userId")
        appGroupDefaults.set(resolveDeviceId(), forKey: "deviceId")
        appGroupDefaults.set(AppConfig.proxyBaseURL.absoluteString, forKey: "ANICCA_PROXY_BASE_URL")

        sensorAccess = Self.loadSensorAccess(from: defaults, key: sensorAccessBaseKey, userId: credentials.userId)
        
        Task { [weak self] in
            await SensorAccessSyncService.shared.fetchLatest()
            await self?.refreshSensorAccessAuthorizations(forceReauthIfNeeded: true)
        }
        
        // Update displayName in profile if empty and Apple provided a name
        // Don't overwrite if credentials.displayName is empty or "User" (user will set it in profile step)
        if userProfile.displayName.isEmpty && !credentials.displayName.isEmpty && credentials.displayName != "User" {
            userProfile.displayName = credentials.displayName
            saveUserProfile()
        }
        Task { await SubscriptionManager.shared.handleLogin(appUserId: credentials.userId) }
        
        // v3: サインイン直後の無条件PUTは既存ユーザー上書き事故がありうるため、
        // 「オンボーディング中 かつ ローカルに入力済みがある」場合のみ同期する
        if !isOnboardingComplete && (!userProfile.ideals.isEmpty || !userProfile.struggles.isEmpty || !userProfile.displayName.isEmpty) {
            Task { await ProfileSyncService.shared.enqueue(profile: userProfile) }
        }
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
    
    /// 通常ログアウト: デバイス権限/連携トグルは維持する（Account deletionとは別）
    func signOutPreservingSensorAccess() {
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
        
        // オンボーディングはサインアウト時に戻す
        isOnboardingComplete = false
        defaults.removeObject(forKey: onboardingKey)
        setOnboardingStep(.welcome)
        
        // UserDefaultsからユーザーデータを削除（sensorAccessBaseKeyは削除しない）
        defaults.removeObject(forKey: userCredentialsKey)
        defaults.removeObject(forKey: userProfileKey)
        defaults.removeObject(forKey: subscriptionKey)
        defaults.removeObject(forKey: habitSchedulesKey)
        defaults.removeObject(forKey: customHabitsKey)
        defaults.removeObject(forKey: customHabitSchedulesKey)
        // ★ sensorAccessBaseKey は削除しない - デバイス権限はユーザーアカウントではなくデバイスに紐づく
        
        // 通知をすべてキャンセル
        Task {
            await scheduler.cancelAll()
        }
        
        // RevenueCatからログアウト
        Task {
            await SubscriptionManager.shared.handleLogout()
        }
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
        defaults.removeObject(forKey: sensorAccessBaseKey)
        
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
        payload["sensorAccess"] = sensorAccessForSync()
        
        return payload
    }
    
    func sensorAccessForSync() -> [String: Bool] {
        return [
            "screenTimeEnabled": sensorAccess.screenTimeEnabled,
            "sleepEnabled": sensorAccess.sleepEnabled,
            "stepsEnabled": sensorAccess.stepsEnabled,
            "motionEnabled": sensorAccess.motionEnabled
        ]
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
    
    var effectiveLanguage: LanguagePreference {
        userProfile.preferredLanguage
    }
    
    private func syncPreferredLanguageWithSystem() {
        let systemLanguage = LanguagePreference.detectDefault()
        guard userProfile.preferredLanguage != systemLanguage else { return }
        userProfile.preferredLanguage = systemLanguage
        saveUserProfile()
        sensorLogger.info("AppState: preferredLanguage synced to \(systemLanguage.rawValue)")
    }
    
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
    
    func updateCustomHabitName(id: UUID, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard let index = customHabits.firstIndex(where: { $0.id == id }) else { return }
        
        let current = customHabits[index]
        guard current.name != trimmed else { return }
        
        let updated = CustomHabitConfiguration(id: current.id, name: trimmed, updatedAt: .now)
        customHabits[index] = updated
        CustomHabitStore.shared.saveAll(customHabits)
        
        // サーバー同期（payloadにcustomHabitsが含まれる）
        Task { await ProfileSyncService.shared.enqueue(profile: userProfile) }
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
            // デバイスの言語設定を優先: サーバーの言語とデバイスの言語が一致する場合のみ適用
            let deviceLanguage = LanguagePreference.detectDefault()
            if deviceLanguage == language {
                profile.preferredLanguage = language
            }
            // 一致しない場合はデバイスの言語を維持（サーバーが間違った言語を返しても上書きしない）
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
            // v3: リモートが空配列ならローカルの非空値を保持（オンボーディングで設定した値が消えない）
            if !ideals.isEmpty || profile.ideals.isEmpty {
                profile.ideals = ideals
            }
        } else if let idealTraits = payload["idealTraits"] as? [String], !idealTraits.isEmpty || profile.ideals.isEmpty {
            profile.ideals = idealTraits
        }
        if let struggles = payload["struggles"] as? [String] {
            if !struggles.isEmpty || profile.struggles.isEmpty {
                profile.struggles = struggles
            }
        } else if let problems = payload["problems"] as? [String], !problems.isEmpty || profile.struggles.isEmpty {
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
        
        if let sensor = payload["sensorAccess"] as? [String: Bool] {
            sensorAccess.screenTimeEnabled = sensor["screenTimeEnabled"] ?? sensorAccess.screenTimeEnabled
            sensorAccess.sleepEnabled = sensor["sleepEnabled"] ?? sensorAccess.sleepEnabled
            sensorAccess.stepsEnabled = sensor["stepsEnabled"] ?? sensorAccess.stepsEnabled
            sensorAccess.motionEnabled = sensor["motionEnabled"] ?? sensorAccess.motionEnabled
            saveSensorAccess()
            Task { await refreshSensorAccessAuthorizations(forceReauthIfNeeded: false) }
        }
        
        // v3: サーバーにデータがあっても、オンボーディング強制完了はしない
        // Mic/Notifications/AlarmKit画面を必ず通すため、isOnboardingCompleteの自動更新を廃止
        // オンボーディング完了は markOnboardingComplete() でのみ行う
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
    
    @MainActor
    func refreshSensorAccessAuthorizations(forceReauthIfNeeded _: Bool) async {
        // HealthKitの書き込み権限ステータスを確認（参考値として）
#if canImport(HealthKit)
        // 読み取り権限は正確に判定できないため、ローカルに保存された状態を維持
        // ユーザーがシステム設定から明示的に権限を取り消した場合のみfalseにする
        // しかし、HealthKitはこれを検出する手段を提供していないため、
        // 一度許可された状態は維持する
        let sleepAuthorized = sensorAccess.sleepAuthorized  // ← 既存のローカル状態を使用
        let stepsAuthorized = sensorAccess.stepsAuthorized  // ← 既存のローカル状態を使用
#else
        let sleepAuthorized = false
        let stepsAuthorized = false
#endif
#if canImport(FamilyControls)
        let screenTimeAuthorized = ScreenTimeManager.shared.isAuthorized
#else
        let screenTimeAuthorized = false
#endif

        var next = sensorAccess
        let wantedSleep = next.sleepEnabled
        let wantedSteps = next.stepsEnabled
        let wantedScreen = next.screenTimeEnabled

        next.sleepAuthorized = sleepAuthorized
        next.stepsAuthorized = stepsAuthorized
        next.screenTimeAuthorized = screenTimeAuthorized
        next.healthKit = (sleepAuthorized || stepsAuthorized) ? .authorized : .denied
        next.screenTime = screenTimeAuthorized ? .authorized : .denied

        // keep user intent; data収集は *Enabled && *Authorized でゲート
        next.sleepEnabled = wantedSleep
        next.stepsEnabled = wantedSteps
        next.screenTimeEnabled = wantedScreen

        if next != sensorAccess {
            sensorAccess = next
            saveSensorAccess()
            scheduleSensorAccessSync(next)
        }

        let needsRefresh = (next.sleepEnabled && next.sleepAuthorized)
            || (next.stepsEnabled && next.stepsAuthorized)
            || (next.screenTimeEnabled && next.screenTimeAuthorized)
        if needsRefresh {
            await MetricsUploader.shared.runUploadIfDue(force: true)
        }
    }

    // MARK: - Phase-7: Sensor Access State
    
    private static func loadSensorAccess(from defaults: UserDefaults, key: String, userId: String?) -> SensorAccessState {
        if let userId,
           let data = defaults.data(forKey: "\(key).\(userId)"),
           let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) {
            return decoded
        }
        if let data = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(SensorAccessState.self, from: data) {
            return decoded
        }
        return .default
    }
    
    private func saveSensorAccess(for userId: String? = nil) {
        let key = sensorAccessStorageKey(for: userId ?? currentUserId)
        if let data = try? JSONEncoder().encode(sensorAccess) {
            defaults.set(data, forKey: key)
        }
    }

    func mergeRemoteSensorAccess(sleep: Bool, steps: Bool, screenTime: Bool, motion: Bool) {
        var next = sensorAccess
        if sleep { next.sleepEnabled = true }
        if steps { next.stepsEnabled = true }
        if screenTime { next.screenTimeEnabled = true }
        if motion { next.motionEnabled = true }
        sensorAccess = next
        saveSensorAccess()
        Task {
            await refreshSensorAccessAuthorizations(forceReauthIfNeeded: false)
            await scheduleSensorRepairIfNeeded(source: .remoteSync)
        }
    }

    private func sensorAccessStorageKey(for userId: String?) -> String {
        guard let userId, !userId.isEmpty else { return sensorAccessBaseKey }
        return "\(sensorAccessBaseKey).\(userId)"
    }

    private var currentUserId: String? {
        authStatus.userId
    }
    
    // MARK: - Phase-7: integration toggles entry points (quiet fallback)
    
    func setScreenTimeEnabled(_ enabled: Bool) {
        sensorAccess.screenTimeEnabled = enabled
        saveSensorAccess()
        Task {
            await ProfileSyncService.shared.enqueue(profile: userProfile, sensorAccess: sensorAccessForSync())
        }
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setSleepEnabled(_ enabled: Bool) {
        sensorAccess.sleepEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setStepsEnabled(_ enabled: Bool) {
        sensorAccess.stepsEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateSleepAuthorizationStatus(_ authorized: Bool) {
        sensorAccess.sleepAuthorized = authorized
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateStepsAuthorizationStatus(_ authorized: Bool) {
        sensorAccess.stepsAuthorized = authorized
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func setMotionEnabled(_ enabled: Bool) {
        sensorAccess.motionEnabled = enabled
        saveSensorAccess()
        scheduleSensorAccessSync(sensorAccess)
    }
    
    func updateScreenTimePermission(_ status: SensorPermissionStatus) {
        sensorAccess.screenTime = status
        if status != .authorized { sensorAccess.screenTimeEnabled = false }
        saveSensorAccess()
    }
    
    func updateHealthKitPermission(_ status: SensorPermissionStatus) {
        sensorAccess.healthKit = status
        // 権限を失ってもトグル意図は保持する
        saveSensorAccess()
    }
    
    func updateMotionPermission(_ status: SensorPermissionStatus) {
        sensorAccess.motion = status
        if status != .authorized { sensorAccess.motionEnabled = false }
        saveSensorAccess()
    }
    
    private func scheduleSensorAccessSync(_ access: SensorAccessState) {
        Task.detached(priority: .utility) { [access] in
            await SensorAccessSyncService.shared.sync(access: access)
        }
    }
    
    func updateSensorAccess(_ access: SensorAccessState) {
        sensorAccess = access
        saveSensorAccess()
        scheduleSensorAccessSync(access)
    }
    
    func scheduleSensorRepairIfNeeded(source: SensorRepairSource) async {
        let needsRepairNow = (sensorAccess.sleepEnabled && !sensorAccess.sleepAuthorized)
            || (sensorAccess.stepsEnabled && !sensorAccess.stepsAuthorized)
        if needsRepairNow {
            persistSensorRepairPending()
            sensorLogger.info("HealthKit authorization missing while enabled (source=\(String(describing: source)))")
        } else {
            clearSensorRepairPending()
        }
    }
    
    private func persistSensorRepairPending(_ value: Bool = true) {
        needsSensorRepairAfterOnboarding = value
        defaults.set(value, forKey: sensorRepairPendingKey)
    }
    
    private func clearSensorRepairPending() {
        persistSensorRepairPending(false)
    }
}

extension AuthStatus {
    var accessToken: String? {
        switch self {
        case .signedIn(let c): return c.jwtAccessToken
        default: return nil
        }
    }

    var userId: String? {
        switch self {
        case .signedIn(let c): return c.userId
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
