import AVFoundation
#if canImport(AVFAudio)
import AVFAudio
#endif
import SwiftUI

struct PermissionsStepView: View {
    let next: () -> Void

    @State private var micGranted = false
    @State private var notificationGranted = false
    @State private var requestingNotifications = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Enable Wake-Up Access")
                .font(.title)
                .padding(.top, 40)

            card(
                title: "Microphone Access",
                detail: "Allow Anicca to talk with you when you wake up.",
                granted: micGranted,
                actionTitle: "Allow Microphone",
                action: requestMicrophone
            )

            card(
                title: "Time-Sensitive Alerts",
                detail: "Let Anicca ring even when your phone is silenced.",
                granted: notificationGranted,
                actionTitle: requestingNotifications ? "Requesting…" : "Allow Notifications",
                action: requestNotifications,
                disabled: requestingNotifications
            )

            Spacer()
        }
        .padding(24)
        .onAppear {
            if #available(iOS 17.0, *) {
                micGranted = AVAudioApplication.shared.recordPermission == .granted
            } else {
                micGranted = AVAudioSession.sharedInstance().recordPermission == .granted
            }
        }
    }

    private func card(title: String, detail: String, granted: Bool, actionTitle: String, action: @escaping () -> Void, disabled: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if granted {
                Label("Enabled", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else {
                Button(action: action) {
                    Text(actionTitle)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(disabled)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func requestMicrophone() {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in
                updateMicPermission(granted: granted)
            }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                updateMicPermission(granted: granted)
            }
        }
    }
    
    private func updateMicPermission(granted: Bool) {
        DispatchQueue.main.async {
            self.micGranted = granted
            self.checkCompletion()
        }
    }

    private func requestNotifications() {
        requestingNotifications = true
        Task {
            let granted = await HabitAlarmScheduler.shared.requestAuthorization()
            await MainActor.run {
                notificationGranted = granted
                requestingNotifications = false
                checkCompletion()
            }
        }
    }

    private func checkCompletion() {
        if micGranted && notificationGranted {
            next()
        }
    }
}
