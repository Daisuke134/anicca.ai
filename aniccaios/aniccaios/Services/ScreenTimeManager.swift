import Foundation
import os
import FamilyControls

@MainActor
final class ScreenTimeManager {
    static let shared = ScreenTimeManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ScreenTimeManager")
    
    struct DailySummary {
        var totalMinutes: Int?
    }
    
    /// Check if Screen Time is authorized
    var isAuthorized: Bool {
        AuthorizationCenter.shared.authorizationStatus == .approved
    }
    
    /// Request Screen Time authorization using FamilyControls API
    func requestAuthorization() async -> Bool {
        do {
            // Request authorization for individual (not child)
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            logger.info("ScreenTime authorization granted")
            return true
        } catch let error as FamilyControlsError {
            switch error {
            case .restricted:
                logger.error("ScreenTime authorization restricted - parental controls may be blocking this")
            case .unavailable:
                logger.error("ScreenTime authorization unavailable - FamilyControls framework not set up")
            case .authorizationCanceled:
                logger.info("ScreenTime authorization canceled by user")
            case .networkError:
                logger.error("ScreenTime authorization failed - network error")
            @unknown default:
                logger.error("ScreenTime authorization failed: \(error)")
            }
            return false
        } catch {
            logger.error("ScreenTime authorization failed: \(error.localizedDescription)")
            return false
        }
    }
    
    func fetchDailySummary() async -> DailySummary {
        // DeviceActivityReport extension is needed to get actual screen time data
        // For now, return nil as placeholder
        return DailySummary(totalMinutes: nil)
    }
}
