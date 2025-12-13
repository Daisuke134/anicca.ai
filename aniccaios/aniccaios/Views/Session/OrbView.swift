import SwiftUI
import AVFoundation
import Accelerate

/// v3-ui 必須: 青いオーブ（breath + マイクRMS連動）
struct OrbView: View {
    @StateObject private var meter = MicLevelMeter()
    @State private var breathe = false

    var body: some View {
        let base = breathe ? 1.05 : 0.95
        let mic = 0.9 + 0.2 * meter.smoothedLevel // 0.9–1.1
        let scale = base * mic

        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(red: 0.22, green: 0.50, blue: 0.95).opacity(0.95),
                        Color(red: 0.10, green: 0.32, blue: 0.85).opacity(0.95)
                    ],
                    center: .center,
                    startRadius: 10,
                    endRadius: 160
                )
            )
            .frame(width: 190, height: 190)
            .scaleEffect(scale)
            .animation(.easeInOut(duration: 2.8), value: breathe)          // breath
            .animation(.easeOut(duration: 0.08), value: meter.smoothedLevel) // mic follow
            .onAppear {
                breathe = true
                meter.start()
            }
            .onDisappear {
                meter.stop()
            }
    }
}

/// AVAudioEngine で RMS を測って 0–1 に正規化し、平滑化（0.7:0.3）して公開する
@MainActor
final class MicLevelMeter: ObservableObject {
    @Published private(set) var smoothedLevel: CGFloat = 0

    private let engine = AVAudioEngine()
    private var isRunning = false

    func start() {
        guard !isRunning else { return }
        isRunning = true

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)

        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            let normalized = self.normalizedRMS(from: buffer)
            Task { @MainActor in
                // v3-ui: 平滑化 0.7:0.3（必須）
                self.smoothedLevel = 0.7 * self.smoothedLevel + 0.3 * normalized
            }
        }

        do {
            try engine.start()
        } catch {
            // 計測失敗時もUIは壊さない（smoothedLevel=0 のまま）
            isRunning = false
        }
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
        smoothedLevel = 0
    }

    private func normalizedRMS(from buffer: AVAudioPCMBuffer) -> CGFloat {
        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return 0 }

        var rms: Float = 0
        vDSP_rmsqv(channelData, 1, &rms, vDSP_Length(frameLength))

        // 20*log10(rms) を [-80,0] → [0,1] に正規化
        let levelDb = 20 * log10f(max(rms, 0.000_001))
        let minDb: Float = -80
        let clamped = max(levelDb, minDb)
        let normalized = (clamped - minDb) / -minDb
        return CGFloat(min(max(normalized, 0), 1))
    }
}

