import Foundation
import OSLog

struct RealtimeClientSecretResponse: Decodable {
    let value: String
    let expiresAt: TimeInterval
    let model: String
    let voice: String

    private enum CodingKeys: String, CodingKey {
        case value
        case expiresAt = "expires_at"
        case model
        case voice
    }
}

protocol MobileAPIClientProtocol: AnyObject {
    func fetchRealtimeClientSecret(userId: String) async throws -> RealtimeClientSecretResponse
}

@MainActor
final class MobileAPIClient: MobileAPIClientProtocol {
    static let shared = MobileAPIClient()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "MobileAPI")
    private let session: URLSession
    private let decoder: JSONDecoder

    private init(session: URLSession = .shared, decoder: JSONDecoder = JSONDecoder()) {
        self.session = session
        self.decoder = decoder
    }

    func fetchRealtimeClientSecret(userId: String) async throws -> RealtimeClientSecretResponse {
        guard var components = URLComponents(url: AppConfig.realtimeSessionURL, resolvingAgainstBaseURL: false) else {
            logger.error("Failed to build realtime session URL components")
            throw APIError.invalidEndpoint
        }
        components.queryItems = [URLQueryItem(name: "deviceId", value: userId)]
        guard let url = components.url else {
            logger.error("Failed to resolve realtime session URL with query")
            throw APIError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(userId, forHTTPHeaderField: "device-id")

        logger.debug("Requesting realtime client_secret for userId \(userId, privacy: .private(mask: .hash))")

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                logger.error("Realtime session response missing HTTPURLResponse")
                throw APIError.requestFailed(statusCode: -1)
            }

            guard 200 ..< 300 ~= httpResponse.statusCode else {
                logger.error("Realtime session request failed (status \(httpResponse.statusCode))")
                throw APIError.realtimeTokenFetchFailed(statusCode: httpResponse.statusCode)
            }

            do {
                let root = try decoder.decode(RealtimeSessionEnvelope.self, from: data)
                logger.info("Received client_secret (expires_at=\(root.clientSecret.expiresAt))")
                return root.clientSecret
            } catch {
                logger.error("Failed to decode realtime session response: \(error.localizedDescription, privacy: .public)")
                throw APIError.decodingFailed
            }
        } catch let apiError as APIError {
            throw apiError
        } catch {
            logger.error("Realtime session request transport error: \(error.localizedDescription, privacy: .public)")
            throw APIError.transportError(underlying: error)
        }
    }
}

private struct RealtimeSessionEnvelope: Decodable {
    struct ClientSecretPayload: Decodable {
        let value: String
        let expiresAt: TimeInterval
        let model: String
        let voice: String

        private enum CodingKeys: String, CodingKey {
            case value
            case expiresAt = "expires_at"
            case model
            case voice
        }
    }

    let clientSecret: ClientSecretPayload

    private enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
    }
}
