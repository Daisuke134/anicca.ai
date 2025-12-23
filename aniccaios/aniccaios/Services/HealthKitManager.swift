import Foundation
import HealthKit
import os

@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "HealthKitManager")
    private let healthStore = HKHealthStore()
    
    struct DailySummary {
        var sleepMinutes: Int?
        var steps: Int?
        // v3: Behavior timeline用の睡眠開始/終了時刻
        var sleepStartAt: Date?
        var wakeAt: Date?
    }
    
    var isAuthorized: Bool {
        HKHealthStore.isHealthDataAvailable()
    }
    
    // v3: 従来の両方リクエスト（後方互換）
    func requestAuthorization() async -> Bool {
        let typesToRead: Set<HKObjectType> = [
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!
        ]
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
    
    func fetchDailySummary() async -> DailySummary {
        var summary = DailySummary()
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        // Fetch sleep
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
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
                let totalSleepSeconds = samples
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                summary.sleepMinutes = Int(totalSleepSeconds / 60)
                
                // v3: 睡眠の開始/終了時刻を推定
                let asleepSamples = samples.filter { asleepValues.contains($0.value) }
                if !asleepSamples.isEmpty {
                    // 最も早い開始時刻を sleepStartAt
                    summary.sleepStartAt = asleepSamples.map { $0.startDate }.min()
                    // 最も遅い終了時刻を wakeAt
                    summary.wakeAt = asleepSamples.map { $0.endDate }.max()
                }
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

