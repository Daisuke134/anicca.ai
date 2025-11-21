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

