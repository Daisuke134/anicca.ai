import AVFoundation
import ComponentsKit
import SwiftUI

struct MicrophonePermissionStepView: View {
    let next: () -> Void

    @State private var micGranted = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Microphone Access")
                .font(.title)
                .padding(.top, 40)

            SUCard(
                model: .init(),
                content: {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Microphone Access")
                            .font(.headline)
                        Text("Anicca needs microphone access to have voice conversations with you. This allows us to provide personalized wake-up calls and habit reminders.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if micGranted {
                            HStack {
                                SUBadge(model: {
                                    var vm = BadgeVM()
                                    vm.title = "Enabled"
                                    vm.color = .init(main: .success, contrast: .white)
                                    return vm
                                }())
                                Spacer()
                            }
                        } else {
                            SUButton(
                                model: {
                                    var vm = ButtonVM()
                                    vm.title = isRequesting ? "Requesting…" : "Allow Microphone"
                                    vm.style = .filled
                                    vm.size = .medium
                                    vm.isFullWidth = true
                                    vm.isEnabled = !isRequesting
                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                                    return vm
                                }(),
                                action: requestMicrophone
                            )
                        }
                    }
                }
            )

            Spacer()
        }
        .padding(24)
        .onAppear {
            micGranted = AVAudioSession.sharedInstance().recordPermission == .granted
            if micGranted {
                // Auto-advance if already granted
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    next()
                }
            }
        }
    }

    private func requestMicrophone() {
        guard !isRequesting else { return }
        isRequesting = true
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                self.micGranted = granted
                self.isRequesting = false
                if granted {
                    // Small delay before advancing for better UX
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        next()
                    }
                }
            }
        }
    }
}

