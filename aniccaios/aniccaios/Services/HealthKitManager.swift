import Foundation
import HealthKit
import os

@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "HealthKitManager")
    private let healthStore = HKHealthStore()
    
    // v3.1: ワークアウトセッション構造体を追加
    struct WorkoutSession: Codable {
        let startAt: Date
        let endAt: Date
        let type: String  // "walk", "run", "workout"
        let totalMinutes: Int
    }
    
    struct DailySummary {
        var sleepMinutes: Int?
        var steps: Int?
        // v3: Behavior timeline用の睡眠開始/終了時刻
        var sleepStartAt: Date?
        var wakeAt: Date?
        var workoutSessions: [WorkoutSession]?  // v3.1: 追加
    }
    
    var isAuthorized: Bool {
        HKHealthStore.isHealthDataAvailable()
    }
    
    // v3: 従来の両方リクエスト（後方互換）+ ワークアウト追加
    func requestAuthorization() async -> Bool {
        var typesToRead: Set<HKObjectType> = [
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!
        ]
        // v3.1: ワークアウトタイプを追加
        typesToRead.insert(HKObjectType.workoutType())
        return await requestAuthorizationFor(types: typesToRead)
    }
    
    // v3: Sleepのみ許可リクエスト
    func requestSleepAuthorization() async -> Bool {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return false
        }
        return await requestAuthorizationFor(types: [sleepType])
    }
    
    // v3: Stepsのみ許可リクエスト
    func requestStepsAuthorization() async -> Bool {
        guard let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            return false
        }
        return await requestAuthorizationFor(types: [stepsType])
    }
    
    private func requestAuthorizationFor(types: Set<HKObjectType>) async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            logger.warning("HealthKit not available on this device")
            return false
        }
        
        do {
            try await healthStore.requestAuthorization(toShare: [], read: types)
            logger.info("HealthKit authorization granted")
            return true
        } catch {
            logger.error("HealthKit authorization failed: \(error.localizedDescription)")
            return false
        }
    }
    
    // MARK: - Authorization Status Check
    
    /// 睡眠データが既に認可されているかチェック
    func isSleepAuthorized() -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return false }
        return healthStore.authorizationStatus(for: sleepType) == .sharingAuthorized
    }
    
    /// 歩数データが既に認可されているかチェック
    func isStepsAuthorized() -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        guard let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return false }
        return healthStore.authorizationStatus(for: stepsType) == .sharingAuthorized
    }
    
    /// ワークアウトデータが既に認可されているかチェック
    func isWorkoutAuthorized() -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let workoutType = HKObjectType.workoutType()
        return healthStore.authorizationStatus(for: workoutType) == .sharingAuthorized
    }
    
    func fetchDailySummary() async -> DailySummary {
        var summary = DailySummary()
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        // ★ 睡眠クエリ用: 前日18:00から取得（夜22時に寝て朝6時に起きるパターンを捕捉）
        let sleepQueryStart = calendar.date(byAdding: .hour, value: -6, to: startOfDay)!
        
        // Fetch sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            // ★ .strictStartDate を削除し、範囲と重なるすべてのサンプルを取得
            let predicate = HKQuery.predicateForSamples(withStart: sleepQueryStart, end: endOfDay, options: [])
            let sleepSamples = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
                let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                    }
                }
                healthStore.execute(query)
            }
            
            if let samples = sleepSamples {
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                ]
                let inBedValue = HKCategoryValueSleepAnalysis.inBed.rawValue
                
                // ★ 今日の起床時刻（=今日の日付で終了したサンプル）のみを対象にフィルタリング
                var todayAsleepSamples = samples.filter { sample in
                    asleepValues.contains(sample.value) && sample.endDate >= startOfDay
                }
                
                // フォールバック: asleep が無い端末は inBed を使う
                if todayAsleepSamples.isEmpty {
                    todayAsleepSamples = samples.filter { sample in
                        sample.value == inBedValue && sample.endDate >= startOfDay
                    }
                }
                
                let totalSleepSeconds = todayAsleepSamples
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                summary.sleepMinutes = Int(totalSleepSeconds / 60)
                
                // v3: 睡眠の開始/終了時刻を推定
                if !todayAsleepSamples.isEmpty {
                    // 最も早い開始時刻を sleepStartAt（昨夜の就寝時刻）
                    summary.sleepStartAt = todayAsleepSamples.map { $0.startDate }.min()
                    // 最も遅い終了時刻を wakeAt（今朝の起床時刻）
                    summary.wakeAt = todayAsleepSamples.map { $0.endDate }.max()
                }
                
                logger.info("Sleep query: found \(samples.count) samples, \(todayAsleepSamples.count) for today, duration=\(summary.sleepMinutes ?? 0)min")
            }
        }
        
        // Fetch steps
        if let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) {
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
            let steps = try? await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Double, Error>) in
                let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        let sum = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
                        continuation.resume(returning: sum)
                    }
                }
                healthStore.execute(query)
            }
            
            if let steps = steps {
                summary.steps = Int(steps)
            }
        }
        
        // v3.1: Fetch workouts (only if authorized)
        guard isWorkoutAuthorized() else {
            return summary
        }
        let workoutType = HKObjectType.workoutType()
        let workoutPredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
        
        do {
            let workouts = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKWorkout], Error>) in
                let query = HKSampleQuery(
                    sampleType: workoutType,
                    predicate: workoutPredicate,
                    limit: HKObjectQueryNoLimit,
                    sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
                ) { _, samples, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: samples as? [HKWorkout] ?? [])
                    }
                }
                healthStore.execute(query)
            }
            
            summary.workoutSessions = workouts.map { workout in
                let type: String
                switch workout.workoutActivityType {
                case .walking: type = "walk"
                case .running: type = "run"
                case .cycling: type = "cycling"
                case .swimming: type = "swimming"
                case .yoga: type = "yoga"
                case .functionalStrengthTraining, .traditionalStrengthTraining: type = "strength"
                case .highIntensityIntervalTraining: type = "hiit"
                default: type = "workout"
                }
                return WorkoutSession(
                    startAt: workout.startDate,
                    endAt: workout.endDate,
                    type: type,
                    totalMinutes: Int(workout.duration / 60)
                )
            }
            logger.info("Fetched \(workouts.count) workout sessions")
        } catch {
            logger.error("Failed to fetch workouts: \(error.localizedDescription)")
        }
        
        return summary
    }
    
    /// アプリ起動時に、ユーザーが有効化済みかつ認証済みの場合にHealthKitの監視を設定
    func configureOnLaunchIfEnabled() {
        // ユーザーが有効化しているかどうかはAppStateから確認する必要がある
        // ここでは基本的な認証状態のみを確認
        guard HKHealthStore.isHealthDataAvailable() else {
            logger.info("HealthKit not available on this device")
            return
        }
        
        // 認証状態を確認
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)
        
        if let sleepType = sleepType {
            let sleepStatus = healthStore.authorizationStatus(for: sleepType)
            logger.info("Sleep authorization status: \(String(describing: sleepStatus.rawValue))")
        }
        
        if let stepsType = stepsType {
            let stepsStatus = healthStore.authorizationStatus(for: stepsType)
            logger.info("Steps authorization status: \(String(describing: stepsStatus.rawValue))")
        }
        
        // 将来的に監視を開始する場合はここに実装を追加
        // 現時点ではログ出力のみ
    }
}

