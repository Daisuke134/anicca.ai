import AVFoundation
#if canImport(AVFAudio)
import AVFAudio
#endif
import ComponentsKit
import SwiftUI
import UIKit

struct MicrophonePermissionStepView: View {
    let next: () -> Void

    @State private var micGranted = false
    @State private var micDenied = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_microphone_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text(String(localized: "onboarding_microphone_description"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            PrimaryButton(
                title: isRequesting
                    ? String(localized: "common_requesting")
                    : String(localized: "onboarding_microphone_allow"),
                isEnabled: !isRequesting && !micGranted,
                isLoading: isRequesting,
                style: micGranted ? .selected : .primary
            ) { requestMicrophone() }

        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            updatePermissionSnapshot()
            // 既に許可されている場合はUIで明示しつつ、自動遷移は保持
            if micGranted {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    withAnimation(.easeInOut(duration: 0.35)) { next() }
                }
            }
        }
    }

    private func requestMicrophone() {
        guard !isRequesting else { return }
        isRequesting = true
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in
                updatePermissionState(granted: granted)
            }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                updatePermissionState(granted: granted)
            }
        }
    }
    
    private func updatePermissionState(granted: Bool) {
        DispatchQueue.main.async {
            self.micGranted = granted
            self.micDenied = !granted
            self.isRequesting = false
            // 許可/拒否に関わらず必ず次へ（5.1.1対策: プリプロンプト後はOSダイアログに必ず進ませる）
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                withAnimation(.easeInOut(duration: 0.35)) { next() }
            }
        }
    }

    private func updatePermissionSnapshot() {
        if #available(iOS 17.0, *) {
            let permission = AVAudioApplication.shared.recordPermission
            micGranted = permission == .granted
            micDenied = permission == .denied
        } else {
            let permission = AVAudioSession.sharedInstance().recordPermission
            micGranted = permission == .granted
            micDenied = permission == .denied
        }
    }

    // 『あとで設定』ハンドラは削除（5.1.1対策）

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

