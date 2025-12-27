import Foundation
import OSLog

actor SensorAccessSyncService {
    static let shared = SensorAccessSyncService()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "SensorAccessSync")

    func sync(access: SensorAccessState) async {
        guard case .signedIn(let creds) = await AppState.shared.authStatus else { return }
        let baseURL = await AppConfig.proxyBaseURL
        var request = URLRequest(url: baseURL.appendingPathComponent("mobile/sensors/state"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let deviceId = await AppState.shared.resolveDeviceId()
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
        request.setValue(creds.userId, forHTTPHeaderField: "user-id")

        let encoder = JSONEncoder()
        if let body = try? encoder.encode(access) {
            request.httpBody = body
        }

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

