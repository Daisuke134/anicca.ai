import Foundation
import OSLog

actor SensorAccessSyncService {
    static let shared = SensorAccessSyncService()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "SensorAccessSync")

    private struct RemoteState: Decodable {
        let screenTimeEnabled: Bool
        let sleepEnabled: Bool
        let stepsEnabled: Bool
        let motionEnabled: Bool
    }

    func sync(access: SensorAccessState) async {
        guard case .signedIn(let creds) = await AppState.shared.authStatus else { return }
        let baseURL = AppConfig.proxyBaseURL
        var request = URLRequest(url: baseURL.appendingPathComponent("mobile/sensors/state"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let deviceId = await AppState.shared.resolveDeviceId()
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
        request.setValue(creds.userId, forHTTPHeaderField: "user-id")

        let body = await MainActor.run { () -> Data? in
            let encoder = JSONEncoder()
            return try? encoder.encode(access)
        }
        request.httpBody = body

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

    func fetchLatest() async {
        guard case .signedIn(let creds) = await AppState.shared.authStatus else { return }
        let baseURL = AppConfig.proxyBaseURL
        var request = URLRequest(url: baseURL.appendingPathComponent("mobile/sensors/state"))
        request.httpMethod = "GET"
        request.setValue(await AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(creds.userId, forHTTPHeaderField: "user-id")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                logger.error("Sensor state pull failed (invalid status)")
                return
            }
            if let remote = try? JSONDecoder().decode(RemoteState.self, from: data) {
                await MainActor.run {
                    AppState.shared.mergeRemoteSensorAccess(
                        sleep: remote.sleepEnabled,
                        steps: remote.stepsEnabled,
                        screenTime: remote.screenTimeEnabled,
                        motion: remote.motionEnabled
                    )
                }
            }
        } catch {
            logger.error("Sensor state pull error: \(error.localizedDescription)")
        }
    }
}

