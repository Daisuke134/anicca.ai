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
    private var converter: AVAudioConverter?
    private var conversionFormat: AVAudioFormat?

    private init() {}

    func start() throws {
        guard !engine.isRunning else { return }

        let inputNode = engine.inputNode
        let session = AVAudioSession.sharedInstance()
        let tapFormat = inputNode.inputFormat(forBus: 0)
        let sampleRate = session.sampleRate > 0 ? session.sampleRate : tapFormat.sampleRate
        let preferredFrames = AVAudioFrameCount(max(256, min(1024, Int(tapFormat.sampleRate * 0.02))))

        if let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24_000, channels: 1, interleaved: false) {
            converter = AVAudioConverter(from: tapFormat, to: format)
            conversionFormat = format
        } else {
            converter = nil
            conversionFormat = nil
        }

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: preferredFrames, format: tapFormat) { [weak self] buffer, time in
            guard let self else { return }
            self.latencyMonitor.captureInput(at: time)

            guard let converter = self.converter,
                  let format = self.conversionFormat,
                  let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: buffer.frameCapacity) else {
                self.onMicrophoneFrame?(buffer, time)
                return
            }

            var error: NSError?
            let success = converter.convert(to: converted, error: &error) { _, status in
                status.pointee = .haveData
                return buffer
            }

            if success {
                self.onMicrophoneFrame?(converted, time)
            } else {
                if let error {
                    self.logger.error("Audio conversion failed: \(error.localizedDescription, privacy: .public)")
                }
                self.onMicrophoneFrame?(buffer, time)
            }
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
        converter = nil
        conversionFormat = nil
        if engine.isRunning {
            engine.stop()
            logger.info("Voice engine stopped")
        }
    }
}
