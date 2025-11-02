import Foundation
import OSLog

struct LiveKitTokenResponse: Decodable {
    let token: String
    let url: URL
    let ttl: TimeInterval
    let room: String
}

protocol MobileAPIClientProtocol: AnyObject {
    func fetchLiveKitToken(userId: String) async throws -> LiveKitTokenResponse
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

    func fetchLiveKitToken(userId: String) async throws -> LiveKitTokenResponse {
        guard var components = URLComponents(url: AppConfig.liveKitTokenURL, resolvingAgainstBaseURL: false) else {
            logger.error("Failed to build LiveKit token URL components")
            throw APIError.invalidEndpoint
        }
        components.queryItems = [URLQueryItem(name: "deviceId", value: userId)]
        guard let url = components.url else {
            logger.error("Failed to resolve LiveKit token URL with query")
            throw APIError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(userId, forHTTPHeaderField: "deviceId")

        logger.debug("Requesting LiveKit token for userId \(userId, privacy: .private(mask: .hash))")

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                logger.error("LiveKit token response missing HTTPURLResponse")
                throw APIError.requestFailed(statusCode: -1)
            }

            guard 200 ..< 300 ~= httpResponse.statusCode else {
                logger.error("LiveKit token request failed (status \(httpResponse.statusCode))")
                throw APIError.realtimeTokenFetchFailed(statusCode: httpResponse.statusCode)
            }

            do {
                let response = try decoder.decode(LiveKitTokenResponse.self, from: data)
                logger.info("Received LiveKit token (ttl=\(response.ttl, format: .fixed(precision: 0))s)")
                return response
            } catch {
                logger.error("Failed to decode LiveKit token response: \(error.localizedDescription, privacy: .public)")
                throw APIError.decodingFailed
            }
        } catch let apiError as APIError {
            throw apiError
        } catch {
            logger.error("LiveKit token request transport error: \(error.localizedDescription, privacy: .public)")
            throw APIError.transportError(underlying: error)
        }
    }
}
