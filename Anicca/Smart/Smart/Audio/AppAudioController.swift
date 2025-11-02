import AVFoundation
import Combine
import OSLog
import SwiftUI

@MainActor
final class AppAudioController: ObservableObject {
    @Published var status: String = "音声準備前"
    @Published private(set) var realtimeStatus: String = "LiveKit未接続"
    @Published private(set) var isRealtimeConnected: Bool = false
    @Published private(set) var hasRealtimeError: Bool = false

    private let logger = Logger(subsystem: "com.anicca.ios", category: "AudioBootstrap")
    private let sessionConfigurator = AudioSessionConfigurator.shared
    private let voiceEngine = VoiceEngine.shared
    private let permissionManager = MicrophonePermissionManager()
    private let identityStore: DeviceIdentityProviding
    private let realtimeSession: RealtimeSession
    private var cancellables: Set<AnyCancellable> = []
    private var didPrepare = false

    init(
        identityStore: DeviceIdentityProviding,
        realtimeSession: RealtimeSession
    ) {
        self.identityStore = identityStore
        self.realtimeSession = realtimeSession
        bindRealtimeSession()
    }

    convenience init() {
        self.init(
            identityStore: DeviceIdentityStore.shared,
            realtimeSession: RealtimeSession(
                mobileClient: MobileAPIClient.shared,
                userResolver: DeviceIdentityStore.shared
            )
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
                await realtimeSession.handleForegroundResume()
            }
        case .inactive, .background:
            Task { await realtimeSession.disconnect() }
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

    private func connectRealtimeIfNeeded() async {
        guard let userId = identityStore.userId else {
            await updateStatus("デバイス識別子の取得に失敗しました")
            realtimeStatus = "デバイス識別子の取得に失敗しました"
            hasRealtimeError = true
            return
        }

        do {
            try await realtimeSession.connect(userId: userId)
        } catch {
            let message = "LiveKitトークン取得失敗: \(error.localizedDescription)"
            await updateStatus(message)
            realtimeStatus = message
            hasRealtimeError = true
        }
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

    private nonisolated func updateStatus(_ text: String) async {
        await MainActor.run { self.status = text }
    }
}
