import AVFoundation
import OSLog

final class AudioSessionConfigurator {
    static let shared = AudioSessionConfigurator()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioSession")
    private init() {}

    func configure() throws {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)
            if session.isInputGainSettable {
                try session.setInputGain(1.0)
            }
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            logger.info("Configured audio session (sampleRate: \(session.sampleRate, privacy: .public), IOBuffer: \(session.ioBufferDuration, privacy: .public))")
        } catch {
            logger.error("Audio session configuration failed: \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    func activate() throws {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(true)
            logger.debug("Audio session activated")
        } catch {
            logger.error("Failed to activate audio session: \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    func deactivate() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            logger.debug("Audio session deactivated")
        } catch {
            logger.error("Audio session deactivate failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
