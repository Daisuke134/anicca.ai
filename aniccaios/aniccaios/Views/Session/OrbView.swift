import SwiftUI

/// v3-ui 必須: 青いオーブ
/// - 「ユーザーのマイク音量」ではなく「Aniccaが話している状態」に連動させる（仕様/要望）
struct OrbView: View {
    @ObservedObject private var controller = VoiceSessionController.shared
    @State private var breathe = false

    var body: some View {
        // breathe は常時、speaking は isModelSpeaking のときだけ強める
        let base = breathe ? 1.04 : 0.96
        let speakingBoost = controller.isModelSpeaking ? 1.10 : 1.00
        let scale = base * speakingBoost

        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color(red: 0.22, green: 0.50, blue: 0.95).opacity(0.95),
                        Color(red: 0.10, green: 0.32, blue: 0.85).opacity(0.95)
                    ],
                    center: .center,
                    startRadius: 10,
                    endRadius: 160
                )
            )
            .frame(width: 190, height: 190)
            .scaleEffect(scale)
            .animation(.easeInOut(duration: 2.8), value: breathe)          // breath
            .animation(.easeInOut(duration: 0.22), value: controller.isModelSpeaking) // speaking pulse
            .onAppear {
                breathe = true
            }
    }
}

