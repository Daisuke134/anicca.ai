import Foundation
import UserNotifications
import OSLog

final class HabitAlarmScheduler {
    static let shared = HabitAlarmScheduler()
    
    private let center = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "HabitAlarmScheduler")
    private var serverAlarmIds: [HabitType: String] = [:]
    
    private init() {}
    
    // MARK: - Authorization
    
    func requestAuthorization() async -> Bool {
        return await requestNotificationAuthorization()
    }
    
    func alarmAuthorizationState() async -> Bool {
        let settings = await center.notificationSettings()
        return settings.authorizationStatus == .authorized
    }
    
    func requestAuthorizationIfNeeded() async -> Bool {
        let isAuthorized = await alarmAuthorizationState()
        if !isAuthorized {
            return await requestAuthorization()
        }
        return true
    }
    
    private func requestNotificationAuthorization() async -> Bool {
        do {
            let options: UNAuthorizationOptions = [.alert, .sound, .badge]
            return try await center.requestAuthorization(options: options)
        } catch {
            return false
        }
    }
    
    // MARK: - Scheduling
    
    func scheduleAlarms(for schedules: [HabitType: DateComponents]) async {
        await cancelAll()
        
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            logger.warning("Cannot schedule alarms: user not signed in")
            return
        }
        
        // Schedule VoIP alarms via server API
        await scheduleVoIPAlarms(for: schedules, userId: credentials.userId)
        
        // Keep notification alarms as fallback
        await scheduleNotificationAlarms(for: schedules)
    }
    
    private func scheduleVoIPAlarms(for schedules: [HabitType: DateComponents], userId: String) async {
        guard let url = AppConfig.alarmScheduleURL else {
            logger.error("Alarm schedule URL not configured")
            return
        }
        
        let timezone = TimeZone.current.identifier
        
        for (habit, components) in schedules {
            guard let hour = components.hour, let minute = components.minute else { continue }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(userId, forHTTPHeaderField: "user-id")
            request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
            
            let payload: [String: Any] = [
                "habit_type": habit.rawValue,
                "hour": hour,
                "minute": minute,
                "timezone": timezone,
                "repeat_rule": "daily"
            ]
            
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                let (data, response) = try await URLSession.shared.data(for: request)
                
                if let httpResponse = response as? HTTPURLResponse,
                   (200..<300).contains(httpResponse.statusCode),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let alarmId = json["id"] as? String {
                    serverAlarmIds[habit] = alarmId
                    logger.info("Scheduled VoIP alarm for \(habit.rawValue, privacy: .public) at \(hour):\(minute)")
                } else {
                    let errorBody = String(data: data, encoding: .utf8) ?? ""
                    logger.error("Failed to schedule VoIP alarm for \(habit.rawValue, privacy: .public) status: \((response as? HTTPURLResponse)?.statusCode ?? -1) body: \(errorBody, privacy: .public)")
                }
            } catch {
                logger.error("Error scheduling VoIP alarm: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
    
    private func scheduleNotificationAlarms(for schedules: [HabitType: DateComponents]) async {
        var categories: [UNNotificationCategory] = []
        for habit in HabitType.allCases {
            let action = UNNotificationAction(
                identifier: "start_conversation",
                title: "Start Conversation",
                options: [.foreground]
            )
            let category = UNNotificationCategory(
                identifier: habit.notificationIdentifier,
                actions: [action],
                intentIdentifiers: [],
                options: []
            )
            categories.append(category)
        }
        center.setNotificationCategories(Set(categories))
        
        for (habit, components) in schedules {
            let content = UNMutableNotificationContent()
            content.title = habit.title
            content.body = "Tap to talk with Anicca about your \(habit.title.lowercased()) routine."
            content.categoryIdentifier = habit.notificationIdentifier
            content.sound = UNNotificationSound.default
            
            var triggerComponents = components
            triggerComponents.second = 0
            let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComponents, repeats: true)
            
            let request = UNNotificationRequest(
                identifier: habit.notificationIdentifier,
                content: content,
                trigger: trigger
            )
            
            do {
                try await center.add(request)
                NSLog("Scheduled notification alarm for \(habit.rawValue)")
            } catch {
                NSLog("Failed to schedule notification for \(habit.rawValue): %@", error.localizedDescription)
            }
        }
    }
    
    // MARK: - Cancellation
    
    func cancelAll() async {
        // Cancel server-side alarms
        guard case .signedIn = AppState.shared.authStatus else {
            removeAllPendingNotifications()
            return
        }
        
        for alarmId in serverAlarmIds.values {
            await cancelServerAlarm(id: alarmId)
        }
        serverAlarmIds.removeAll()
        
        // Cancel local notifications
        removeAllPendingNotifications()
    }
    
    func cancel(for habit: HabitType) async {
        // Cancel server-side alarm
        if let alarmId = serverAlarmIds[habit] {
            await cancelServerAlarm(id: alarmId)
            serverAlarmIds.removeValue(forKey: habit)
        }
        
        // Cancel local notification
        center.removePendingNotificationRequests(withIdentifiers: [habit.notificationIdentifier])
    }
    
    private func cancelServerAlarm(id: String) async {
        guard let url = AppConfig.alarmScheduleURL?.appendingPathComponent(id) else {
            logger.error("Alarm schedule URL not configured")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        
        if case .signedIn(let credentials) = AppState.shared.authStatus {
            request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
            request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        }
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse,
               (200..<300).contains(httpResponse.statusCode) {
                logger.info("Cancelled server alarm: \(id, privacy: .public)")
            }
        } catch {
            logger.error("Error cancelling server alarm: \(error.localizedDescription, privacy: .public)")
        }
    }
    
    // MARK: - Sync
    
    func syncScheduledAlarms(from schedules: [HabitType: DateComponents]) async {
        _ = await requestAuthorizationIfNeeded()
        await scheduleAlarms(for: schedules)
    }
    
    private func removeAllPendingNotifications() {
        var identifiers: [String] = []
        for habit in HabitType.allCases {
            identifiers.append(habit.notificationIdentifier)
        }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}

