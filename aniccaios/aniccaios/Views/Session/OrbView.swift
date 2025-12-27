import SwiftUI

/// v3-ui 必須: 青いオーブ（ダークモード対応）
/// - 「ユーザーのマイク音量」ではなく「Aniccaが話している状態」に連動させる（仕様/要望）
struct OrbView: View {
    @ObservedObject private var controller = VoiceSessionController.shared
    @Environment(\.colorScheme) private var colorScheme
    @State private var breathe = false
    var body: some View {
        // breathe は常時、speaking は isModelSpeaking のときだけ強める
        let base = breathe ? 1.04 : 0.96
        let speakingBoost = controller.isModelSpeaking ? 1.10 : 1.00
        let scale = base * speakingBoost
        // session.html: size-72 (288px), gradient from-[#e6f5ff] via-[#b3d9ff] to-[#4da6ff], shadow-xl
        // ダークモード: より深みのあるブルー
        Circle()
            .fill(
                LinearGradient(
                    colors: orbGradientColors,
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 288, height: 288)
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.3 : 0.15), radius: 20, x: 0, y: 10)
            .scaleEffect(scale)
            .animation(.easeInOut(duration: 2.8), value: breathe)          // breath
            .animation(.easeInOut(duration: 0.22), value: controller.isModelSpeaking) // speaking pulse
            .onAppear {
                breathe = true
            }
    }
    
    private var orbGradientColors: [Color] {
        if colorScheme == .dark {
            // ダークモード: より深みのある、落ち着いたブルー
            return [
                Color(red: 0.20, green: 0.35, blue: 0.55),   // Deep blue top
                Color(red: 0.25, green: 0.45, blue: 0.70),   // Mid blue
                Color(red: 0.30, green: 0.55, blue: 0.85)    // Bright blue bottom
            ]
        } else {
            // ライトモード: 既存の明るいブルー
            return [
                Color(red: 0.90, green: 0.96, blue: 1.0),   // #e6f5ff
                Color(red: 0.70, green: 0.85, blue: 1.0),   // #b3d9ff
                Color(red: 0.30, green: 0.65, blue: 1.0)    // #4da6ff
            ]
        }
    }
}
