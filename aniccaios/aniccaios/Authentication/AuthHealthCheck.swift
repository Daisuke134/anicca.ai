import Foundation
import OSLog

actor AuthHealthCheck {
    static let shared = AuthHealthCheck()

    private var lastPing: Date?
    private let cooldown: TimeInterval = 60
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AuthHealthCheck")

    func warmBackend() async {
        if let lastPing, Date().timeIntervalSince(lastPing) < cooldown {
            logger.debug("Health check skipped (within cooldown)")
            return
        }
        
        let startTime = Date()
        lastPing = Date()
        
        var request = URLRequest(url: AppConfig.appleAuthURL.appending(path: "health"))
        request.timeoutInterval = 5
        request.httpMethod = "GET"
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let duration = Date().timeIntervalSince(startTime)
            
            if let httpResponse = response as? HTTPURLResponse {
                logger.info("Health check completed in \(duration * 1000, privacy: .public)ms, status: \(httpResponse.statusCode, privacy: .public)")
            } else {
                logger.info("Health check completed in \(duration * 1000, privacy: .public)ms")
            }
        } catch {
            let duration = Date().timeIntervalSince(startTime)
            logger.warning("Health check failed after \(duration * 1000, privacy: .public)ms: \(error.localizedDescription, privacy: .public)")
        }
    }
}

