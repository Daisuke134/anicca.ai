import Foundation
import OSLog
import WebRTC

@MainActor
final class OpenAIRealtimeSession: NSObject, ObservableObject {
    @Published private(set) var isConnected = false
    @Published private(set) var statusMessage = "Realtime未接続"
    @Published private(set) var lastErrorMessage: String?

    private let apiClient: MobileAPIClientProtocol
    private let peerFactory: RTCPeerConnectionFactory
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var localAudioSource: RTCAudioSource?
    private var clientSecret: String?
    private var renewalDeadline: Date?
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Realtime")
    private var receiveTask: Task<Void, Never>?
    private var retryAttempts = 0

    init(apiClient: MobileAPIClientProtocol, peerFactory: RTCPeerConnectionFactory = RTCPeerConnectionFactory()) {
        self.apiClient = apiClient
        self.peerFactory = peerFactory
        super.init()
    }

    func connect(userId: String) async {
        await disconnect()
        statusMessage = "client_secret取得中"
        lastErrorMessage = nil
        do {
            let response = try await apiClient.fetchRealtimeClientSecret(userId: userId)
            clientSecret = response.value
            renewalDeadline = Date(timeIntervalSince1970: response.expiresAt - 5)
            statusMessage = "Realtime接続中"
            try await establishPeerConnection()
            statusMessage = "Realtime接続完了"
            isConnected = true
            retryAttempts = 0
            lastErrorMessage = nil
        } catch {
            logger.error("Failed to connect: \(error.localizedDescription, privacy: .public)")
            statusMessage = "Realtime接続に失敗しました"
            lastErrorMessage = error.localizedDescription
            scheduleReconnect(userId: userId)
        }
    }

    func disconnect() async {
        receiveTask?.cancel()
        receiveTask = nil
        localAudioTrack = nil
        localAudioSource = nil
        peerConnection?.close()
        peerConnection = nil
        isConnected = false
        statusMessage = "Realtime切断済み"
    }

    func handleForegroundResume(userId: String) async {
        guard !isConnected else { return }
        await connect(userId: userId)
    }

    private func establishPeerConnection() async throws {
        guard let token = clientSecret else { throw RealtimeError.missingClientSecret }

        let configuration = RTCConfiguration()
        configuration.continualGatheringPolicy = .gatherContinually
        configuration.sdpSemantics = .unifiedPlan

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let connection = peerFactory.peerConnection(with: configuration, constraints: constraints, delegate: self)
        peerConnection = connection

        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = peerFactory.audioSource(with: audioConstraints)
        localAudioSource = audioSource
        let audioTrack = peerFactory.audioTrack(with: audioSource, trackId: "mic")
        localAudioTrack = audioTrack
        connection.add(audioTrack, streamIds: ["anicca"])

        let offerConstraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true"],
            optionalConstraints: nil
        )
        let offer = try await connection.offer(for: offerConstraints)
        try await connection.setLocalDescription(offer)

        let body: [String: String] = ["sdp": offer.sdp, "type": "offer"]
        let answerDescription = try await sendOffer(payload: body, token: token)
        try await connection.setRemoteDescription(answerDescription)
    }

    private func sendOffer(payload: [String: String], token: String) async throws -> RTCSessionDescription {
        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/realtime/webrtc")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw RealtimeError.signalingFailed
        }

        let decoded = try JSONDecoder().decode(WebRTCAnswer.self, from: data)
        return RTCSessionDescription(type: .answer, sdp: decoded.sdp)
    }

    private func scheduleReconnect(userId: String) {
        guard retryAttempts < AppConfig.maxRealtimeReconnectAttempts else {
            logger.error("Exceeded realtime reconnect attempts")
            return
        }
        retryAttempts += 1
        statusMessage = "Realtime再接続中 (\(retryAttempts))"
        receiveTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(Double(retryAttempts) * 1_000_000_000))
            await self.connect(userId: userId)
        }
    }
}

private struct WebRTCAnswer: Decodable {
    let sdp: String
}

enum RealtimeError: LocalizedError {
    case missingClientSecret
    case signalingFailed

    var errorDescription: String? {
        switch self {
        case .missingClientSecret:
            return "client_secret を取得できませんでした"
        case .signalingFailed:
            return "OpenAI Realtime シグナリングに失敗しました"
        }
    }
}

extension OpenAIRealtimeSession: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor [weak self] in
            self?.connectionStateDidChange(newState)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCIceGatheringState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        Task { @MainActor [weak self] in
            self?.logger.debug("Generated ICE candidate: \(candidate.sdp)")
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange rtpReceiver: RTCRtpReceiver, streams: [RTCMediaStream]) {}

    private func connectionStateDidChange(_ state: RTCIceConnectionState) {
        switch state {
        case .connected, .completed:
            statusMessage = "Realtime接続完了"
            isConnected = true
            lastErrorMessage = nil
        case .failed, .disconnected, .closed:
            statusMessage = "Realtime接続が切断されました"
            isConnected = false
        default:
            break
        }
    }
}
