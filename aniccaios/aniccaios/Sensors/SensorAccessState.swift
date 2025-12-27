import Foundation

/// Sensor permissions / integration toggles for v0.3.
/// - Source of truth: AppState (persisted to UserDefaults).
/// - Quiet fallback: when not authorized, keep features off and skip DP/metrics.
enum SensorPermissionStatus: String, Codable {
    case unknown
    case notDetermined
    case authorized
    case denied
    case restricted
    case unsupported
}

struct SensorAccessState: Codable, Equatable {
    // Permission snapshots
    var screenTime: SensorPermissionStatus
    var healthKit: SensorPermissionStatus
    var motion: SensorPermissionStatus

    // Integration toggles (user intent)
    var screenTimeEnabled: Bool
    var screenTimeAuthorized: Bool
    var sleepEnabled: Bool
    var sleepAuthorized: Bool
    var stepsEnabled: Bool
    var stepsAuthorized: Bool
    var motionEnabled: Bool
    var motionAuthorized: Bool

    static let `default` = SensorAccessState(
        screenTime: .unknown,
        healthKit: .unknown,
        motion: .unknown,
        screenTimeEnabled: false,
        screenTimeAuthorized: false,
        sleepEnabled: false,
        sleepAuthorized: false,
        stepsEnabled: false,
        stepsAuthorized: false,
        motionEnabled: false,
        motionAuthorized: false
    )
}



