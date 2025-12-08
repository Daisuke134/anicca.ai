#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import AVFoundation
import Foundation
import OSLog
import SwiftUI
import UIKit

// MARK: - AlarmButton Extension
@available(iOS 26.0, *)
extension AlarmButton {
    static var stopButton: AlarmButton {
        AlarmButton(
            text: LocalizedStringResource("Stop"),
            textColor: .red,
            systemImageName: "stop.circle"
        )
    }
    
    static var openAppButton: AlarmButton {
        AlarmButton(
            text: LocalizedStringResource("Open"),
            textColor: .white,
            systemImageName: "arrow.up.forward.app"
        )
    }
    
    static var repeatButton: AlarmButton {
        AlarmButton(
            text: LocalizedStringResource("Repeat"),
            textColor: .orange,
            systemImageName: "arrow.clockwise"
        )
    }
}

// MARK: - Locale.Weekday Extension
@available(iOS 26.0, *)
extension Locale.Weekday {
    static var allWeekdays: [Locale.Weekday] {
        [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
    }
}

// MARK: - AlarmKitHabitCoordinator
@available(iOS 26.0, *)
final class AlarmKitHabitCoordinator {
    static let shared = AlarmKitHabitCoordinator()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AlarmKitHabit")
    private let manager = AlarmManager.shared
    private var audioPlayer: AVAudioPlayer?
    private var alarmMonitorTask: Task<Void, Never>?
    @MainActor private var currentAlertingHabit: HabitType?
    
    // Storage keys for each habit
    private func storageKey(for habit: HabitType) -> String {
        "com.anicca.alarmkit.\(habit.rawValue).ids"
    }
    
    private init() {
        startAlarmMonitoring()
    }
    
    deinit {
        alarmMonitorTask?.cancel()
    }
    
    /// AlarmKitアラームの状態変化を監視
    /// 出典: mfaani.com "You can rely on the ActivityUpdates for changes in content"
    private func startAlarmMonitoring() {
        alarmMonitorTask = Task { [weak self] in
            // AlarmManager.alarmUpdates は AsyncSequence（Apple Doc確認済み）
            for await alarms in AlarmManager.shared.alarmUpdates {
                guard let self = self else { break }
                
                // アラームが alerting 状態になった = 発火した
                // AlarmUpdatesはアラームのリストを返すため、発火中のアラームがあるか確認
                for alarm in alarms {
                    if case .alerting = alarm.state {
                        // 発火したアラームのIDから習慣を特定
                        let habit = await MainActor.run {
                            self.findHabitForAlarmId(alarm.id)
                        }
                        await MainActor.run {
                            self.currentAlertingHabit = habit
                            // アプリがフォアグラウンドの場合のみ音を鳴らす
                            // 出典: mfaani.com "It does not show anything" (Dynamic Islandは表示されない)
                            if UIApplication.shared.applicationState == .active {
                                self.playAlarmSoundInApp()
                            }
                        }
                        // 音を鳴らしたらこの更新の処理は終了（重複再生防止）
                        break
                    }
                }
            }
        }
    }
    
    /// アプリ内でアラーム音を再生
    /// 出典: mfaani.com "You need your own UI"
    @MainActor
    private func playAlarmSoundInApp() {
        // フルスクリーンアラームを使う習慣はAlarmKit UIに任せ、ここでは鳴らさない
        guard shouldPlayInApp(for: currentHabit) else { return }
        
        // プロジェクト内の既存アラーム音ファイルを使用
        guard let soundURL = Bundle.main.url(forResource: "Defaul", withExtension: "mp3")
              ?? Bundle.main.url(forResource: "AniccaWake", withExtension: "caf") else {
            logger.warning("Alarm sound file not found in bundle")
            return
        }
        
        do {
            // AVAudioSessionを設定（既存の音声セッションと競合しないようにduckOthers）
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            
            audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
            audioPlayer?.prepareToPlay()
            audioPlayer?.currentTime = 0
            audioPlayer?.play()
            
            // 先頭8秒で強制停止
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                self?.audioPlayer?.stop()
            }
            
            logger.info("Playing alarm sound in-app for foreground AlarmKit alert")
        } catch {
            logger.error("Failed to play alarm sound: \(error.localizedDescription, privacy: .public)")
        }
    }
    
    /// アプリ内でアラーム音を再生すべきか判定
    /// Full Screen Alarm OFF かつサイレント解除時のみ再生
    private func shouldPlayInApp(for habit: HabitType?) -> Bool {
        // TODO: 実装が必要な場合は、AppStateから設定を取得して判定
        // 現時点では常にtrueを返す（既存の動作を維持）
        return true
    }
    
    @MainActor
    private var currentHabit: HabitType? {
        return currentAlertingHabit
    }
    
    /// アラームIDから習慣を特定
    @MainActor
    private func findHabitForAlarmId(_ alarmId: UUID) -> HabitType? {
        for habit in HabitType.allCases {
            let persistedIds = loadPersistedIds(for: habit)
            if persistedIds.contains(alarmId) {
                return habit
            }
        }
        return nil
    }
    
    func requestAuthorizationIfNeeded() async -> Bool {
        do {
            // まず現在の認証状態を確認
            let currentState = manager.authorizationState
            logger.info("Current AlarmKit authorization state: \(String(describing: currentState), privacy: .public)")
            
            if currentState == .authorized {
                return true
            }
            
            if currentState == .denied {
                logger.warning("AlarmKit authorization was denied by user. Please enable in Settings.")
                return false
            }
            
            let state = try await manager.requestAuthorization()
            logger.info("AlarmKit authorization result: \(String(describing: state), privacy: .public)")
            return state == .authorized
        } catch {
            logger.error("AlarmKit authorization failed: \(error.localizedDescription, privacy: .public). Ensure NSAlarmKitUsageDescription is set in Info.plist")
            return false
        }
    }
    
    /// Schedule alarm for a specific habit with repeat functionality
    /// - Parameters:
    ///   - habit: The habit type
    ///   - hour: Alarm hour
    ///   - minute: Alarm minute
    ///   - followupCount: Total number of alarms (1 = single, 5 = 5 alarms at 1-minute intervals)
    func scheduleHabit(_ habit: HabitType, hour: Int, minute: Int, followupCount: Int) async -> Bool {
        do {
            guard await requestAuthorizationIfNeeded() else {
                return false
            }
            await cancelHabitAlarms(habit)
            
            let repeatCount = max(1, min(10, followupCount))
            var scheduledIds: [UUID] = []
            
            // 方式A: 1分ずつずらして repeatCount 個のアラームを個別にスケジュール
            // 例: 22:25設定 + 5回 → 22:25, 22:26, 22:27, 22:28, 22:29 に5つの独立アラーム
            for index in 0..<repeatCount {
                let (fireHour, fireMinute) = offsetMinutes(baseHour: hour, baseMinute: minute, offsetMinutes: index)
                let time = Alarm.Schedule.Relative.Time(hour: fireHour, minute: fireMinute)
                let schedule = Alarm.Schedule.relative(.init(
                    time: time,
                    repeats: .weekly(Locale.Weekday.allWeekdays)
                ))
                
                // 全てのアラームで同じUI: 「アプリを開く」+「スワイプで停止」
                // 「スワイプで停止」はその回のみ停止、次の1分後のアラームは独立して鳴る
                let alert = AlarmPresentation.Alert(
                    title: localizedTitle(for: habit),
                    stopButton: .stopButton,
                    secondaryButton: .openAppButton,
                    secondaryButtonBehavior: .custom
                )
                
                let presentation = AlarmPresentation(alert: alert)
                let metadata = HabitAlarmMetadata(habit: habit.rawValue, repeatCount: repeatCount, alarmIndex: index)
                let tintColor = tintColor(for: habit)
                let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: tintColor)
                
                let secondary = StartConversationIntent()
                secondary.habitType = habit
                
                let identifier = UUID()
                // countdownDuration は nil（スヌーズ機能は使わない、代わりに複数アラームで対応）
                let configuration = AlarmManager.AlarmConfiguration(
                    countdownDuration: nil,
                    schedule: schedule,
                    attributes: attributes,
                    stopIntent: HabitAlarmStopIntent(alarmID: identifier.uuidString, habitRawValue: habit.rawValue),
                    secondaryIntent: secondary
                )
                
                _ = try await manager.schedule(id: identifier, configuration: configuration)
                scheduledIds.append(identifier)
            }
            
            persist(ids: scheduledIds, for: habit)
            logger.info("Scheduled \(repeatCount) AlarmKit alarms for \(habit.rawValue) starting at \(hour):\(minute)")
            return true
        } catch {
            logger.error("AlarmKit scheduling failed for \(habit.rawValue): \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
    
    /// Cancel all alarms for a specific habit
    func cancelHabitAlarms(_ habit: HabitType) async {
        // 1. UserDefaultsから保存されているIDをキャンセル
        let persistedIds = loadPersistedIds(for: habit)
        // 全習慣の既知IDを集める
        let allKnownIds: Set<UUID> = Set(HabitType.allCases.flatMap { loadPersistedIds(for: $0) })
        
        for id in persistedIds {
            do {
                try manager.cancel(id: id)
                logger.info("Cancelled AlarmKit alarm \(id.uuidString, privacy: .public) for \(habit.rawValue, privacy: .public)")
            } catch {
                logger.error("Failed to cancel AlarmKit alarm \(id.uuidString, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        
        // 2. AlarmManagerから現在のアラーム一覧を取得し、ID照合のみで残留アラームをクリーンアップ
        // Alarmインスタンスはconfiguration/attributesを直接持たないため、persistedIdsで突合
        do {
            let currentAlarms = try manager.alarms
            for alarm in currentAlarms {
                if persistedIds.contains(alarm.id) {
                    do {
                        try manager.cancel(id: alarm.id)
                        logger.info("Cancelled orphaned AlarmKit alarm \(alarm.id.uuidString, privacy: .public) for \(habit.rawValue, privacy: .public)")
                    } catch {
                        logger.error("Failed to cancel orphaned alarm: \(error.localizedDescription, privacy: .public)")
                    }
                } else if !allKnownIds.contains(alarm.id) {
                    // どの習慣にも属さない孤児アラーム → 強制キャンセル
                    logger.warning("Cancelling orphan alarm \(alarm.id.uuidString, privacy: .public) not in any habit")
                    do {
                        try manager.cancel(id: alarm.id)
                    } catch {
                        logger.error("Failed to cancel orphan alarm: \(error.localizedDescription, privacy: .public)")
                    }
                } else {
                    logger.debug("Skipping alarm \(alarm.id.uuidString, privacy: .public) - belongs to other habit")
                }
            }
        } catch {
            logger.error("Failed to fetch current alarms: \(error.localizedDescription, privacy: .public)")
        }
        
        // 3. UserDefaultsをクリア
        persist(ids: [], for: habit)
    }
    
    /// Cancel all alarms for all habits
    func cancelAllAlarms() async {
        for habit in HabitType.allCases {
            await cancelHabitAlarms(habit)
        }
    }
    
    // MARK: - Persistence
    
    private func persist(ids: [UUID], for habit: HabitType) {
        let raw = ids.map(\.uuidString)
        UserDefaults.standard.set(raw, forKey: storageKey(for: habit))
    }
    
    private func loadPersistedIds(for habit: HabitType) -> [UUID] {
        guard let stored = UserDefaults.standard.array(forKey: storageKey(for: habit)) as? [String] else {
            return []
        }
        return stored.compactMap(UUID.init(uuidString:))
    }
    
    // MARK: - Helpers
    
    private func offsetMinutes(baseHour: Int, baseMinute: Int, offsetMinutes: Int) -> (Int, Int) {
        let totalMinutes = baseMinute + offsetMinutes
        let minute = totalMinutes % 60
        let hourIncrement = totalMinutes / 60
        let hour = (baseHour + hourIncrement) % 24
        return (hour, minute)
    }
    
    private func localizedTitle(for habit: HabitType) -> LocalizedStringResource {
        // AlarmKitは別プロセスで動作するため、LocalizedStringResourceを直接使用
        // String(localized:)で取得した文字列をLocalizedStringResource(stringLiteral:)に
        // 渡すと、ローカライズキーではなくリテラル文字列として扱われる問題がある
        switch habit {
        case .wake:
            // 直接ローカライズキーを使用
            return LocalizedStringResource("habit_title_wake")
        case .training:
            return LocalizedStringResource("habit_title_training")
        case .bedtime:
            return LocalizedStringResource("habit_title_bedtime")
        case .custom:
            // カスタム習慣はユーザーが設定した名前を使用（動的な値）
            // この場合のみstringLiteralを使用するが、確実にローカライズ済み文字列を取得
            let customName = CustomHabitStore.shared.displayName(
                fallback: String(localized: "habit_title_custom_fallback")
            )
            // カスタム名が空の場合はフォールバック
            if customName.isEmpty {
                return LocalizedStringResource("habit_title_custom_fallback")
            }
            return LocalizedStringResource(stringLiteral: customName)
        }
    }
    
    private func tintColor(for habit: HabitType) -> Color {
        // すべての習慣で統一のオレンジ色を使用
        return .orange
    }
}

// MARK: - Metadata
@available(iOS 26.0, *)
struct HabitAlarmMetadata: AlarmMetadata {
    let habit: String
    let repeatCount: Int
    let alarmIndex: Int
    
    init(habit: String, repeatCount: Int = 1, alarmIndex: Int = 0) {
        self.habit = habit
        self.repeatCount = repeatCount
        self.alarmIndex = alarmIndex
    }
}

// MARK: - Stop Intent
@available(iOS 26.0, *)
struct HabitAlarmStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Habit Alarm"
    
    @Parameter(title: "Alarm ID")
    var alarmID: String
    
    @Parameter(title: "Habit Type")
    var habitRawValue: String
    
    init() {
        self.alarmID = ""
        self.habitRawValue = ""
    }
    
    init(alarmID: String, habitRawValue: String) {
        self.alarmID = alarmID
        self.habitRawValue = habitRawValue
    }
    
    func perform() async throws -> some IntentResult {
        // 停止ボタンが押されたら「この回のアラームのみ」停止
        // 次の1分後に別のアラームがスケジュールされていればそれは独立して鳴る
        // AlarmKitの標準動作: stopIntent は自動的にそのアラームを停止
        let logger = Logger(subsystem: "com.anicca.ios", category: "AlarmKitHabit")
        logger.info("Alarm stopped: id=\(self.alarmID, privacy: .public), habit=\(self.habitRawValue, privacy: .public)")
        // 注: 追加のキャンセル処理は不要。次の時刻のアラームは独立して鳴る。
        return .result()
    }
}
#endif

