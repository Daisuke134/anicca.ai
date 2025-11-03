import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var audioController: AppAudioController

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform")
                .font(.system(size: 60, weight: .thin))
                .foregroundStyle(.tint)
            Text("音声インフラ準備ステータス")
                .font(.headline)
            Text(audioController.status)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Text(audioController.realtimeStatus)
                .font(.footnote)
                .foregroundStyle(
                    audioController.hasRealtimeError
                    ? Color.red
                    : (audioController.isRealtimeConnected ? Color.green : Color.secondary)
                )
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            HStack(spacing: 12) {
                Button("会話開始") {
                    Task { await audioController.startConversation() }
                }
                Button("終了") {
                    Task { await audioController.stopConversation() }
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

#Preview {
    ContentView()
        .environmentObject({
            let controller = AppAudioController()
            controller.status = "プレビュー"
            return controller
        }())
}
