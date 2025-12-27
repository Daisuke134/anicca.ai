import Foundation
import os
import FamilyControls

@MainActor
final class ScreenTimeManager {
    static let shared = ScreenTimeManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ScreenTimeManager")
    private let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()
    
    struct DailySummary {
        var totalMinutes: Int?
        var socialMinutes: Int?
        var lateNightMinutes: Int?
        var snsSessions: [[String: Any]]?  // v3.1: 追加
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
            case .authorizationConflict:
                logger.error("ScreenTime authorization conflict - another app already provides parental controls")
            case .invalidArgument:
                logger.error("ScreenTime authorization failed - invalid argument")
            case .authenticationMethodUnavailable:
                logger.error("ScreenTime authorization failed - device passcode required")
            case .invalidAccountType:
                logger.error("ScreenTime authorization failed - invalid iCloud account")
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
        // v3.1: DeviceActivityReportExtension が App Groups に保存したデータを読み取り
        let key = dateFormatter.string(from: Date())
        if let payload = ScreenTimeSharedStore.load(for: key) {
            logger.info("Loaded ScreenTime payload for \(key)")
            let sessionDicts = payload.sessions.map { session in
                [
                    "startAt": ISO8601DateFormatter().string(from: session.startAt),
                    "endAt": ISO8601DateFormatter().string(from: session.endAt),
                    "category": session.category,
                    "totalMinutes": session.totalMinutes
                ]
            }
            return DailySummary(
                totalMinutes: payload.totalMinutes,
                socialMinutes: payload.socialMinutes,
                lateNightMinutes: payload.lateNightMinutes,
                snsSessions: sessionDicts
            )
        }

        logger.info("No ScreenTime payload yet")
        return DailySummary(totalMinutes: nil, socialMinutes: nil, lateNightMinutes: nil, snsSessions: nil)
    }
}
