import Foundation
import LiveKit
import OSLog

@MainActor
final class AudioPlayerRenderer {
    let id = UUID()

    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioRenderer")
    private weak var track: RemoteAudioTrack?

    init(track: RemoteAudioTrack) {
        self.track = track
    }

    func start() {
        guard let track else { return }
        track.isPlaybackEnabled = true
        logger.debug("Enabled remote audio playback")
    }

    func stop() {
        guard let track else { return }
        track.isPlaybackEnabled = false
        logger.debug("Disabled remote audio playback")
    }
}
