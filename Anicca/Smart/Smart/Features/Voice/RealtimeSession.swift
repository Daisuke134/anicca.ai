import Combine
import Foundation
import LiveKit
import OSLog

@MainActor
final class RealtimeSession: NSObject, ObservableObject {
    @Published private(set) var isConnected: Bool = false
    @Published private(set) var statusMessage: String = "LiveKit未接続"
    @Published private(set) var connectionState: ConnectionState = .disconnected
    @Published private(set) var lastErrorMessage: String?

    private let mobileClient: MobileAPIClientProtocol
    private weak var userResolver: DeviceIdentityProviding?
    private let room: Room
    private let logger = Logger(subsystem: "com.anicca.ios", category: "RTC")
    private var hasAttachedDelegate = false
    private var isConnecting = false
    private var retryAttempts = 0
    private var remoteRenderer: AudioPlayerRenderer?

    init(mobileClient: MobileAPIClientProtocol, userResolver: DeviceIdentityProviding) {
        self.mobileClient = mobileClient
        self.userResolver = userResolver
        self.room = Room()
        super.init()
    }

    func connect(userId: String) async throws {
        guard !isConnecting else {
            logger.debug("Skip connect because another attempt is in progress")
            return
        }

        if room.connectionState == .connected || room.connectionState == .connecting {
            logger.debug("Room already connected or connecting")
            return
        }

        isConnecting = true
        defer { isConnecting = false }

        statusMessage = "LiveKitトークン取得中"
        lastErrorMessage = nil

        let response: LiveKitTokenResponse
        do {
            response = try await mobileClient.fetchLiveKitToken(userId: userId)
        } catch let apiError as APIError {
            let message = apiError.errorDescription ?? "LiveKitトークンの取得に失敗しました"
            statusMessage = message
            lastErrorMessage = message
            logger.error("Token fetch failed: \(message, privacy: .public)")
            throw apiError
        } catch {
            let message = "LiveKitトークンの取得に失敗しました: \(error.localizedDescription)"
            statusMessage = message
            lastErrorMessage = message
            logger.error("Token fetch unexpected failure: \(error.localizedDescription, privacy: .public)")
            throw error
        }

        if !hasAttachedDelegate {
            room.delegates.add(delegate: self)
            hasAttachedDelegate = true
        }

        statusMessage = "LiveKit接続中"

        do {
            try await room.connect(url: response.url.absoluteString, token: response.token, connectOptions: AppConfig.liveKitConnectOptions)
            try await room.localParticipant.setMicrophone(enabled: true)
            AudioManager.shared.stopAllRemoteRenderers()
            remoteRenderer = nil

            isConnected = true
            connectionState = room.connectionState
            statusMessage = "LiveKit接続完了"
            lastErrorMessage = nil
            retryAttempts = 0
            logger.info("LiveKit room connected")
        } catch {
            let message = "LiveKit接続に失敗しました: \(error.localizedDescription)"
            statusMessage = message
            lastErrorMessage = message
            connectionState = room.connectionState
            logger.error("Room connect failed: \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    func disconnect() async {
        guard room.connectionState != .disconnected else { return }
        logger.info("Disconnecting LiveKit room")
        await room.disconnect()
        AudioManager.shared.stopAllRemoteRenderers()
        remoteRenderer = nil
        isConnected = false
        connectionState = .disconnected
        statusMessage = "LiveKit切断済み"
    }

    func handleForegroundResume() async {
        guard room.connectionState == .disconnected else { return }
        guard let userId = userResolver?.userId else {
            statusMessage = "デバイス識別子の取得に失敗しました"
            lastErrorMessage = statusMessage
            return
        }
        do {
            try await connect(userId: userId)
        } catch {
            logger.error("Foreground reconnect failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func scheduleReconnect() {
        guard let userResolver else {
            statusMessage = "デバイス識別子の取得に失敗しました"
            lastErrorMessage = statusMessage
            return
        }
        guard retryAttempts < AppConfig.maxRealtimeReconnectAttempts else {
            statusMessage = "接続できませんでした。ネットワーク状態を確認してください。"
            lastErrorMessage = statusMessage
            logger.error("Exceeded maximum LiveKit reconnect attempts")
            return
        }
        retryAttempts += 1
        statusMessage = "LiveKit再接続中 (\(retryAttempts)/\(AppConfig.maxRealtimeReconnectAttempts))"
        logger.info("Scheduling LiveKit reconnect attempt \(retryAttempts)")

        Task { [weak self, weak userResolver] in
            guard let self else { return }
            let delay = UInt64(Double(retryAttempts) * 1_000_000_000)
            try? await Task.sleep(nanoseconds: delay)

            guard let userId = userResolver?.userId else {
                await MainActor.run {
                    self.statusMessage = "デバイス識別子の取得に失敗しました"
                    self.lastErrorMessage = self.statusMessage
                }
                return
            }

            do {
                try await self.connect(userId: userId)
            } catch {
                await MainActor.run {
                    self.lastErrorMessage = error.localizedDescription
                }
                self.scheduleReconnect()
            }
        }
    }
}

extension RealtimeSession: RoomDelegate {
    func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        logger.debug("Connection state changed \(String(describing: oldConnectionState)) -> \(String(describing: connectionState))")
        self.connectionState = connectionState
        isConnected = connectionState == .connected
    }

    func roomDidConnect(_ room: Room) {
        logger.info("LiveKit room did connect delegate")
        statusMessage = "LiveKit接続完了"
        isConnected = true
        lastErrorMessage = nil
        retryAttempts = 0
    }

    func roomIsReconnecting(_ room: Room) {
        logger.warning("LiveKit room is reconnecting")
        statusMessage = "LiveKit再接続中"
    }

    func roomDidReconnect(_ room: Room) {
        logger.info("LiveKit room did reconnect")
        statusMessage = "LiveKit再接続完了"
        isConnected = true
        lastErrorMessage = nil
        retryAttempts = 0
    }

    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
        let message = error?.localizedDescription ?? "不明なエラー"
        logger.error("LiveKit room disconnected: \(message, privacy: .public)")
        isConnected = false
        connectionState = room.connectionState
        statusMessage = "LiveKit切断: \(message)"
        lastErrorMessage = message
        AudioManager.shared.stopAllRemoteRenderers()
        remoteRenderer = nil
        scheduleReconnect()
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard let audioTrack = publication.track as? RemoteAudioTrack else { return }
        logger.info("Subscribed remote audio track")
        let renderer = AudioPlayerRenderer(track: audioTrack)
        AudioManager.shared.add(remoteAudioRenderer: renderer)
        remoteRenderer = renderer
        statusMessage = "音声受信中"
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        guard let renderer = remoteRenderer else { return }
        logger.info("Unsubscribed remote audio track")
        AudioManager.shared.remove(remoteAudioRenderer: renderer)
        remoteRenderer = nil
        statusMessage = "音声待機中"
    }

    func room(_ room: Room, participant: RemoteParticipant, didFailToSubscribeTrackWithSid trackSid: Track.Sid, error: LiveKitError) {
        logger.error("Failed to subscribe remote track: \(error.localizedDescription, privacy: .public)")
        lastErrorMessage = error.localizedDescription
        statusMessage = "LiveKit音声の取得に失敗しました"
    }
}
