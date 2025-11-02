import Foundation
import OSLog

@MainActor
final class AudioManager {
    static let shared = AudioManager()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioManager")
    private var remoteRenderers: [UUID: AudioPlayerRenderer] = [:]

    private init() {}

    func add(remoteAudioRenderer renderer: AudioPlayerRenderer) {
        remoteRenderers[renderer.id] = renderer
        renderer.start()
        logger.debug("Remote audio renderer added (\(renderer.id.uuidString, privacy: .public))")
    }

    func remove(remoteAudioRenderer renderer: AudioPlayerRenderer) {
        renderer.stop()
        remoteRenderers.removeValue(forKey: renderer.id)
        logger.debug("Remote audio renderer removed (\(renderer.id.uuidString, privacy: .public))")
    }

    func stopAllRemoteRenderers() {
        guard !remoteRenderers.isEmpty else { return }
        logger.debug("Stopping \(remoteRenderers.count, privacy: .public) remote audio renderer(s)")
        remoteRenderers.values.forEach { $0.stop() }
        remoteRenderers.removeAll()
    }
}
