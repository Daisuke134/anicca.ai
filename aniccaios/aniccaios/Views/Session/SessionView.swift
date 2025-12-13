import SwiftUI
import AVFoundation
import Combine

struct SessionView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var controller = VoiceSessionController.shared

    let topic: FeelingTopic

    @State private var showMicAlert = false
    @State private var isShowingEMA = false
    @State private var pendingDismissAfterEMA = false

    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            topicPill

            Spacer(minLength: AppTheme.Spacing.xl)

            OrbView()

            Text(statusText)
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Spacer(minLength: AppTheme.Spacing.xl)

            controlsRow
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
        .padding(.top, AppTheme.Spacing.lg)
        .padding(.bottom, AppTheme.Spacing.xxl)
        .background(AppBackground())
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    endSessionAndMaybeAskEMA()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left")
                        Text(String(localized: "common_back"))
                    }
                }
            }
        }
        .onAppear {
            ensureMicrophonePermissionAndStart()
        }
        .onDisappear {
            // 画面が閉じたらセッションは終了しておく（多重接続防止）
            if controller.connectionStatus != .disconnected {
                controller.stop()
            }
        }
        .sheet(isPresented: $isShowingEMA) {
            EMAModal { answer in
                Task { @MainActor in
                    await controller.submitFeelingEMA(emaBetter: answer)
                    isShowingEMA = false
                    dismiss()
                }
            }
        }
        .alert(String(localized: "session_mic_permission_title"), isPresented: $showMicAlert) {
            Button(String(localized: "common_open_settings")) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button(String(localized: "common_cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "session_mic_permission_message"))
        }
    }

    private var topicPill: some View {
        Text(topicLabel)
            .font(AppTheme.Typography.caption1Dynamic)
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.xl, style: .continuous)
                    .fill(AppTheme.Colors.buttonUnselected)
            )
    }

    private var topicLabel: String {
        switch topic {
        case .selfLoathing: return String(localized: "session_topic_self_loathing")
        case .anxiety: return String(localized: "session_topic_anxiety")
        case .irritation: return String(localized: "session_topic_irritation")
        case .freeConversation: return String(localized: "session_topic_free_conversation")
        }
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
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(AppTheme.Colors.cardBackground))
                    .overlay(Circle().stroke(AppTheme.Colors.borderLight, lineWidth: 1))
            }

            Spacer()

            Button {
                endSessionAndMaybeAskEMA()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color.red))
            }
        }
        .padding(.horizontal, AppTheme.Spacing.lg)
    }

    private func endSessionAndMaybeAskEMA() {
        let shouldAsk = controller.shouldAskFeelingEMA
        controller.stop()
        if shouldAsk {
            isShowingEMA = true
        } else {
            Task { @MainActor in
                await controller.submitFeelingEMA(emaBetter: nil)
                dismiss()
            }
        }
    }

    private func ensureMicrophonePermissionAndStart() {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                controller.startFeeling(topic: topic)
            case .undetermined:
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        granted ? controller.startFeeling(topic: topic) : (showMicAlert = true)
                    }
                }
            default:
                showMicAlert = true
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                controller.startFeeling(topic: topic)
            case .undetermined:
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        granted ? controller.startFeeling(topic: topic) : (showMicAlert = true)
                    }
                }
            default:
                showMicAlert = true
            }
        }
    }
}

