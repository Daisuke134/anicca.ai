import Foundation
import Combine

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published private(set) var wakeTime: DateComponents?
    @Published private(set) var isOnboardingComplete: Bool
    @Published private(set) var pendingWakeTrigger: UUID?
    private(set) var shouldStartSessionImmediately = false

    private let defaults = UserDefaults.standard
    private let wakeTimeKey = "com.anicca.wakeTime"
    private let onboardingKey = "com.anicca.onboardingComplete"

    private let scheduler = WakeNotificationScheduler.shared
    private let promptBuilder = WakePromptBuilder()

    private var pendingWakePrompt: String?

    private init() {
        self.wakeTime = Self.loadWakeTime(from: defaults, key: wakeTimeKey)
        self.isOnboardingComplete = defaults.bool(forKey: onboardingKey)
        self.pendingWakeTrigger = nil
    }

    func updateWakeTime(_ date: Date) async {
        let calendar = Calendar.current
        var components = DateComponents()
        components.hour = calendar.component(.hour, from: date)
        components.minute = calendar.component(.minute, from: date)
        components.second = 0

        wakeTime = components
        defaults.set(["hour": components.hour ?? 0, "minute": components.minute ?? 0], forKey: wakeTimeKey)
        defaults.synchronize()

        await scheduler.scheduleWakeNotification(for: components)
    }

    func markOnboardingComplete() {
        guard !isOnboardingComplete else { return }
        isOnboardingComplete = true
        defaults.set(true, forKey: onboardingKey)
        defaults.synchronize()
    }

    func prepareForImmediateSession() {
        pendingWakePrompt = promptBuilder.buildWakePrompt(wakeTime: wakeTime, date: Date())
        pendingWakeTrigger = UUID()
        shouldStartSessionImmediately = true
    }

    func handleWakeTrigger() {
        pendingWakePrompt = promptBuilder.buildWakePrompt(wakeTime: wakeTime, date: Date())
        pendingWakeTrigger = UUID()
    }

    func consumeWakePrompt() -> String? {
        let prompt = pendingWakePrompt
        pendingWakePrompt = nil
        return prompt
    }

    func clearPendingWakeTrigger() {
        pendingWakeTrigger = nil
        shouldStartSessionImmediately = false
    }

    func resetState() {
        wakeTime = nil
        isOnboardingComplete = false
        pendingWakeTrigger = nil
        pendingWakePrompt = nil
        Task {
            await scheduler.cancelWakeNotification()
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
