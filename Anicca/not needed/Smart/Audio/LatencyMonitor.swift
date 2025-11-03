import AVFoundation
import OSLog

final class LatencyMonitor {
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Latency")
    private var lastInputTime: AVAudioTime?
    private var lastOutputTime: AVAudioTime?

    func captureInput(at time: AVAudioTime) {
        lastInputTime = time
        reportLatencyIfPossible()
    }

    func captureOutput(at time: AVAudioTime) {
        lastOutputTime = time
        reportLatencyIfPossible()
    }

    private func reportLatencyIfPossible() {
        guard let input = lastInputTime,
              let output = lastOutputTime,
              let inputSeconds = absoluteSeconds(for: input),
              let outputSeconds = absoluteSeconds(for: output) else { return }
        let deltaMs = max(0, (outputSeconds - inputSeconds) * 1000)
        logger.debug("Audio round-trip latency ≈ \(deltaMs, format: .fixed(precision: 1)) ms")
    }

    private func absoluteSeconds(for time: AVAudioTime) -> Double? {
        if time.hostTime != 0 {
            return Double(time.hostTime) / Double(NSEC_PER_SEC)
        }
        let sampleRate = time.sampleRate
        if sampleRate != 0, time.sampleTime != 0 {
            return Double(time.sampleTime) / sampleRate
        }
        return nil
    }
}
