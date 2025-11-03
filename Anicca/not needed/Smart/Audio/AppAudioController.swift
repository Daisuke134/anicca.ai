import AVFoundation
import Combine
import OSLog
import SwiftUI

@MainActor
final class AppAudioController: ObservableObject {
    @Published var status: String = "音声準備前"
    @Published private(set) var realtimeStatus: String = "Realtime未接続"
    @Published private(set) var isRealtimeConnected: Bool = false
    @Published private(set) var hasRealtimeError: Bool = false

    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioBootstrap")
    private let sessionConfigurator = AudioSessionConfigurator.shared
    private let voiceEngine = VoiceEngine.shared
    private let audioManager = AudioManager.shared
    private let permissionManager = MicrophonePermissionManager()
    private let identityStore: DeviceIdentityProviding
    private let realtimeSession: OpenAIRealtimeSession
    private var cancellables: Set<AnyCancellable> = []
    private var didPrepare = false

    init(
        identityStore: DeviceIdentityProviding,
        realtimeSession: OpenAIRealtimeSession
    ) {
        self.identityStore = identityStore
        self.realtimeSession = realtimeSession
        voiceEngine.onMicrophoneFrame = nil
        bindRealtimeSession()
    }

    convenience init() {
        self.init(
            identityStore: DeviceIdentityStore.shared,
            realtimeSession: OpenAIRealtimeSession(apiClient: MobileAPIClient.shared)
        )
    }

    func prepare() async {
        guard !didPrepare else {
            await ensureSessionActive()
            await connectRealtimeIfNeeded()
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
            try configureAudioManager()
            try voiceEngine.start()
            didPrepare = true
            await updateStatus("音声エンジン稼働中")
            logger.info("Audio engine started successfully")
            await connectRealtimeIfNeeded()
        } catch {
            await updateStatus("音声初期化に失敗しました")
            logger.error("Failed to start audio engine: \(error.localizedDescription, privacy: .public)")
        }
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            Task {
                await ensureSessionActive()
                if let userId = identityStore.userId {
                    await realtimeSession.handleForegroundResume(userId: userId)
                } else {
                    await updateStatus("デバイス識別子の取得に失敗しました")
                }
            }
        case .inactive, .background:
            Task {
                await realtimeSession.disconnect()
            }
            try? audioManager.setManualRenderingMode(false)
            sessionConfigurator.deactivate()
            voiceEngine.stop()
            logger.info("Audio engine paused for background state")
        @unknown default:
            break
        }
    }

    func startConversation() async {
        guard let userId = identityStore.userId else { return }
        await connectRealtime(userId: userId)
    }

    func stopConversation() async {
        await realtimeSession.disconnect()
    }

    private func ensureSessionActive() async {
        do {
            try sessionConfigurator.activate()
            try configureAudioManager()
            try voiceEngine.start()
            await updateStatus("音声エンジン稼働中")
        } catch {
            await updateStatus("音声再開に失敗しました")
            logger.error("Failed to reactivate audio engine: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func connectRealtimeIfNeeded() async {
        guard let userId = identityStore.userId else {
            await updateStatus("デバイス識別子の取得に失敗しました")
            realtimeStatus = "デバイス識別子の取得に失敗しました"
            hasRealtimeError = true
            return
        }

        await connectRealtime(userId: userId)
    }

    private func bindRealtimeSession() {
        realtimeSession.$statusMessage
            .receive(on: RunLoop.main)
            .sink { [weak self] message in
                self?.realtimeStatus = message
            }
            .store(in: &cancellables)

        realtimeSession.$isConnected
            .receive(on: RunLoop.main)
            .sink { [weak self] isConnected in
                self?.isRealtimeConnected = isConnected
                if isConnected {
                    self?.hasRealtimeError = false
                }
            }
            .store(in: &cancellables)

        realtimeSession.$lastErrorMessage
            .receive(on: RunLoop.main)
            .sink { [weak self] errorMessage in
                self?.hasRealtimeError = errorMessage != nil
            }
            .store(in: &cancellables)
    }

    private func configureAudioManager() throws {
        try audioManager.setVoiceProcessingEnabled(true)
        try audioManager.setManualRenderingMode(true)
        audioManager.mixer.micVolume = 1.0
        audioManager.mixer.appVolume = 1.0
    }

    private nonisolated func updateStatus(_ text: String) async {
        await MainActor.run { self.status = text }
    }

    private func connectRealtime(userId: String) async {
        do {
            await realtimeSession.connect(userId: userId)
        } catch {
            let message = "Realtime接続に失敗しました: \(error.localizedDescription)"
            await updateStatus(message)
            realtimeStatus = message
            hasRealtimeError = true
            await realtimeSession.disconnect()
        }
    }
}
