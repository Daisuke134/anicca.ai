import Foundation
import OSLog

struct ScreenTimeSharedPayload: Codable {
    struct Session: Codable {
        let startAt: Date
        let endAt: Date
        let category: String
        let totalMinutes: Double
    }

    let dateKey: String
    let totalMinutes: Int
    let socialMinutes: Int
    let lateNightMinutes: Int
    let sessions: [Session]
    let updatedAt: TimeInterval
}

enum ScreenTimeSharedStore {
    private static let logger = Logger(subsystem: "com.anicca.ios", category: "ScreenTimeSharedStore")
    private static let directory: URL? = {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suiteName)?
            .appendingPathComponent("screentime", isDirectory: true)
    }()

    private static func url(for dateKey: String) -> URL? {
        directory?.appendingPathComponent("payload-\(dateKey).json", isDirectory: false)
    }

    static func save(_ payload: ScreenTimeSharedPayload) {
        guard let url = url(for: payload.dateKey) else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(payload)
            try data.write(to: url, options: .atomic)
            logger.debug("Saved ScreenTime payload \(payload.dateKey)")
        } catch {
            logger.error("Failed to save ScreenTime payload: \(error.localizedDescription)")
        }
    }

    static func load(for dateKey: String) -> ScreenTimeSharedPayload? {
        guard let url = url(for: dateKey),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(ScreenTimeSharedPayload.self, from: data)
    }
}

