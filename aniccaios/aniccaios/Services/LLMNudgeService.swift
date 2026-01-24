import Foundation
import OSLog

/// LLM生成NudgeのAPI呼び出しサービス
actor LLMNudgeService {
    static let shared = LLMNudgeService()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "LLMNudgeService")
    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        self.session = URLSession.shared
        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601  // ISO8601文字列をDateに変換
    }

    /// 今日生成されたNudgeを取得
    func fetchTodaysNudges() async throws -> [LLMGeneratedNudge] {
        guard case .signedIn(let credentials) = await AppState.shared.authStatus else {
            logger.warning("🔄 [LLM] Not signed in, skipping fetch")
            throw ServiceError.notAuthenticated
        }

        let url = await MainActor.run { AppConfig.nudgeTodayURL }
        logger.info("🔄 [LLM] Requesting: \(url.absoluteString)")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(credentials.jwtAccessToken ?? "")", forHTTPHeaderField: "Authorization")

        let deviceId = await AppState.shared.resolveDeviceId()
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ServiceError.invalidResponse
            }

            guard (200..<300).contains(httpResponse.statusCode) else {
                logger.error("❌ [LLM] Failed: HTTP \(httpResponse.statusCode)")
                if let body = String(data: data, encoding: .utf8) {
                    logger.error("❌ [LLM] Response: \(body)")
                }
                throw ServiceError.httpError(httpResponse.statusCode)
            }

            let responseBody: NudgeTodayResponse
            do {
                responseBody = try decoder.decode(NudgeTodayResponse.self, from: data)
            } catch {
                logger.error("❌ [LLM] Decode error: \(error.localizedDescription)")
                throw error
            }
            logger.info("✅ [LLM] Decoded \(responseBody.nudges.count) nudges")
            return responseBody.nudges
        } catch {
            logger.error("Failed to fetch todays nudges: \(error.localizedDescription)")
            throw error
        }
    }

    enum ServiceError: Error {
        case notAuthenticated
        case invalidResponse
        case httpError(Int)
    }
}

/// APIレスポンス形式
private struct NudgeTodayResponse: Codable {
    let nudges: [LLMGeneratedNudge]
}

