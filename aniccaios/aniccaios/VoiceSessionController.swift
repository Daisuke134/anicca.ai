import AVFoundation
import Combine
import OSLog
import WebRTC

@MainActor
final class VoiceSessionController: NSObject, ObservableObject {
    static let shared = VoiceSessionController()
    
    @Published private(set) var connectionStatus: ConnectionState = .disconnected
    @Published private(set) var isModelSpeaking: Bool = false
    @Published private(set) var isUserSpeaking: Bool = false
    @Published private(set) var isMicMuted: Bool = false

    /// tech-ema-v3: 5秒以上のみ EMA を聞く
    var shouldAskFeelingEMA: Bool {
        guard let start = sessionStartTime else { return false }
        return Date().timeIntervalSince(start) >= 5
    }

    // Feeling セッション識別（/api/mobile/feeling/end で使用）
    private var activeFeelingSessionId: String?
    private var activeFeelingTopic: FeelingTopic?
    private var activeFeelingOpeningScript: String?

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
    private let stickyReleaseThreshold = 5
    
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
        
        // Stickyモードは起床習慣(.wake)のみに適用
        if currentHabitType == .wake && isStickyEnabled {
            stickyActive = true
            stickyUserReplyCount = 0
            stickyReady = false
            logger.info("Sticky enabled for wake habit")
        } else {
            stickyActive = false
            stickyUserReplyCount = 0
            stickyReady = false
            if currentHabitType == .training {
                logger.info("Sticky disabled: Training mode is one-way interaction")
            } else if currentHabitType != nil && currentHabitType != .wake {
                logger.info("Sticky disabled: bidirectional dialog for non-wake habits")
            }
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
        
        // Stickyモードは起床習慣(.wake)のみに適用
        if habit == .wake && isStickyEnabled {
            stickyActive = true
            stickyUserReplyCount = 0
            stickyReady = false
            logger.info("Sticky enabled for VoIP wake habit")
        } else {
            stickyActive = false
            stickyUserReplyCount = 0
            stickyReady = false
            if habit == .training {
                logger.info("Sticky disabled: Training mode is one-way interaction")
            } else if habit != .wake {
                logger.info("Sticky disabled: bidirectional dialog for non-wake habits")
            }
        }
        
        Task { [weak self] in
            await self?.establishSession(resumeImmediately: true)
        }
    }

    /// v3: Talk/Feeling セッション開始（TalkView→SessionView から呼ぶ）
    func startFeeling(topic: FeelingTopic) {
        guard connectionStatus != .connecting else { return }
        setStatus(.connecting)
        activeFeelingTopic = topic
        activeFeelingSessionId = nil
        activeFeelingOpeningScript = nil
        currentHabitType = nil
        stickyActive = AppState.shared.userProfile.stickyModeEnabled
        stickyUserReplyCount = 0
        stickyReady = false
        Task { [weak self] in
            await self?.beginFeelingSession(topic: topic)
            await self?.establishSession(resumeImmediately: false)
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

    /// tech-ema-v3: Feeling セッション終了時の EMA をサーバへ送信（true/false/null）
    @MainActor
    func submitFeelingEMA(emaBetter: Bool?) async {
        guard let feelingSessionId = activeFeelingSessionId,
              case .signedIn(let credentials) = AppState.shared.authStatus else {
            // まだ start が走っていない or 未ログインなら何もしない
            activeFeelingTopic = nil
            activeFeelingSessionId = nil
            activeFeelingOpeningScript = nil
            return
        }
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/feeling/end"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")

        let payload: [String: Any] = [
            "session_id": feelingSessionId,
            "emaBetter": emaBetter as Any
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])

        do {
            _ = try await NetworkSessionManager.shared.session.data(for: request)
        } catch {
            logger.error("Failed to submit EMA: \(error.localizedDescription, privacy: .public)")
        }
        activeFeelingTopic = nil
        activeFeelingSessionId = nil
        activeFeelingOpeningScript = nil
    }

    /// v3: Feeling開始（migration-patch-v3.md 6.2 /api/mobile/feeling/start）
    /// - feeling_sessions の sessionId を取得して保持する（Realtimeの session_id と混同しない）
    private func beginFeelingSession(topic: FeelingTopic) async {
        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
        var req = URLRequest(url: AppConfig.feelingStartURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")

        let body: [String: Any] = [
            "feelingId": topic.rawValue
        ]
        do {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await NetworkSessionManager.shared.session.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            // NOTE: APIは { sessionId, openingScript, ... } を返す
            activeFeelingSessionId = json["sessionId"] as? String
            activeFeelingOpeningScript = json["openingScript"] as? String
        } catch {
            logger.error("Failed to start feeling session: \(error.localizedDescription, privacy: .public)")
        }
    }

    func toggleMicMuted() {
        isMicMuted.toggle()
        audioTrack?.isEnabled = !isMicMuted
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
                let planString = env.entitlement?.plan ?? env.error?.details?.entitlement?.plan ?? "free"
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
        // Use model from backend response, fallback to default
        sessionModel = payload.model ?? payload.sessionModel ?? "gpt-realtime"
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

        // GA endpoint: POST /v1/realtime/calls (model already set in client_secret)
        guard let url = URL(string: "https://api.openai.com/v1/realtime/calls") else {
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
                let errorBody = String(data: data, encoding: .utf8) ?? "no body"
                logger.error("Realtime SDP exchange failed with status \(http.statusCode): \(errorBody, privacy: .public)")
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
            DispatchQueue.main.async { [weak self] in
                self?.sendSessionUpdate()
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
        DispatchQueue.main.async { [weak self] in
            self?.handleRealtimeEvent(json)
        }
    }
}

private extension VoiceSessionController {
    @MainActor
    func sendSessionUpdate() {
        guard let channel = dataChannel, channel.readyState == .open else { return }
        
        // OpenAI Realtime 公式: session.update は audio.{input,output} / output_modalities 形式
        // refs:
        // - https://platform.openai.com/docs/api-reference/realtime-client-events/session/update
        // - https://platform.openai.com/docs/guides/realtime-conversations
        // Note: OpenAI Realtime APIは ["audio"] または ["text"] のみサポート（両方同時は不可）
        var sessionPayload: [String: Any] = [
            "type": "realtime",
            "output_modalities": ["audio"],
            "max_output_tokens": "inf",
            "audio": [
                "input": [
                    "format": [
                        "type": "audio/pcm",
                        "rate": 24000
                    ]
                ],
                "output": [
                    "format": [
                        "type": "audio/pcm",
                        "rate": 24000
                    ],
                    "voice": "alloy",
                    "speed": 1.0
                ]
            ],
            "tool_choice": "auto",
            "tools": RealtimeTools.defaultTools
        ]
        
        // Realtime: audio.input.turn_detection
        let isTrainingMode = currentHabitType == .training
        var audioDict = sessionPayload["audio"] as? [String: Any] ?? [:]
        if isTrainingMode {
            // 一方向（入力なし）
            audioDict["input"] = [
                "format": ["type": "audio/pcm", "rate": 24000],
                "turn_detection": NSNull()
            ]
            logger.info("Training mode: turn_detection disabled for one-way audio")
        } else {
            audioDict["input"] = [
                "format": ["type": "audio/pcm", "rate": 24000],
                "turn_detection": [
                    "type": "server_vad",
                    "create_response": true,
                    "interrupt_response": true
                ]
            ]
        }
        sessionPayload["audio"] = audioDict

        var shouldTriggerImmediateResponse = false
        var instructions: String?
        if let prompt = AppState.shared.consumePendingPrompt() {
            instructions = prompt
            shouldTriggerImmediateResponse = true   // habit: 起動時に話し始める
        } else if let consultPrompt = AppState.shared.consumePendingConsultPrompt() {
            instructions = consultPrompt
            shouldTriggerImmediateResponse = true   // consult: v3 では「モデルが先に話す」前提
        } else if let feeling = activeFeelingTopic {
            let base = RealtimePromptBuilder.buildFeelingInstructions(topic: feeling, profile: AppState.shared.userProfile)
            if let opening = activeFeelingOpeningScript, !opening.isEmpty {
                instructions = base + "\n\n[Opening]\n" + opening
            } else {
                instructions = base
            }
            shouldTriggerImmediateResponse = true
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

        if shouldTriggerImmediateResponse {
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
    
    @MainActor private func handleRealtimeEvent(_ event: [String: Any]) {
        guard let type = event["type"] as? String else { return }
        switch type {
        case "output_audio_buffer.started":
            logger.info("output_audio_buffer.started: stickyActive=\(self.stickyActive), stickyReady=\(self.stickyReady)")
            print("output_audio_buffer.started: stickyActive=\(stickyActive), stickyReady=\(stickyReady)")
            isModelSpeaking = true
            if stickyActive && !stickyReady {
                stickyReady = true
                logger.info("Sticky ready: first audio started → stickyReady=true")
                print("Sticky ready: first audio started → stickyReady=true")
            }

        case "output_audio_buffer.stopped", "output_audio_buffer.cleared":
            isModelSpeaking = false
        
        case "input_audio_buffer.speech_started":
            isUserSpeaking = true

        case "input_audio_buffer.speech_stopped":
            // ★★★ ユーザーの発話終了を検知（WebRTCでの正しいイベント）★★★
            logger.info("input_audio_buffer.speech_stopped: stickyActive=\(self.stickyActive), stickyReady=\(self.stickyReady)")
            print("input_audio_buffer.speech_stopped: stickyActive=\(stickyActive), stickyReady=\(stickyReady)")
            isUserSpeaking = false
            guard stickyActive && stickyReady else { return }
            
            self.stickyUserReplyCount += 1
            logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): user speech stopped")
            print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): user speech stopped")
            if self.stickyUserReplyCount >= stickyReleaseThreshold {
                stickyActive = false
                logger.info("Sticky released at \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold)")
                print("Sticky released at \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold)")
            }
        
        case "response.done":
            // Function calling: response.done 内の function_call item を検出し、HTTP tool に転送して戻す
            // refs:
            // - https://platform.openai.com/docs/guides/realtime-conversations#function-calling
            // - https://platform.openai.com/docs/api-reference/realtime-server-events
            if let response = event["response"] as? [String: Any],
               let output = response["output"] as? [[String: Any]] {
                Task { @MainActor in
                    await self.handleFunctionCallsIfNeeded(outputItems: output)
                }
            }
            if stickyActive {
                logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
                print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    guard self.stickyActive else {
                        self.logger.info("Sticky: cancelled during 5s delay (stickyActive=false)")
                        return
                    }
                    self.sendWakeResponseCreate()
                }
            }
        
        default:
            break
        }
    }

    @MainActor
    private func handleFunctionCallsIfNeeded(outputItems: [[String: Any]]) async {
        let functionCalls = outputItems.filter { ($0["type"] as? String) == "function_call" }
        guard !functionCalls.isEmpty else { return }

        for call in functionCalls {
            guard let name = call["name"] as? String,
                  let callId = call["call_id"] as? String,
                  let arguments = call["arguments"] as? String else { continue }
            let result = await RealtimeToolRouter.callTool(name: name, argumentsJSON: arguments)
            sendFunctionCallOutput(callId: callId, output: result)
        }
        // ツール出力を足した後、モデルに続きの応答を作らせる
        sendResponseCreate()
    }

    private func sendFunctionCallOutput(callId: String, output: String) {
        let payload: [String: Any] = [
            "type": "conversation.item.create",
            "item": [
                "type": "function_call_output",
                "call_id": callId,
                "output": output
            ]
        ]
        sendEvent(payload)
    }

    private func sendResponseCreate() {
        sendEvent(["type": "response.create"])
    }

    private func sendEvent(_ payload: [String: Any]) {
        guard let channel = dataChannel, channel.readyState == .open else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed])
            channel.sendData(RTCDataBuffer(data: data, isBinary: false))
        } catch {
            logger.error("Failed to send event \(payload["type"] as? String ?? "unknown"): \(error.localizedDescription, privacy: .public)")
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
    
    struct SessionPayload: Decodable {
        let model: String?
        
        enum CodingKeys: String, CodingKey {
            case model
        }
    }

    let clientSecret: ClientSecretPayload
    let model: String?
    let session: SessionPayload?
    let sessionId: String?

    enum CodingKeys: String, CodingKey {
        case clientSecret = "client_secret"
        case model
        case session
        case sessionId = "session_id"
    }

    var clientSecretModel: ClientSecret {
        ClientSecret(value: clientSecret.value, expiresAt: clientSecret.expiresAt)
    }
    
    var sessionModel: String? {
        session?.model ?? model
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
    struct ErrorDetails: Decodable {
        let entitlement: Ent?
    }
    struct ErrorBody: Decodable {
        let code: String?
        let message: String?
        let details: ErrorDetails?
    }
    let entitlement: Ent?
    let error: ErrorBody?
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

/// Realtime tools（v3-stack: /tools/*）の定義を Swift 側に固定（Prompts/Tools と同一）
private enum RealtimeTools {
    static var defaultTools: [[String: Any]] {
        // Realtime API の tools 形（name/description/parameters がトップレベル）
        // refs: https://platform.openai.com/docs/guides/realtime-conversations#configure-callable-functions
        [
            [
                "type": "function",
                "name": "get_context_snapshot",
                "description": "Get the user's current context including recent behavior, feelings, and patterns",
                "parameters": [
                    "type": "object",
                    "strict": true,
                    "additionalProperties": false,
                    "properties": [
                        "userId": ["type": "string"],
                        "includeDailyMetrics": ["type": "boolean"]
                    ],
                    "required": ["userId"]
                ]
            ],
            [
                "type": "function",
                "name": "choose_nudge",
                "description": "Choose the best nudge template for a target behavior",
                "parameters": [
                    "type": "object",
                    "strict": true,
                    "additionalProperties": false,
                    "properties": [
                        "userId": ["type": "string"],
                        "targetBehavior": ["type": "string"]
                    ],
                    "required": ["userId", "targetBehavior"]
                ]
            ],
            [
                "type": "function",
                "name": "log_nudge",
                "description": "Log a nudge that was delivered and its metadata",
                "parameters": [
                    "type": "object",
                    "strict": true,
                    "additionalProperties": false,
                    "properties": [
                        "userId": ["type": "string"],
                        "templateId": ["type": "string"],
                        "channel": ["type": "string"]
                    ],
                    "required": ["userId", "templateId", "channel"]
                ]
            ],
            [
                "type": "function",
                "name": "get_behavior_summary",
                "description": "Get today's behavior summary for the Behavior tab",
                "parameters": [
                    "type": "object",
                    "strict": true,
                    "additionalProperties": false,
                    "properties": [
                        "userId": ["type": "string"]
                    ],
                    "required": ["userId"]
                ]
            ]
        ]
    }
}

/// tools 呼び出しを iOS→Backend にルーティングして JSON 文字列で返す
private enum RealtimeToolRouter {
    @MainActor
    static func callTool(name: String, argumentsJSON: String) async -> String {
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            return "{\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"Not signed in\"}}"
        }
        // v0.3 (Node/Express): tools は mobile/realtime 配下に集約
        var request = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("mobile/realtime/tools/\(name)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
        request.httpBody = argumentsJSON.data(using: .utf8)

        do {
            let (data, _) = try await NetworkSessionManager.shared.session.data(for: request)
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{\"error\":{\"code\":\"NETWORK_ERROR\",\"message\":\"\(error.localizedDescription)\"}}"
        }
    }
}

/// Talk/Feeling 用の Realtime instructions を Resources/Prompts から構築
private enum RealtimePromptBuilder {
    static func buildFeelingInstructions(topic: FeelingTopic, profile: UserProfile) -> String {
        let openerName: String = {
            switch topic {
            case .selfLoathing: return "feeling_self_loathing"
            case .anxiety: return "feeling_anxiety"
            case .irritation: return "feeling_irritation"
            case .freeConversation: return "feeling_free_conversation"
            }
        }()
        
        // ★ 言語別のFeelingラベル
        let localizedFeelingLabel: String = {
            let isJa = profile.preferredLanguage == .ja
            switch topic {
            case .selfLoathing: return isJa ? "自己嫌悪" : "self_loathing"
            case .anxiety: return isJa ? "不安" : "anxiety"
            case .irritation: return isJa ? "怒り" : "irritation"
            case .freeConversation: return isJa ? "自由な対話" : "free_conversation"
            }
        }()
        
        // ファイルを読み込み（1つだけ）
        var opener = (load(name: openerName, ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        // ★ [Feeling: xxx] を動的に置換
        let englishLabel: String = {
            switch topic {
            case .selfLoathing: return "self_loathing"
            case .anxiety: return "anxiety"
            case .irritation: return "irritation"
            case .freeConversation: return "free_conversation"
            }
        }()
        opener = opener.replacingOccurrences(
            of: "[Feeling: \(englishLabel)]",
            with: "[Feeling: \(localizedFeelingLabel)]"
        )
        
        let commonTemplate = (load(name: "common", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let talkTemplate = (load(name: "talk_session", ext: "txt") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        
        let mergedTemplate = "\(commonTemplate)\n\n\(talkTemplate)\n\n\(opener)"
        
        let rendered = renderTemplate(mergedTemplate, profile: profile)
        return rendered
    }

    private static func load(name: String, ext: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }
    
    private static func renderTemplate(_ template: String, profile: UserProfile) -> String {
        var result = template
        
        // 言語設定
        result = result.replacingOccurrences(of: "${LANGUAGE_LINE}", with: profile.preferredLanguage.languageLine)
        
        // ユーザー名
        let userName = profile.displayName.isEmpty
            ? NSLocalizedString("common_user_fallback", comment: "")
            : profile.displayName
        result = result.replacingOccurrences(of: "${USER_NAME}", with: userName)
        
        // 時刻
        let timeString = Date().formatted(.dateTime.hour().minute())
        result = result.replacingOccurrences(of: "${TASK_TIME}", with: timeString)
        result = result.replacingOccurrences(of: "${TASK_DESCRIPTION}", with: "Talk Session")
        
        // 理想の自分（ローカライズ）
        if !profile.idealTraits.isEmpty {
            let localizedTraits = profile.idealTraits.map { NSLocalizedString("ideal_trait_\($0)", comment: "") }
            let prefix = profile.preferredLanguage == .ja
                ? "理想の姿として設定されている特性: "
                : "Ideal self traits: "
            let separator = profile.preferredLanguage == .ja ? "、" : ", "
            result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: prefix + localizedTraits.joined(separator: separator))
        } else {
            result = result.replacingOccurrences(of: "${IDEAL_TRAITS}", with: "")
        }
        
        // 問題・課題（ローカライズ）
        if !profile.problems.isEmpty {
            let localizedProblems = profile.problems.map { NSLocalizedString("problem_\($0)", comment: "") }
            let prefix = profile.preferredLanguage == .ja
                ? "今抱えている問題: "
                : "Current struggles: "
            let separator = profile.preferredLanguage == .ja ? "、" : ", "
            result = result.replacingOccurrences(of: "${PROBLEMS}", with: prefix + localizedProblems.joined(separator: separator))
        } else {
            result = result.replacingOccurrences(of: "${PROBLEMS}", with: "")
        }
        
        // 未置換のプレースホルダーを削除
        let placeholderPattern = "\\$\\{[^}]+\\}"
        if let regex = try? NSRegularExpression(pattern: placeholderPattern, options: []) {
            result = regex.stringByReplacingMatches(in: result, options: [], range: NSRange(location: 0, length: result.utf16.count), withTemplate: "")
        }
        
        return result
    }
}
