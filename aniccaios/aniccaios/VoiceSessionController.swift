import AVFoundation
import Combine
import OSLog
import WebRTC

@MainActor
final class VoiceSessionController: NSObject, ObservableObject {
    @Published private(set) var connectionStatus: ConnectionState = .disconnected

    private let logger = Logger(subsystem: "com.anicca.ios", category: "VoiceSession")
    private let peerFactory = RTCPeerConnectionFactory()
    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var audioTrack: RTCAudioTrack?
    private var cachedSecret: ClientSecret?
    private var sessionModel: String = "gpt-realtime"   // Desktop と examples の最新版に合わせる

    func start(shouldResumeImmediately: Bool = false) {
        guard connectionStatus != .connecting else { return }
        setStatus(.connecting)
        Task { [weak self] in
            await self?.establishSession(resumeImmediately: shouldResumeImmediately)
        }
    }

    func stop() {
        logger.debug("Stopping realtime session")
        peerConnection?.close()
        peerConnection = nil
        dataChannel = nil
        audioTrack = nil
        cachedSecret = nil
        setStatus(.disconnected)
        deactivateAudioSession()
    }

    private func establishSession(resumeImmediately: Bool) async {
        do {
            let secret = try await obtainClientSecret()
            if !resumeImmediately {
                try configureAudioSession()
            }
            setupPeerConnection()
            setupLocalAudio()
            try await negotiateWebRTC(using: secret)
            sendSessionUpdate()
        } catch {
            logger.error("Failed to establish session: \(error.localizedDescription, privacy: .public)")
            stop()
        }
    }

    private func obtainClientSecret() async throws -> ClientSecret {
        if let cached = cachedSecret, cached.isValid {
            return cached
        }

        var request = URLRequest(url: AppConfig.realtimeSessionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
                         forHTTPHeaderField: "device-id")
        request.httpBody = Data("{}".utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw VoiceSessionError.networkFailure
        }

        let payload = try JSONDecoder().decode(RealtimeSessionResponse.self, from: data)
        if let latest = payload.model {
            sessionModel = latest
        } else {
            sessionModel = "gpt-realtime"
        }
        let secret = payload.clientSecretModel
        cachedSecret = secret
        return secret
    }

    private func negotiateWebRTC(using secret: ClientSecret) async throws {
        guard let peerConnection else {
            throw VoiceSessionError.peerUnavailable
        }

        let config = RTCDataChannelConfiguration()
        dataChannel = peerConnection.dataChannel(forLabel: "oai-events", configuration: config)
        dataChannel?.delegate = self

        let constraints = RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true"],
                                              optionalConstraints: nil)

        let offer: RTCSessionDescription = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            peerConnection.offer(for: constraints) { sdp, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: VoiceSessionError.offerFailed)
                }
            }
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection.setLocalDescription(offer) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }

        let answerSDP = try await fetchRemoteSDP(secret: secret, localSdp: offer.sdp)
        let answer = RTCSessionDescription(type: .answer, sdp: answerSDP)

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection.setRemoteDescription(answer) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }

        setStatus(.connected)
    }

    private func fetchRemoteSDP(secret: ClientSecret, localSdp: String) async throws -> String {
        guard !secret.value.isEmpty else {
            throw VoiceSessionError.missingClientSecret
        }

        var components = URLComponents(string: "https://api.openai.com/v1/realtime")
        components?.queryItems = [URLQueryItem(name: "model", value: sessionModel)]
        guard let url = components?.url else {
            throw VoiceSessionError.remoteSDPFailed
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(secret.value)", forHTTPHeaderField: "Authorization")
        request.httpBody = localSdp.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            if let http = response as? HTTPURLResponse {
                logger.error("Realtime SDP exchange failed with status \(http.statusCode)")
            }
            cachedSecret = nil
            throw VoiceSessionError.remoteSDPFailed
        }

        guard let answerSdp = String(data: data, encoding: .utf8) else {
            throw VoiceSessionError.remoteSDPDecoding
        }

        return answerSdp
    }

    private func setupPeerConnection() {
        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        peerConnection = peerFactory.peerConnection(with: config, constraints: constraints, delegate: self)
    }

    private func setupLocalAudio() {
        guard let peerConnection else { return }
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "googEchoCancellation": "true",
                "googAutoGainControl": "true",
                "googNoiseSuppression": "true",
                "googHighpassFilter": "true"
            ],
            optionalConstraints: nil
        )
        let audioSource = peerFactory.audioSource(with: constraints)
        let track = peerFactory.audioTrack(with: audioSource, trackId: "anicca_local_audio")
        peerConnection.add(track, streamIds: ["anicca"])
        audioTrack = track
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            options: [.defaultToSpeaker, .allowBluetoothA2DP, .allowBluetoothHFP]
        )
        try session.setMode(.videoChat)
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        try session.overrideOutputAudioPort(.speaker)
    }

    private func deactivateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func setStatus(_ state: ConnectionState) {
        DispatchQueue.main.async { [weak self] in
            self?.connectionStatus = state
        }
    }
}

extension VoiceSessionController: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        logger.debug("Data channel opened")
        dataChannel.delegate = self
        Task { @MainActor in
            self.sendSessionUpdate()
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCIceConnectionState) {
        logger.debug("ICE state changed: \(stateChanged.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
}

extension VoiceSessionController: RTCDataChannelDelegate {
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        logger.debug("Data channel state: \(dataChannel.readyState.rawValue)")
        if dataChannel.readyState == .open {
            self.sendSessionUpdate()
        }
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        logger.debug("Realtime event: \(text, privacy: .public)")
    }
}

private extension VoiceSessionController {
    @MainActor
    func sendSessionUpdate() {
        guard let channel = dataChannel, channel.readyState == .open else { return }
        var sessionPayload: [String: Any] = [
            "modalities": ["text", "audio"],
            "voice": "alloy",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "turn_detection": [
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500,
                "create_response": true
            ],
            "max_response_output_tokens": "inf"
        ]

        var shouldTriggerWakeResponse = false
        if let prompt = AppState.shared.consumeWakePrompt() {
            sessionPayload["instructions"] = prompt
            shouldTriggerWakeResponse = true   // wake プロンプト送信を記録
        }

        let update: [String: Any] = [
            "type": "session.update",
            "session": sessionPayload
        ]

        do {
            let json = try JSONSerialization.data(withJSONObject: update, options: [.fragmentsAllowed])
            let buffer = RTCDataBuffer(data: json, isBinary: false)
            channel.sendData(buffer)
        } catch {
            logger.error("Failed to send session.update: \(error.localizedDescription, privacy: .public)")
        }

        if shouldTriggerWakeResponse {
            sendWakeResponseCreate()
            AppState.shared.clearPendingWakeTrigger()
        }
    }

    private func sendWakeResponseCreate() {
        guard let channel = dataChannel, channel.readyState == .open else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: ["type": "response.create"]) else { return }
        channel.sendData(RTCDataBuffer(data: data, isBinary: false))
    }
}

private struct RealtimeSessionResponse: Decodable {
    struct ClientSecretPayload: Decodable {
        let value: String
        let expiresAt: TimeInterval

        enum CodingKeys: String, CodingKey {
            case value
            case expiresAt = "expires_at"
        }
    }

    let clientSecret: ClientSecretPayload
    let model: String?

    enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
        case model
    }

    var clientSecretModel: ClientSecret {
        ClientSecret(value: clientSecret.value, expiresAt: clientSecret.expiresAt)
    }
}

private struct ClientSecret {
    let value: String
    let expiresAt: TimeInterval

    var expiryDate: Date {
        Date(timeIntervalSince1970: expiresAt)
    }

    var isValid: Bool {
        expiryDate.timeIntervalSinceNow > 5
    }
}

private enum VoiceSessionError: Error {
    case networkFailure
    case offerFailed
    case peerUnavailable
    case remoteSDPFailed
    case remoteSDPDecoding
    case missingClientSecret
}

enum ConnectionState {
    case disconnected
    case connecting
    case connected

    var label: String {
        switch self {
        case .disconnected:
            "Status: Session Ended"
        case .connecting:
            "Status: Connecting…"
        case .connected:
            "Status: Connected"
        }
    }

    var subtitle: String {
        switch self {
        case .disconnected:
            "Tap to restart the voice session."
        case .connecting:
            "Hold still, wiring the call…"
        case .connected:
            "You can talk freely—Anicca is listening."
        }
    }
}
