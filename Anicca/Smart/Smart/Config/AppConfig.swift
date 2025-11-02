import Foundation
import LiveKit
import OSLog

enum AppConfig {
    private static let proxyBaseKey = "ANICCA_PROXY_BASE_URL"
    private static let logger = Logger(subsystem: "com.anicca.ios", category: "AppConfig")

    static let liveKitTokenPath = "/rtc/ephemeral-token"
    static let maxRealtimeReconnectAttempts = 3

    private static func infoValue(for key: String) -> String {
        guard let raw = Bundle.main.infoDictionary?[key] as? String else {
            logger.fault("Missing Info.plist key: \(key, privacy: .public)")
            fatalError("Missing Info.plist key: \(key)")
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            logger.fault("Empty Info.plist value for key: \(key, privacy: .public)")
            fatalError("Empty Info.plist value for key: \(key)")
        }
        return trimmed
    }

    static var proxyBaseURL: URL {
        let value = infoValue(for: proxyBaseKey)
        guard let url = URL(string: value) else {
            logger.fault("Invalid proxy base URL: \(value, privacy: .public)")
            fatalError("Invalid proxy base URL")
        }
        return url
    }

    static var liveKitTokenURL: URL {
        let base = proxyBaseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let path = liveKitTokenPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(base)/\(path)") else {
            logger.fault("Failed to compose LiveKit token URL from base \(base, privacy: .public) and path \(path, privacy: .public)")
            fatalError("Failed to compose LiveKit token URL")
        }
        return url
    }

    static let liveKitConnectOptions: ConnectOptions = ConnectOptions(
        autoSubscribe: true,
        reconnectAttempts: 10,
        reconnectAttemptDelay: 0.5,
        reconnectMaxDelay: 6.0,
        enableMicrophone: true
    )
}
