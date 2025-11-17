import Foundation

actor AuthHealthCheck {
    static let shared = AuthHealthCheck()

    private var lastPing: Date?
    private let cooldown: TimeInterval = 60

    func warmBackend() async {
        if let lastPing, Date().timeIntervalSince(lastPing) < cooldown { return }
        lastPing = Date()
        var request = URLRequest(url: AppConfig.appleAuthURL.appending(path: "health"))
        request.timeoutInterval = 5
        request.httpMethod = "GET"
        _ = try? await URLSession.shared.data(for: request)
    }
}

