import Foundation
import BackgroundTasks
import os

/// Sends daily aggregates to backend (daily_metrics).
/// Target time: ~03:00 UTC, but iOS scheduling is best-effort.
@MainActor
final class MetricsUploader {
    static let shared = MetricsUploader()
    private init() {}

    private let logger = Logger(subsystem: "com.anicca.ios", category: "MetricsUploader")
    
    /// BGTask identifier (must be in BGTaskSchedulerPermittedIdentifiers).
    static let taskId = "com.anicca.metrics.daily"
    
    private let lastUploadKey = "com.anicca.metrics.lastUploadDate"
    
    /// Register the background task handler (call once at app launch in AppDelegate)
    func registerBGTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskId, using: nil) { task in
            Task { @MainActor in
                await self.handleBGTask(task as! BGProcessingTask)
            }
        }
    }

    func scheduleNextIfPossible() {
        let request = BGProcessingTaskRequest(identifier: Self.taskId)
        // Target ~03:00 UTC next day
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        if let tomorrow3am = calendar.nextDate(after: Date(), matching: DateComponents(hour: 3, minute: 0), matchingPolicy: .nextTime) {
            request.earliestBeginDate = tomorrow3am
        } else {
            request.earliestBeginDate = Date().addingTimeInterval(3600 * 6)
        }
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Scheduled daily metrics upload for \(request.earliestBeginDate?.description ?? "unknown")")
        } catch {
            logger.error("Failed to schedule metrics upload: \(error.localizedDescription)")
        }
    }
    
    private func handleBGTask(_ task: BGProcessingTask) async {
        task.expirationHandler = { [weak self] in
            self?.logger.warning("BGTask expired before completion")
        }
        
        await runUploadIfDue()
        task.setTaskCompleted(success: true)
        scheduleNextIfPossible()
    }

    func runUploadIfDue(force: Bool = false) async {
        // Skip if not signed in
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            logger.info("Skipping metrics upload: not signed in")
            return
        }
        
        // Check if already uploaded today (unless force is true)
        if !force {
            let lastUpload = UserDefaults.standard.object(forKey: lastUploadKey) as? Date
            if let last = lastUpload, Calendar.current.isDateInToday(last) {
                logger.info("Already uploaded today, skipping")
                return
            }
        }
        
        // Gather data from enabled sensors
        var payload: [String: Any] = [
            "date": ISO8601DateFormatter().string(from: Date()),
            "timezone": TimeZone.current.identifier
        ]
        
        // v3.1: activity_summary を構築
        var activitySummary: [String: Any] = [:]
        
        let sensorAccess = AppState.shared.sensorAccess
        let shouldCollectSleep = sensorAccess.sleepEnabled && sensorAccess.sleepAuthorized
        let shouldCollectSteps = sensorAccess.stepsEnabled && sensorAccess.stepsAuthorized
        
        // v3: source of truth is AppState.sensorAccess (persisted as com.anicca.sensorAccessState)
        var healthData: HealthKitManager.DailySummary?
        if shouldCollectSleep || shouldCollectSteps {
            healthData = await HealthKitManager.shared.fetchDailySummary()
            if let sleep = healthData?.sleepMinutes {
                payload["sleep_minutes"] = sleep
            }
            if let steps = healthData?.steps {
                payload["steps"] = steps
            }
            // v3: 睡眠の開始/終了時刻を推定して送信（Behavior timeline用）
            if let sleepStart = healthData?.sleepStartAt {
                payload["sleep_start_at"] = ISO8601DateFormatter().string(from: sleepStart)
            }
            if let wakeAt = healthData?.wakeAt {
                payload["wake_at"] = ISO8601DateFormatter().string(from: wakeAt)
            }
            
            // v3.1: ワークアウトセッションを activity_summary に追加
            if let sessions = healthData?.workoutSessions, !sessions.isEmpty {
                let walkRunSessions = sessions.map { session -> [String: Any] in
                    return [
                        "startAt": ISO8601DateFormatter().string(from: session.startAt),
                        "endAt": ISO8601DateFormatter().string(from: session.endAt),
                        "type": session.type,
                        "totalMinutes": session.totalMinutes
                    ]
                }
                activitySummary["walkRunSessions"] = walkRunSessions
            }
        }
        
        // ScreenTime API removed for App Store compliance
        
        // Movement/Sedentary (if enabled)
        if sensorAccess.motionEnabled && sensorAccess.motionAuthorized {
            let motionData = await MotionManager.shared.fetchDailySummary()
            if let sedentary = motionData.sedentaryMinutes {
                payload["sedentary_minutes"] = sedentary
            }
        }
        
        // v3.1: activity_summary が空でなければ送信
        if !activitySummary.isEmpty {
            payload["activity_summary"] = activitySummary
        }
        
        // ★ デバッグログ追加
        logger.info("MetricsUploader: Payload keys: \(payload.keys.joined(separator: ", "))")
        if let sleepStart = payload["sleep_start_at"] {
            logger.info("MetricsUploader: sleep_start_at = \(String(describing: sleepStart))")
        }
        if let wakeAt = payload["wake_at"] {
            logger.info("MetricsUploader: wake_at = \(String(describing: wakeAt))")
        }
        if let activitySummary = payload["activity_summary"] as? [String: Any] {
            logger.info("MetricsUploader: activity_summary keys: \(activitySummary.keys.joined(separator: ", "))")
            if let snsSessions = activitySummary["snsSessions"] as? [[String: Any]] {
                logger.info("MetricsUploader: snsSessions count: \(snsSessions.count)")
            }
        }
        
        // POST to backend
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/daily_metrics"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                UserDefaults.standard.set(Date(), forKey: lastUploadKey)
                logger.info("Daily metrics uploaded successfully with activity_summary")
            }
        } catch {
            logger.error("Failed to upload metrics: \(error.localizedDescription)")
        }
    }
}
