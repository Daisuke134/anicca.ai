import AVFoundation
#if canImport(AVFAudio)
import AVFAudio
#endif
import ComponentsKit
import SwiftUI

struct MicrophonePermissionStepView: View {
    let next: () -> Void

    @State private var micGranted = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_microphone_title")
                .font(.title)
                .padding(.top, 40)

            SUCard(
                model: .init(),
                content: {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("onboarding_microphone_card_title")
                            .font(.headline)
                        Text("onboarding_microphone_description")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if micGranted {
                            HStack {
                                SUBadge(model: {
                                    var vm = BadgeVM()
                                    vm.title = String(localized: "common_enabled")
                                    vm.color = .init(main: .success, contrast: .white)
                                    return vm
                                }())
                                Spacer()
                            }
                        } else {
                            SUButton(
                                model: {
                                    var vm = ButtonVM()
                                    vm.title = isRequesting
                                        ? String(localized: "common_requesting")
                                        : String(localized: "common_allow_microphone")
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
            if #available(iOS 17.0, *) {
                micGranted = AVAudioApplication.shared.recordPermission == .granted
            } else {
                micGranted = AVAudioSession.sharedInstance().recordPermission == .granted
            }
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

