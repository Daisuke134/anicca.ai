import AVFAudio
import AVFoundation
import OSLog

enum MicrophonePermissionState {
    case granted
    case denied
    case undetermined
}

final class MicrophonePermissionManager {
    private let logger = Logger(subsystem: "com.anicca.ios", category: "Permissions")

    func currentStatus() -> MicrophonePermissionState {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return .granted
        case .denied: return .denied
        case .undetermined: return .undetermined
        @unknown default: return .denied
        }
    }

    func ensurePermission() async -> MicrophonePermissionState {
        let status = currentStatus()
        guard status == .undetermined else { return status }
        return await requestPermission()
    }

    private func requestPermission() async -> MicrophonePermissionState {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                let result: MicrophonePermissionState = granted ? .granted : .denied
                if granted {
                    self.logger.info("Microphone permission granted")
                } else {
                    self.logger.error("Microphone permission denied")
                }
                continuation.resume(returning: result)
            }
        }
    }
}
