import Foundation

/// RevenueCatのHTTPClientと同様の設定を使用したURLSessionConfigurationを提供
/// ネットワーク警告（pdp_ip0）を抑制するため
@MainActor
final class NetworkSessionManager {
    static let shared = NetworkSessionManager()
    
    private let sessionConfiguration: URLSessionConfiguration
    
    private init() {
        // RevenueCatのHTTPClient.swiftと同様の設定
        let config = URLSessionConfiguration.ephemeral
        config.httpMaximumConnectionsPerHost = 1
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 30.0
        config.urlCache = nil // キャッシュは使用しない
        // multipathServiceTypeは設定しない（公式実装に合わせる）
        self.sessionConfiguration = config
    }
    
    /// 専用URLSessionを返す
    var session: URLSession {
        URLSession(configuration: sessionConfiguration)
    }
}

// MARK: - Auth helpers
extension NetworkSessionManager {
    enum AuthError: Error {
        case notAuthenticated
    }
    
    @MainActor
    func setAuthHeaders(for request: inout URLRequest) async throws {
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            throw AuthError.notAuthenticated
        }
        if let exp = credentials.accessTokenExpiresAt, exp.addingTimeInterval(-60) <= Date() {
            try await refreshIfNeeded()
        }
        if let at = (AppState.shared.authStatus).accessToken {
            request.setValue("Bearer \(at)", forHTTPHeaderField: "Authorization")
        } else if let at = credentials.jwtAccessToken {
            request.setValue("Bearer \(at)", forHTTPHeaderField: "Authorization")
        }
    }
    
    private func refreshIfNeeded() async throws {
        guard let rtData = KeychainService.load(account: "rt"),
              let rt = String(data: rtData, encoding: .utf8),
              !rt.isEmpty else { return }
        var req = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("auth/refresh"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": rt])
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let newAT = json["token"] as? String
        let expMs = json["expiresAt"] as? TimeInterval
        let newRT = json["refreshToken"] as? String
        if let newRT = newRT {
            try? KeychainService.save(Data(newRT.utf8), account: "rt")
        }
        await MainActor.run {
            AppState.shared.updateAccessToken(token: newAT, expiresAtMs: expMs)
        }
    }
}

