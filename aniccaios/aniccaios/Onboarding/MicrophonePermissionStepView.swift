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
    // v3: 既に許可済みでも画面は表示、自動遷移しない
    @State private var hasAttemptedPermission = false

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
                    : (micGranted ? String(localized: "common_continue") : String(localized: "onboarding_microphone_allow")),
                isEnabled: !isRequesting,
                isLoading: isRequesting,
                style: micGranted ? .selected : .primary
            ) {
                if micGranted || hasAttemptedPermission {
                    // 既に許可済み or リクエスト済みなら次へ
                    next()
                } else {
                    requestMicrophone()
                }
            }

        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            updatePermissionSnapshot()
            // v3: 既に許可されていても自動遷移しない。画面は必ず表示。
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
            self.hasAttemptedPermission = true
            // v3: 許可/拒否後も自動遷移しない。ボタンでユーザーが操作して次へ。
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

