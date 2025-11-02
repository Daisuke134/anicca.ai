import Foundation

private struct MobileVoiceSessionRequest: Encodable {
    let deviceId: String
    let room: String
}

private struct MobileVoiceSessionResponse: Decodable {
    let sessionId: String
}

enum VoicePipelineError: LocalizedError {
    case invalidResponse
    case backendFailure(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "音声パイプライン呼び出しに失敗しました"
        case .backendFailure(let status, let message):
            return "音声パイプラインがエラーを返しました (status: \(status), message: \(message))"
        }
    }
}

@MainActor
final class VoicePipeline {
    private var activeSessionId: String?
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func startSession(userId: String, token: LiveKitTokenResponse) async throws {
        guard activeSessionId == nil else { return }

        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("rtc/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(MobileVoiceSessionRequest(deviceId: userId, room: token.room))

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw VoicePipelineError.invalidResponse
        }

        guard (200 ..< 300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "unknown"
            throw VoicePipelineError.backendFailure(status: http.statusCode, message: message)
        }

        let decoded = try JSONDecoder().decode(MobileVoiceSessionResponse.self, from: data)
        activeSessionId = decoded.sessionId
    }

    func stopSession() async {
        guard let sessionId = activeSessionId else { return }

        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("rtc/session/\(sessionId)"))
        request.httpMethod = "DELETE"
        _ = try? await session.data(for: request)
        activeSessionId = nil
    }

    func reset() {
        activeSessionId = nil
    }
}
