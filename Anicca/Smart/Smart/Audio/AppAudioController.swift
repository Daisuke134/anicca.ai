import AVFoundation
import Combine
import OSLog
import SwiftUI

@MainActor
final class AppAudioController: ObservableObject {
    @Published var status: String = "音声準備前"
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioBootstrap")
    private let sessionConfigurator = AudioSessionConfigurator.shared
    private let voiceEngine = VoiceEngine.shared
    private let permissionManager = MicrophonePermissionManager()
    private var didPrepare = false

    func prepare() async {
        guard !didPrepare else {
            await ensureSessionActive()
            return
        }
        await updateStatus("マイク権限確認中")
        let permission = await permissionManager.ensurePermission()
        guard permission == .granted else {
            await updateStatus("マイク権限が必要です")
            logger.error("Microphone permission denied")
            return
        }
        do {
            try sessionConfigurator.configure()
            try voiceEngine.start()
            didPrepare = true
            await updateStatus("音声エンジン稼働中")
            logger.info("Audio engine started successfully")
        } catch {
            await updateStatus("音声初期化に失敗しました")
            logger.error("Failed to start audio engine: \(error.localizedDescription, privacy: .public)")
        }
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            Task { await ensureSessionActive() }
        case .inactive, .background:
            sessionConfigurator.deactivate()
            voiceEngine.stop()
            logger.info("Audio engine paused for background state")
        @unknown default:
            break
        }
    }

    private func ensureSessionActive() async {
        do {
            try sessionConfigurator.activate()
            try voiceEngine.start()
            await updateStatus("音声エンジン稼働中")
        } catch {
            await updateStatus("音声再開に失敗しました")
            logger.error("Failed to reactivate audio engine: \(error.localizedDescription, privacy: .public)")
        }
    }

    private nonisolated func updateStatus(_ text: String) async {
        await MainActor.run { self.status = text }
    }
}
