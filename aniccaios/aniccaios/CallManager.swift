import Foundation
import CallKit
import OSLog

final class CallManager: NSObject {
    static let shared = CallManager()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "CallManager")
    private var provider: CXProvider?
    private var callController: CXCallController?
    private var activeCallUUID: UUID?
    private var activeCallHabit: HabitType?
    
    private override init() {
        super.init()
    }
    
    func configure() {
        let configuration = CXProviderConfiguration(localizedName: "Anicca")
        configuration.supportsVideo = false
        configuration.includesCallsInRecents = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        
        provider = CXProvider(configuration: configuration)
        provider?.setDelegate(self, queue: nil)
        
        callController = CXCallController()
        
        logger.info("CallManager configured")
    }
    
    func reportIncomingCall(sessionId: String, habit: HabitType) {
        let callUUID = UUID()
        activeCallUUID = callUUID
        activeCallHabit = habit
        
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Anicca")
        update.hasVideo = false
        update.localizedCallerName = habit.title
        
        provider?.reportNewIncomingCall(with: callUUID, update: update) { error in
            if let error = error {
                self.logger.error("Failed to report incoming call: \(error.localizedDescription, privacy: .public)")
                self.activeCallUUID = nil
                self.activeCallHabit = nil
            } else {
                self.logger.info("Incoming call reported successfully for habit: \(habit.rawValue, privacy: .public)")
            }
        }
    }
    
    func endCall() {
        guard let callUUID = activeCallUUID else { return }
        
        let endAction = CXEndCallAction(call: callUUID)
        let transaction = CXTransaction(action: endAction)
        
        callController?.request(transaction) { error in
            if let error = error {
                self.logger.error("Failed to end call: \(error.localizedDescription, privacy: .public)")
            } else {
                self.logger.info("Call ended successfully")
                self.activeCallUUID = nil
            }
        }
    }
}

extension CallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        logger.info("CallKit provider did reset")
        activeCallUUID = nil
        activeCallHabit = nil
    }
    
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        logger.info("Call answered")
        
        // Configure audio session and start voice session
        Task { @MainActor in
            do {
                try AudioSessionCoordinator.shared.configureForRealtime(reactivating: true)
                
                // Use the habit from the active call
                let habit = activeCallHabit ?? .wake
                
                // Prepare session and start
                AppState.shared.prepareForImmediateSession(habit: habit)
                
                // Start voice session controller
                VoiceSessionController.shared.startFromVoip(habit: habit)
                
                action.fulfill()
            } catch {
                logger.error("Failed to start voice session: \(error.localizedDescription, privacy: .public)")
                action.fail()
            }
        }
    }
    
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        logger.info("Call ended")
        
        Task { @MainActor in
            VoiceSessionController.shared.stop()
            activeCallUUID = nil
            activeCallHabit = nil
        }
        
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }
}

