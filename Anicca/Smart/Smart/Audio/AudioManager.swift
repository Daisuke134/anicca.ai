import AVFoundation

final class AudioManager {
    static let shared = AudioManager()

    let audioSession = AVAudioSession.sharedInstance()
    let mixer = Mixer()

    private init() {}

    func setVoiceProcessingEnabled(_ enabled: Bool) throws {
        let mode: AVAudioSession.Mode = enabled ? .voiceChat : .default
        try audioSession.setMode(mode)
    }

    func setManualRenderingMode(_ enabled: Bool) throws {
        let category: AVAudioSession.Category = .playAndRecord
        var options: AVAudioSession.CategoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
        if !enabled {
            options.remove(.defaultToSpeaker)
            options.remove(.allowBluetoothA2DP)
        }
        try audioSession.setCategory(category, mode: audioSession.mode, options: options)
    }

    final class Mixer {
        var micVolume: Float = 1.0
        var appVolume: Float = 1.0
    }
}
