import Foundation
import OSLog

/// v0.3: Behavior Summary 取得（UIは v3-ui.md、JSON形は migration-patch-v3.md 6.1）
@MainActor
final class BehaviorSummaryService {
    static let shared = BehaviorSummaryService()
    private init() {}

    enum ServiceError: Error {
        case notAuthenticated
        case invalidResponse
        case httpError(Int)
        case decodeError
    }

    func fetchSummary() async throws -> BehaviorSummary {
        guard case .signedIn(let creds) = AppState.shared.authStatus else {
            throw ServiceError.notAuthenticated
        }

        var components = URLComponents(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/behavior/summary"), resolvingAgainstBaseURL: false)!
        let language = AppState.shared.effectiveLanguage.rawValue
        components.queryItems = (components.queryItems ?? []) + [URLQueryItem(name: "lang", value: language)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(creds.userId, forHTTPHeaderField: "user-id")
        request.setValue(language, forHTTPHeaderField: "Accept-Language")

        // JWT/Bearer があれば付与（存在しない場合でも既存ヘッダ方式で通る前提）
        try? await NetworkSessionManager.shared.setAuthHeaders(for: &request)

        let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ServiceError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw ServiceError.httpError(http.statusCode) }

        do {
            return try JSONDecoder().decode(BehaviorSummary.self, from: data)
        } catch {
            let logger = Logger(subsystem: "com.anicca.ios", category: "BehaviorSummaryService")
            logger.error("Decode failure: \(error.localizedDescription)")
            throw ServiceError.decodeError
        }
    }
}



