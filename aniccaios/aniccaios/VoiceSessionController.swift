import AVFoundation
import Combine
import OSLog
import WebRTC

@MainActor
final class VoiceSessionController: NSObject, ObservableObject {
    static let shared = VoiceSessionController()
    
    @Published private(set) var connectionStatus: ConnectionState = .disconnected

    private let logger = Logger(subsystem: "com.anicca.ios", category: "VoiceSession")
    private let peerFactory = RTCPeerConnectionFactory()
    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var audioTrack: RTCAudioTrack?
    private var cachedSecret: ClientSecret?
    private var activeSessionId: String?
    private var sessionModel: String = "gpt-realtime"   // Desktop と examples の最新版に合わせる
    private var sessionTimeoutTask: Task<Void, Never>?
    private var usageTrackingTask: Task<Void, Never>?
    private var sessionStartTime: Date?
    private var lastServerSyncTime: Date?
    private var currentHabitType: HabitType?
    
    // Sticky mode (applies to all habits when enabled)
    private var stickyActive = false
    private var stickyUserReplyCount = 0
    private var stickyReady = false
    private let stickyReleaseThreshold = 10
    
    private var isStickyEnabled: Bool {
        AppState.shared.userProfile.stickyModeEnabled
    }
    
    private override init() {
        super.init()
    }

    func start(shouldResumeImmediately: Bool = false) {
        guard connectionStatus != .connecting else { return }
        setStatus(.connecting)
        // 現在の習慣タイプを設定（pendingHabitTriggerから取得）
        currentHabitType = AppState.shared.pendingHabitTrigger?.habit
        
        // ★★★ セッション開始時に残りのアラームをすべてキャンセル ★★★
        if let habit = currentHabitType {
            cancelRemainingAlarmsForHabit(habit)
        }
        
        // Stickyモードは全習慣に適用
        if currentHabitType != nil && isStickyEnabled {
            stickyActive = true
            stickyUserReplyCount = 0
            stickyReady = false
        } else {
            stickyActive = false
            stickyUserReplyCount = 0
            stickyReady = false
        }
        Task { [weak self] in
            await self?.establishSession(resumeImmediately: shouldResumeImmediately)
        }
    }
    
    func startFromVoip(habit: HabitType) {
        guard connectionStatus != .connecting else { return }
        setStatus(.connecting)
        
        // 現在の習慣タイプを設定
        currentHabitType = habit
        
        // ★★★ VoIPからのセッション開始時も残りのアラームをキャンセル ★★★
        cancelRemainingAlarmsForHabit(habit)
        
        // Prepare prompt for the habit
        AppState.shared.prepareForImmediateSession(habit: habit)
        
        // Stickyモードは全習慣に適用
        if isStickyEnabled {
            stickyActive = true
            stickyUserReplyCount = 0
            stickyReady = false
        } else {
            stickyActive = false
            stickyUserReplyCount = 0
            stickyReady = false
        }
        
        Task { [weak self] in
            await self?.establishSession(resumeImmediately: true)
        }
    }

    func stop() {
        logger.debug("Stopping realtime session")
        currentHabitType = nil
        stickyActive = false
        stickyUserReplyCount = 0
        stickyReady = false
        sessionTimeoutTask?.cancel()
        sessionTimeoutTask = nil
        usageTrackingTask?.cancel()
        usageTrackingTask = nil
        sessionStartTime = nil
        lastServerSyncTime = nil
        Task { await self.notifyStopIfNeeded() }
        peerConnection?.close()
        peerConnection = nil
        dataChannel = nil
        audioTrack = nil
        cachedSecret = nil
        setStatus(.disconnected)
        deactivateAudioSession()
        // stop()時にはmarkQuotaHoldを呼ばない（エンドセッション押下時の誤表示を防ぐ）
    }
    
    /// 習慣セッション開始時に、その習慣の残りのアラーム/フォローアップをすべてキャンセル
    private func cancelRemainingAlarmsForHabit(_ habit: HabitType) {
        logger.info("Session started for \(habit.rawValue, privacy: .public) - cancelling all remaining alarms")
        
        // 通常の通知フォローアップをキャンセル（AlarmKit含む）
        NotificationScheduler.shared.cancelFollowups(for: habit, includeAlarmKit: true)
    }
    
    private func notifyStopIfNeeded() async {
        guard let sessionId = activeSessionId,
              case .signedIn(let credentials) = AppState.shared.authStatus else {
            return
        }
        
        var request = URLRequest(url: AppConfig.realtimeSessionStopURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        
        do {
            let body = ["session_id": sessionId]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            _ = try await NetworkSessionManager.shared.session.data(for: request)
        } catch {
            logger.error("Failed to notify session stop: \(error.localizedDescription, privacy: .public)")
        }
        
        activeSessionId = nil
    }

    @MainActor
    private func establishSession(resumeImmediately: Bool) async {
        // マイクロフォン権限チェック（WebRTC初期化前に必須）
        // Guideline 2.1対応: iPadでの即終了バグ修正のため、権限チェックを強化
        let hasPermission: Bool
        if #available(iOS 17.0, *) {
            let status = AVAudioApplication.shared.recordPermission
            if status == .undetermined {
                // 未決定の場合はリクエスト
                let granted = await withCheckedContinuation { continuation in
                    AVAudioApplication.requestRecordPermission { granted in
                        continuation.resume(returning: granted)
                    }
                }
                hasPermission = granted
            } else {
                hasPermission = status == .granted
            }
        } else {
            let status = AVAudioSession.sharedInstance().recordPermission
            if status == .undetermined {
                let granted = await withCheckedContinuation { continuation in
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        continuation.resume(returning: granted)
                    }
                }
                hasPermission = granted
            } else {
                hasPermission = status == .granted
            }
        }
        
        guard hasPermission else {
            logger.error("Microphone permission not granted")
            setStatus(.disconnected)
            // ユーザーに権限が必要であることを通知（必要に応じてアラート表示）
            return
        }
        
        setStatus(.connecting)
        
        do {
            let secret = try await obtainClientSecret()
            try AudioSessionCoordinator.shared.configureForRealtime(reactivating: resumeImmediately)
            setupPeerConnection()
            setupLocalAudio()
            try await negotiateWebRTC(using: secret)
            sendSessionUpdate()
        } catch VoiceSessionError.quotaExceeded {
            // 402エラー時はPaywallを表示してセッションを終了
            logger.warning("Quota exceeded, showing paywall")
            await MainActor.run {
                AppState.shared.markQuotaHold(plan: nil)
            }
            setStatus(.disconnected)
        } catch {
            logger.error("Failed to establish session: \(error.localizedDescription, privacy: .public)")
            // 接続失敗時はユーザーに再試行可能な状態にする（即終了しない）
            setStatus(.disconnected)
        }
    }

    private func obtainClientSecret() async throws -> ClientSecret {
        if let cached = cachedSecret, cached.isValid {
            return cached
        }

        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            throw VoiceSessionError.missingAuthentication
        }

        var request = URLRequest(url: AppConfig.realtimeSessionURL)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(AppState.shared.resolveDeviceId(),
                         forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId,
                         forHTTPHeaderField: "user-id")

        let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode == 402 {
            // 利用上限到達時の処理
            let plan: SubscriptionInfo.Plan
            if let env = try? JSONDecoder().decode(EntitlementEnvelope.self, from: data) {
                let planString = env.entitlement?.plan ?? "free"
                plan = SubscriptionInfo.Plan(rawValue: planString) ?? .free
            } else {
                plan = .free
            }
            await MainActor.run {
                // 毎回表示するために一度リセットしてから設定
                AppState.shared.markQuotaHold(plan: nil) // リセット
                AppState.shared.markQuotaHold(plan: plan) // 再設定
            }
            throw VoiceSessionError.quotaExceeded
        }
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw VoiceSessionError.networkFailure
        }

        let payload = try JSONDecoder().decode(RealtimeSessionResponse.self, from: data)
        sessionModel = "gpt-realtime"
        let secret = payload.clientSecretModel
        cachedSecret = secret
        activeSessionId = payload.sessionId
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
        sessionStartTime = Date()
        lastServerSyncTime = Date()
        startUsageTracking()
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

        let (data, response) = try await NetworkSessionManager.shared.session.data(for: request)
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
        
        // マイクロフォン権限の再確認（WebRTCがマイクにアクセスする直前）
        guard AVAudioSession.sharedInstance().recordPermission == .granted else {
            logger.error("Microphone permission not granted in setupLocalAudio")
            return
        }
        
        // トレーニング時はマイク入力を無効化
        let isTrainingMode = currentHabitType == .training
        
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
        
        // トレーニング時はマイクトラックを無効化
        if isTrainingMode {
            track.isEnabled = false
            logger.info("Training mode: microphone input disabled")
        }
        
        peerConnection.add(track, streamIds: ["anicca"])
        audioTrack = track
    }

    // 音声セッション設定は AudioSessionCoordinator に集約したため削除

    private func deactivateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func setStatus(_ state: ConnectionState) {
        DispatchQueue.main.async { [weak self] in
            self?.connectionStatus = state
        }
    }
    
    // 新規追加: セッション中の利用量を定期的にチェック
    // エビデンス: apps/api/src/routes/mobile/realtime.js で利用量はサーバー側で管理されているが、
    // クライアント側でリアルタイムチェックする仕組みがない
    private func startUsageTracking() {
        usageTrackingTask?.cancel()
        usageTrackingTask = Task { [weak self] in
            guard let self else { return }
            
            // 30秒ごとに利用量をチェック
            // エビデンス: SubscriptionManager.swift:70-98 でsyncUsageInfo()がサーバーから利用量を取得
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30秒
                
                await MainActor.run {
                    guard let startTime = self.sessionStartTime else { return }
                    let elapsedSeconds = Date().timeIntervalSince(startTime)
                    // エビデンス: apps/api/src/services/subscriptionStore.js:198 で
                    // billed_minutes = ceil(seconds / 60.0) として計算される
                    // サーバーと同じく切り上げ（ceil）で計算
                    let elapsedMinutes = Int(ceil(elapsedSeconds / 60.0))
                    
                    let subscription = AppState.shared.subscriptionInfo
                    guard subscription.monthlyUsageLimit != nil,
                          let remaining = subscription.monthlyUsageRemaining else {
                        // 利用量情報が取得できない場合は続行
                        return
                    }
                    
                    // 残り利用量が経過時間（分）を下回ったら強制終了
                    if remaining <= 0 || remaining < elapsedMinutes {
                        self.logger.warning("Monthly usage limit reached during session")
                        self.stop()
                        AppState.shared.markQuotaHold(plan: subscription.plan, reason: .quotaExceeded)
                        return
                    }
                    
                    // 5分ごとにサーバー同期で補正（エラー時はセッション継続）
                    if let lastSync = self.lastServerSyncTime,
                       Date().timeIntervalSince(lastSync) >= 300 {
                        self.lastServerSyncTime = Date()
                        Task.detached(priority: .utility) {
                            await SubscriptionManager.shared.syncNow()
                        }
                    }
                }
            }
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
            Task { @MainActor in
                self.sendSessionUpdate()
            }
        }
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard let text = String(data: buffer.data, encoding: .utf8) else { return }
        logger.debug("Realtime event: \(text, privacy: .public)")
        
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        handleRealtimeEvent(json)
    }
}

private extension VoiceSessionController {
    @MainActor
    func sendSessionUpdate() {
        guard let channel = dataChannel, channel.readyState == .open else { return }
        
        // トレーニング時はユーザーの割り込みを無効化（一方的な声かけモード）
        let isTrainingMode = currentHabitType == .training
        
        var sessionPayload: [String: Any] = [
            "modalities": ["text", "audio"],
            "voice": "alloy",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_noise_reduction": [
                "type": "near_field"
            ],
            "max_response_output_tokens": "inf"
        ]
        
        // トレーニング時は turn_detection を null に設定してマイク入力を完全に無効化
        if isTrainingMode {
            // トレーニング時: マイク入力を完全に無効化（一方向モード）
            sessionPayload["turn_detection"] = NSNull()
            logger.info("Training mode: turn_detection disabled for one-way audio")
        } else {
            // その他の習慣: 双方向対話を維持
            sessionPayload["turn_detection"] = [
                "type": "semantic_vad",
                "eagerness": "low",
                "interrupt_response": true,
                "create_response": true
            ]
        }

        var shouldTriggerHabitResponse = false
        var instructions: String?
        if let prompt = AppState.shared.consumePendingPrompt() {
            instructions = prompt
            shouldTriggerHabitResponse = true   // habit プロンプト送信を記録
        } else if let consultPrompt = AppState.shared.consumePendingConsultPrompt() {
            instructions = consultPrompt
        }
        if let instructions {
            sessionPayload["instructions"] = instructions
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

        if shouldTriggerHabitResponse {
            sendWakeResponseCreate()
            Task { @MainActor in
                AppState.shared.clearPendingHabitTrigger()
            }
        }
    }

    private func sendWakeResponseCreate() {
        guard let channel = dataChannel, channel.readyState == .open else {
            logger.warning("Sticky: cannot send response.create - channel not ready")
            return
        }
        guard let data = try? JSONSerialization.data(withJSONObject: ["type": "response.create"]) else {
            logger.error("Sticky: failed to serialize response.create")
            return
        }
        channel.sendData(RTCDataBuffer(data: data, isBinary: false))
        logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): sent response.create to keep talking")
    }
    
    private func handleRealtimeEvent(_ event: [String: Any]) {
        guard let type = event["type"] as? String else { return }
        switch type {
        case "output_audio_buffer.started":
            if stickyActive && !stickyReady {
                stickyReady = true
                logger.info("Sticky ready: first audio started")
                print("Sticky ready: first audio started")
            }
        case "conversation.item.done":
            guard stickyActive && stickyReady else { return }
            if
                let item = event["item"] as? [String: Any],
                let role = item["role"] as? String,
                role == "user"
            {
                self.stickyUserReplyCount += 1
                logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): user replied")
                print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): user replied")
                if self.stickyUserReplyCount >= stickyReleaseThreshold {
                    stickyActive = false
                    logger.info("Sticky released at \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold)")
                    print("Sticky released at \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold)")
                }
            }
        case "response.done":
            if stickyActive {
                logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → trigger next")
                print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → trigger next")
                sendWakeResponseCreate()
            }
        default:
            break
        }
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
    let sessionId: String?

    enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
        case model
        case sessionId = "session_id"
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
    case missingAuthentication
    case quotaExceeded
}

// 402時の簡易デコード用（サーバー側のentitlementフォーマットに合わせる）
private struct EntitlementEnvelope: Decodable {
    struct Ent: Decodable {
        let plan: String?
    }
    let entitlement: Ent?
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

private extension Locale {
    static var realtimeLanguageCode: String {
        if #available(iOS 16.0, *),
           let code = Locale.current.language.languageCode?.identifier {
            return code
        }
        if let preferred = Locale.preferredLanguages.first,
           let first = preferred.split(separator: "-").first {
            return String(first)
        }
        return "en"
    }
}
