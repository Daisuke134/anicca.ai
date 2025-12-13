import Foundation

// NOTE:
// Primary sources:
// - authorizationStatus: https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/authorizationstatus()/
// - startActivityUpdates best-effort + no delivery while app suspended:
//   https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/startactivityupdates(to:withhandler:)/

final class MotionManager {
    static let shared = MotionManager()
    private init() {}

    /// Quiet fallback:
    /// - Only start updates when user toggles ON.
    /// - If denied, caller reverts toggle OFF and we stop all motion work.
    func startIfEnabled() {
        // import CoreMotion
        // guard CMMotionActivityManager.isActivityAvailable() else { ... }
        // check CMMotionActivityManager.authorizationStatus()
        // startActivityUpdates(to:..., withHandler: ...)
    }

    func stop() {
        // activityManager.stopActivityUpdates()
    }

    /// Returns local cached aggregates (yesterday) for MetricsUploader.
    func loadCachedDailyMetrics(forLocalDate localDate: String) -> Int? {
        return nil
    }
}

