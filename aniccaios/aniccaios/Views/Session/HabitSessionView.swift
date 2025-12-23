import SwiftUI
import AVFoundation

struct HabitSessionView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var controller = VoiceSessionController.shared

    let habit: HabitType

    @State private var showMicAlert = false

    var body: some View {
        VStack(spacing: 0) {
            // ナビゲーションバー
            HStack {
                Button {
                    controller.stop()
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label)
                }
                .frame(width: 44, height: 44)
                
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(height: 69)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color(red: 200/255, green: 198/255, blue: 191/255, opacity: 0.2))
                    .frame(height: 1)
            }
            
            // メインコンテンツ
            VStack(spacing: 0) {
                habitPill
                    .padding(.top, 30.5)
                    .padding(.bottom, 48)
                
                OrbView()
                    .padding(.bottom, 48)
                
                Text(statusText)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Color(red: 57/255, green: 54/255, blue: 52/255, opacity: 0.7))
                    .padding(.bottom, 64)
                
                Spacer()
                
                controlsRow
                    .padding(.bottom, 48)
            }
            .padding(.horizontal, 24)
        }
        .background(Color(hex: "#F8F5ED"))
        .onAppear {
            ensureMicrophonePermissionAndStart()
        }
        .onDisappear {
            if controller.connectionStatus != .disconnected {
                controller.stop()
            }
        }
        .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
            Button(String(localized: "common_open_settings")) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button(String(localized: "common_cancel"), role: .cancel) {
                dismiss()
            }
        } message: {
            Text(String(localized: "session_mic_permission_message"))
        }
    }

    private var habitPill: some View {
        Text(habit.title)
            .font(.system(size: 20, weight: .medium))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, 31)
            .padding(.vertical, 17)
            .background(
                Capsule()
                    .fill(Color(hex: "#F2F0ED"))
            )
    }

    private var statusText: String {
        if controller.connectionStatus == .connecting { return String(localized: "session_status_connecting") }
        if controller.isModelSpeaking { return String(localized: "session_status_speaking") }
        if controller.connectionStatus == .connected { return String(localized: "session_status_listening") }
        return String(localized: "session_status_disconnected")
    }

    private var controlsRow: some View {
        HStack {
            Button {
                controller.toggleMicMuted()
            } label: {
                Image(systemName: controller.isMicMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(AppTheme.Colors.cardBackground))
                    .overlay(Circle().stroke(AppTheme.Colors.border.opacity(0.2), lineWidth: 1))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }

            Spacer()

            Button {
                controller.stop()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 80, height: 80)
                    .background(Circle().fill(Color.red))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)
            }
        }
        .padding(.horizontal, 24)
    }

    private func ensureMicrophonePermissionAndStart() {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                controller.start(shouldResumeImmediately: true)
            case .undetermined:
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            controller.start(shouldResumeImmediately: true)
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                controller.start(shouldResumeImmediately: true)
            case .undetermined:
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        if granted {
                            controller.start(shouldResumeImmediately: true)
                        } else {
                            showMicAlert = true
                        }
                    }
                }
            default:
                showMicAlert = true
            }
        }
    }
}

