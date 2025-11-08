import Foundation
import PushKit
import OSLog

final class VoIPPushRegistry: NSObject {
    static let shared = VoIPPushRegistry()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "VoIPPushRegistry")
    private var pushRegistry: PKPushRegistry?
    private var lastRegisteredToken: String?
    private var pendingToken: String?
    
    private override init() {
        super.init()
    }
    
    func start() {
        pushRegistry = PKPushRegistry(queue: .main)
        pushRegistry?.delegate = self
        pushRegistry?.desiredPushTypes = [.voIP]
        logger.info("VoIP Push Registry started")
    }
    
    func registerPendingTokenIfNeeded() {
        guard let token = pendingToken else { return }
        
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            return
        }
        
        pendingToken = nil
        Task {
            await sendTokenToServer(token: token, userId: credentials.userId)
            lastRegisteredToken = token
        }
    }
    
    private func registerToken(_ token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        
        // Avoid duplicate registrations
        guard tokenString != lastRegisteredToken else {
            logger.debug("Token already registered, skipping")
            return
        }
        
        guard case .signedIn(let credentials) = AppState.shared.authStatus else {
            logger.info("User not signed in, storing token for later registration")
            pendingToken = tokenString
            return
        }
        
        lastRegisteredToken = tokenString
        
        Task {
            await sendTokenToServer(token: tokenString, userId: credentials.userId)
        }
    }
    
    private func sendTokenToServer(token: String, userId: String) async {
        guard let url = AppConfig.voipTokenURL else {
            logger.error("VoIP token URL not configured")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(userId, forHTTPHeaderField: "user-id")
        request.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
        
        let payload: [String: Any] = [
            "device_token": token
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
            let (_, response) = try await URLSession.shared.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse {
                if (200..<300).contains(httpResponse.statusCode) {
                    logger.info("VoIP token registered successfully")
                } else {
                    logger.error("Failed to register VoIP token: HTTP \(httpResponse.statusCode)")
                }
            }
        } catch {
            logger.error("Error registering VoIP token: \(error.localizedDescription, privacy: .public)")
        }
    }
}

extension VoIPPushRegistry: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        logger.info("VoIP push credentials updated")
        registerToken(pushCredentials.token)
    }
    
    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        logger.warning("VoIP push token invalidated")
        lastRegisteredToken = nil
    }
    
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }
        
        logger.info("Received VoIP push")
        
        // Extract session information from payload
        let sessionId = payload.dictionaryPayload["session_id"] as? String
        let habitTypeRaw = payload.dictionaryPayload["habit_type"] as? String
        let habitType = habitTypeRaw.flatMap { HabitType(rawValue: $0) }
        
        // Report to CallKit
        CallManager.shared.reportIncomingCall(
            sessionId: sessionId ?? UUID().uuidString,
            habit: habitType ?? .wake
        )
        
        completion()
    }
}

