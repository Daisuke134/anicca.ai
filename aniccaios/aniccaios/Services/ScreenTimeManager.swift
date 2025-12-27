import Foundation
import os
import FamilyControls

@MainActor
final class ScreenTimeManager {
    static let shared = ScreenTimeManager()
    private init() {}
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "ScreenTimeManager")
    private let appGroupDefaults = UserDefaults(suiteName: "group.ai.anicca.app.ios")
    
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
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let todayKey = String(today)
        
        // ★ object(forKey:)を使ってnilと0を区別（integer(forKey:)は未設定でも0を返す）
        let totalMinutes = appGroupDefaults?.object(forKey: "screenTime_totalMinutes_\(todayKey)") as? Int
        let socialMinutes = appGroupDefaults?.object(forKey: "screenTime_socialMinutes_\(todayKey)") as? Int
        let lateNightMinutes = appGroupDefaults?.object(forKey: "screenTime_lateNightMinutes_\(todayKey)") as? Int
        
        // v3.1: snsSessions を読み取り
        var snsSessions: [[String: Any]]? = nil
        if let sessionsJSON = appGroupDefaults?.string(forKey: "screenTime_snsSessions_\(todayKey)"),
           let sessionsData = sessionsJSON.data(using: .utf8),
           let sessions = try? JSONSerialization.jsonObject(with: sessionsData) as? [[String: Any]] {
            snsSessions = sessions
        }
        
        // データが存在しない場合（Extension がまだ実行されていない）
        if totalMinutes == nil {
            logger.info("No screen time data in App Groups yet")
            return DailySummary(totalMinutes: nil, socialMinutes: nil, lateNightMinutes: nil, snsSessions: nil)
        }
        
        logger.info("Fetched screen time from App Groups: total=\(totalMinutes ?? 0), social=\(socialMinutes ?? 0), lateNight=\(lateNightMinutes ?? 0), sessions=\(snsSessions?.count ?? 0)")
        
        return DailySummary(
            totalMinutes: totalMinutes,
            socialMinutes: socialMinutes,
            lateNightMinutes: lateNightMinutes,
            snsSessions: snsSessions
        )
    }
}
