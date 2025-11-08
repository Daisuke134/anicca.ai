import AVFoundation

final class AudioSessionCoordinator {
    static let shared = AudioSessionCoordinator()
    private let session = AVAudioSession.sharedInstance()

    private init() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: session
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: session
        )
    }

    func configureForRealtime(reactivating: Bool) throws {
        try session.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetoothA2DP, .allowBluetoothHFP])
        try session.setMode(.videoChat)
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        try session.overrideOutputAudioPort(.speaker)
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: typeValue) == .ended else { return }
        try? configureForRealtime(reactivating: true)
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
              reason == .override || reason == .categoryChange || reason == .oldDeviceUnavailable else { return }
        try? session.overrideOutputAudioPort(.speaker)
    }
}



