import Foundation

enum APIError: LocalizedError {
    case invalidEndpoint
    case requestFailed(statusCode: Int)
    case decodingFailed
    case realtimeTokenFetchFailed(statusCode: Int)
    case transportError(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .invalidEndpoint:
            return "APIエンドポイントの構成が不正です"
        case .requestFailed(let statusCode):
            return "APIリクエストに失敗しました (status: \(statusCode))"
        case .decodingFailed:
            return "サーバー応答の解析に失敗しました"
        case .realtimeTokenFetchFailed(let statusCode):
            return "LiveKitトークンの取得に失敗しました (status: \(statusCode))"
        case .transportError(let underlying):
            return "ネットワークエラー: \(underlying.localizedDescription)"
        }
    }
}
