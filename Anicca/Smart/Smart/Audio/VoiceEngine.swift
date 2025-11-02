import AVFoundation
import OSLog

enum VoiceEngineError: Error {
    case invalidFormat
}

final class VoiceEngine {
    static let shared = VoiceEngine()
    var onMicrophoneFrame: ((AVAudioPCMBuffer, AVAudioTime) -> Void)?

    private let engine = AVAudioEngine()
    private let logger = Logger(subsystem: "com.anicca.ios", category: "VoiceEngine")
    private let latencyMonitor = LatencyMonitor()

    private init() {}

    func start() throws {
        guard !engine.isRunning else { return }

        let inputNode = engine.inputNode
        let session = AVAudioSession.sharedInstance()
        let tapFormat = inputNode.inputFormat(forBus: 0)
        let sampleRate = session.sampleRate > 0 ? session.sampleRate : tapFormat.sampleRate
        let preferredFrames = AVAudioFrameCount(max(256, min(1024, Int(tapFormat.sampleRate * 0.02))))

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: preferredFrames, format: tapFormat) { [weak self] buffer, time in
            self?.latencyMonitor.captureInput(at: time)
            self?.onMicrophoneFrame?(buffer, time)
        }

        let mixer = engine.mainMixerNode
        mixer.removeTap(onBus: 0)
        mixer.installTap(onBus: 0, bufferSize: 1024, format: mixer.outputFormat(forBus: 0)) { [weak self] _, time in
            self?.latencyMonitor.captureOutput(at: time)
        }

        engine.prepare()
        do {
            try engine.start()
            logger.info("Voice engine started (sampleRate: \(sampleRate, privacy: .public))")
        } catch {
            logger.error("Voice engine failed to start: \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.mainMixerNode.removeTap(onBus: 0)
        if engine.isRunning {
            engine.stop()
            logger.info("Voice engine stopped")
        }
    }
}
