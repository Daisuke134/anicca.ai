import Foundation

// NOTE:
// - Requires adding the "Family Controls" capability + entitlement:
//   com.apple.developer.family-controls
// - Requires adding an App Group (e.g. group.com.anicca.shared) to share selection with the extension.
// - Requires adding a Device Activity Monitor Extension target.
//
// Primary sources:
// - Authorization: https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:)/
// - Picker: https://developer.apple.com/documentation/familycontrols/familyactivitypicker/
// - Schedule: https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/
// - Threshold callback: https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)/

@available(iOS 16.0, *)
final class DeviceActivityMonitorController {
    static let shared = DeviceActivityMonitorController()

    private init() {}

    /// Quiet fallback:
    /// - Only request Screen Time authorization when user toggles ON.
    /// - If denied/cancelled, caller should revert toggle OFF and stop monitoring.
    func requestAuthorization() async throws {
        // import FamilyControls
        // try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }

    /// Starts monitoring with a schedule and events.
    /// Actual threshold handling is done in Device Activity Monitor Extension (separate target).
    func startMonitoringIfNeeded() throws {
        // import DeviceActivity
        // 1) Build DeviceActivitySchedule
        // 2) Build DeviceActivityEvent(s) (e.g. sns30/sns60)
        // 3) DeviceActivityCenter().startMonitoring(...)
    }

    func stopMonitoring() {
        // import DeviceActivity
        // DeviceActivityCenter().stopMonitoring(...)
    }
}



