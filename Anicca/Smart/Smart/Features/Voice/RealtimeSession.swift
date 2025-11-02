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
    private var remoteRenderer: LiveKit.AudioPlayerRenderer?
    private weak var currentRemoteTrack: RemoteAudioTrack?
    private var lastTokenResponse: LiveKitTokenResponse?

    init(mobileClient: MobileAPIClientProtocol, userResolver: DeviceIdentityProviding) {
        self.mobileClient = mobileClient
        self.userResolver = userResolver
        self.room = Room()
        super.init()
    }

    func connect(userId: String) async throws -> LiveKitTokenResponse {
        if isConnecting {
            logger.debug("Skip connect because another attempt is in progress")
            if let cached = lastTokenResponse { return cached }
            throw APIError.realtimeTokenFetchFailed(statusCode: -1)
        }

        if room.connectionState == .connected || room.connectionState == .connecting {
            logger.debug("Room already connected or connecting")
            if let cached = lastTokenResponse { return cached }
            throw APIError.realtimeTokenFetchFailed(statusCode: -1)
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
            await stopRemoteRenderer()

            isConnected = true
            connectionState = room.connectionState
            statusMessage = "LiveKit接続完了"
            lastErrorMessage = nil
            retryAttempts = 0
            logger.info("LiveKit room connected")
            lastTokenResponse = response
            return response
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
        await stopRemoteRenderer()
        isConnected = false
        connectionState = .disconnected
        statusMessage = "LiveKit切断済み"
        lastTokenResponse = nil
    }

    func handleForegroundResume() async {
        guard room.connectionState == .disconnected else { return }
        guard let userId = userResolver?.userId else {
            statusMessage = "デバイス識別子の取得に失敗しました"
            lastErrorMessage = statusMessage
            return
        }
        do {
            _ = try await connect(userId: userId)
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
        guard self.retryAttempts < AppConfig.maxRealtimeReconnectAttempts else {
            self.statusMessage = "接続できませんでした。ネットワーク状態を確認してください。"
            self.lastErrorMessage = self.statusMessage
            logger.error("Exceeded maximum LiveKit reconnect attempts")
            return
        }
        self.retryAttempts += 1
        self.statusMessage = "LiveKit再接続中 (\(self.retryAttempts)/\(AppConfig.maxRealtimeReconnectAttempts))"
        logger.info("Scheduling LiveKit reconnect attempt \(self.retryAttempts)")

        Task { [weak self, weak userResolver] in
            guard let self else { return }
            let delay = UInt64(Double(self.retryAttempts) * 1_000_000_000)
            try? await Task.sleep(nanoseconds: delay)

            guard let userId = userResolver?.userId else {
                await MainActor.run {
                    self.statusMessage = "デバイス識別子の取得に失敗しました"
                    self.lastErrorMessage = self.statusMessage
                }
                return
            }

            do {
                _ = try await self.connect(userId: userId)
            } catch {
                await MainActor.run {
                    self.lastErrorMessage = error.localizedDescription
                }
                self.scheduleReconnect()
            }
        }
    }

    @MainActor
    private func attachRemoteRenderer(to track: RemoteAudioTrack) async {
        await stopRemoteRenderer()
        let renderer = LiveKit.AudioPlayerRenderer()
        do {
            try await renderer.start()
            track.add(audioRenderer: renderer)
            remoteRenderer = renderer
            currentRemoteTrack = track
            statusMessage = "音声受信中"
        } catch {
            lastErrorMessage = "音声再生初期化に失敗しました: \(error.localizedDescription)"
            statusMessage = "LiveKit音声の取得に失敗しました"
        }
    }

    @MainActor
    private func stopRemoteRenderer() async {
        guard let renderer = remoteRenderer else { return }
        currentRemoteTrack?.remove(audioRenderer: renderer)
        renderer.stop()
        remoteRenderer = nil
        currentRemoteTrack = nil
    }
}

@MainActor
extension RealtimeSession: RoomDelegate {
    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.debug("Connection state changed \(String(describing: oldConnectionState)) -> \(String(describing: connectionState))")
            self.connectionState = connectionState
            self.isConnected = connectionState == .connected
        }
    }

    nonisolated func roomDidConnect(_ room: Room) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.info("LiveKit room did connect delegate")
            self.statusMessage = "LiveKit接続完了"
            self.isConnected = true
            self.lastErrorMessage = nil
            self.retryAttempts = 0
        }
    }

    nonisolated func roomIsReconnecting(_ room: Room) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.warning("LiveKit room is reconnecting")
            self.statusMessage = "LiveKit再接続中"
        }
    }

    nonisolated func roomDidReconnect(_ room: Room) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.info("LiveKit room did reconnect")
            self.statusMessage = "LiveKit再接続完了"
            self.isConnected = true
            self.lastErrorMessage = nil
            self.retryAttempts = 0
        }
    }

    nonisolated func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let message = error?.localizedDescription ?? "不明なエラー"
            self.logger.error("LiveKit room disconnected: \(message, privacy: .public)")
            self.isConnected = false
            self.connectionState = room.connectionState
            self.statusMessage = "LiveKit切断: \(message)"
            self.lastErrorMessage = message
            await self.stopRemoteRenderer()
            self.scheduleReconnect()
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard let audioTrack = publication.track as? RemoteAudioTrack else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.info("Subscribed remote audio track")
            await self.attachRemoteRenderer(to: audioTrack)
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.info("Unsubscribed remote audio track")
            await self.stopRemoteRenderer()
            self.statusMessage = "音声待機中"
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didFailToSubscribeTrackWithSid trackSid: Track.Sid, error: LiveKitError) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.logger.error("Failed to subscribe remote track: \(error.localizedDescription, privacy: .public)")
            self.lastErrorMessage = error.localizedDescription
            self.statusMessage = "LiveKit音声の取得に失敗しました"
        }
    }
}
