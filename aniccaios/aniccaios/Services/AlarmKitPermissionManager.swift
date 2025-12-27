import Foundation

#if canImport(AlarmKit)
import AlarmKit
#endif
import OSLog

enum AlarmKitPermissionManager {
    static let logger = Logger(subsystem: "com.anicca.ios", category: "AlarmKitPermission")

#if canImport(AlarmKit)
    @available(iOS 26.0, *)
    static func currentState() -> AlarmManager.AuthorizationState {
        return AlarmManager.shared.authorizationState
    }
#endif

    static func requestIfNeeded() async -> Bool {
#if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return false }
        let state = AlarmManager.shared.authorizationState
        guard state != .authorized else { return true }
        do {
            let result = try await AlarmManager.shared.requestAuthorization()
            logger.info("AlarmKit re-request result: \(String(describing: result), privacy: .public)")
            return result == .authorized
        } catch {
            logger.error("AlarmKit re-request failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
#else
        return false
#endif
    }
}

