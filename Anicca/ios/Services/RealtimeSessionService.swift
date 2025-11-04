import Foundation

struct RealtimeSessionService {
	struct ServiceError: LocalizedError {
		enum ErrorType {
			case unauthorized
			case decodingFailed
			case invalidResponse
			case server(status: Int)
		}

		let type: ErrorType
		let underlying: Error?

		var errorDescription: String? {
			switch type {
			case .unauthorized:
				return "セッションを開始できませんでした。アカウントの認証設定を確認してください。"
			case .decodingFailed:
				return "セッション応答の解析に失敗しました。サーバーの実装を確認してください。"
			case .invalidResponse:
				return "無効な応答を受信しました。ネットワークとエンドポイントを確認してください。"
			case let .server(status):
				return "サーバーがエラーを返しました (status: \(status))。ログを確認してください。"
			}
		}
	}

	private struct RealtimeSessionDTO: Decodable {
		struct ClientSecret: Decodable {
			let value: String
		}

		let clientSecret: ClientSecret

		private enum CodingKeys: String, CodingKey {
			case clientSecret = "client_secret"
		}
	}

	private let sessionURL: URL
	private let urlSession: URLSession

	init(sessionURL: URL = Environment.realtimeSessionURL, urlSession: URLSession = .shared) {
		self.sessionURL = sessionURL
		self.urlSession = urlSession
	}

	func fetchClientSecret() async throws -> String {
		var request = URLRequest(url: sessionURL, timeoutInterval: Environment.realtimeRequestTimeout)
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")

		let (data, response) = try await urlSession.data(for: request)

		guard let httpResponse = response as? HTTPURLResponse else {
			throw ServiceError(type: .invalidResponse, underlying: nil)
		}

		switch httpResponse.statusCode {
		case 200 ..< 300:
			break
		case 401:
			throw ServiceError(type: .unauthorized, underlying: nil)
		default:
			throw ServiceError(type: .server(status: httpResponse.statusCode), underlying: nil)
		}

		do {
			let dto = try JSONDecoder().decode(RealtimeSessionDTO.self, from: data)
			return dto.clientSecret.value
		} catch {
			throw ServiceError(type: .decodingFailed, underlying: error)
		}
	}
}
