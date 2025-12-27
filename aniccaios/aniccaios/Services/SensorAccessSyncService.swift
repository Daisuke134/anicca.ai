import Foundation
import OSLog

actor SensorAccessSyncService {
    static let shared = SensorAccessSyncService()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "SensorAccessSync")

    func sync(access: SensorAccessState) async {
        guard case .signedIn(let creds) = AppState.shared.authStatus else { return }
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/sensors/state"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(creds.userId, forHTTPHeaderField: "user-id")
        request.httpBody = try? JSONEncoder().encode(access)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                logger.error("Sensor state sync failed")
                return
            }
            logger.info("Sensor state synced")
        } catch {
            logger.error("Sensor state sync error: \(error.localizedDescription)")
        }
    }
}

