import Foundation
import CoreMotion
import os

@MainActor
final class MotionManager {
    static let shared = MotionManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "MotionManager")
    private let activityManager = CMMotionActivityManager()
    private let pedometer = CMPedometer()
    
    struct DailySummary {
        var sedentaryMinutes: Int?
    }
    
    var isAuthorized: Bool {
        CMMotionActivityManager.isActivityAvailable()
    }
    
    func requestAuthorization() async -> Bool {
        guard CMMotionActivityManager.isActivityAvailable() else {
            logger.warning("Motion activity not available on this device")
            return false
        }
        
        // Request by starting a query - this triggers the permission dialog
        return await withCheckedContinuation { continuation in
            let now = Date()
            let oneHourAgo = now.addingTimeInterval(-3600)
            
            activityManager.queryActivityStarting(from: oneHourAgo, to: now, to: .main) { [weak self] activities, error in
                if let error = error as NSError?,
                   error.domain == CMErrorDomain,
                   error.code == Int(CMErrorMotionActivityNotAuthorized.rawValue) {
                    self?.logger.error("Motion authorization denied")
                    continuation.resume(returning: false)
                } else if error == nil {
                    self?.logger.info("Motion authorization granted")
                    continuation.resume(returning: true)
                } else {
                    // その他のエラーの場合もfalseを返す
                    self?.logger.error("Motion query error: \(error!.localizedDescription)")
                    continuation.resume(returning: false)
                }
            }
        }
    }
    
    func fetchDailySummary() async -> DailySummary {
        guard CMMotionActivityManager.isActivityAvailable() else {
            return DailySummary(sedentaryMinutes: nil)
        }
        
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        
        return await withCheckedContinuation { continuation in
            activityManager.queryActivityStarting(from: startOfDay, to: now, to: .main) { [weak self] activities, error in
                if let error = error {
                    self?.logger.error("Failed to fetch motion data: \(error.localizedDescription)")
                    continuation.resume(returning: DailySummary(sedentaryMinutes: nil))
                    return
                }
                
                guard let activities = activities, !activities.isEmpty else {
                    continuation.resume(returning: DailySummary(sedentaryMinutes: nil))
                    return
                }
                
                // Calculate sedentary time (stationary activities)
                var sedentarySeconds: TimeInterval = 0
                for i in 0..<(activities.count - 1) {
                    let current = activities[i]
                    let next = activities[i + 1]
                    if current.stationary {
                        sedentarySeconds += next.startDate.timeIntervalSince(current.startDate)
                    }
                }
                
                // Handle last activity to now
                if let last = activities.last, last.stationary {
                    sedentarySeconds += now.timeIntervalSince(last.startDate)
                }
                
                continuation.resume(returning: DailySummary(sedentaryMinutes: Int(sedentarySeconds / 60)))
            }
        }
    }
    
    /// ユーザーが有効化済みかつ認証済みの場合にモーション監視を開始
    func startIfEnabled() {
        guard CMMotionActivityManager.isActivityAvailable() else {
            logger.warning("Motion activity not available on this device")
            return
        }
        
        // 認証状態を確認
        let authStatus = CMMotionActivityManager.authorizationStatus()
        guard authStatus == .authorized else {
            logger.warning("Motion activity not authorized. Status: \(String(describing: authStatus.rawValue))")
            return
        }
        
        // モーション更新を開始
        activityManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let activity = activity else { return }
            
            // 信頼度が低い場合はスキップ
            guard activity.confidence != .low else { return }
            
            // モーション状態に応じた処理（将来的に実装）
            // 例: 座位時間の計測、NudgeTriggerServiceへの通知など
            if activity.stationary {
                self?.logger.debug("Motion: stationary")
            } else if activity.walking || activity.running {
                self?.logger.debug("Motion: walking/running")
            }
        }
        
        logger.info("Motion activity updates started")
    }
    
    /// モーション監視を停止
    func stop() {
        activityManager.stopActivityUpdates()
        logger.info("Motion activity updates stopped")
    }
}

