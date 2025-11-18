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
                                        : String(localized: "common_continue")
                                    vm.style = .filled
                                    vm.size = .medium
                                    vm.isFullWidth = true
                                    vm.isEnabled = !isRequesting
                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                                    return vm
                                }(),
                                action: requestMicrophone
                            )

                            if micDenied {
                                SUButton(
                                    model: {
                                        var vm = ButtonVM()
                                        vm.title = String(localized: "common_open_settings")
                                        vm.style = .plain
                                        vm.size = .medium
                                        vm.isFullWidth = true
                                        vm.isEnabled = true
                                        vm.color = .init(main: .universal(.uiColor(.systemGray)), contrast: .secondaryForeground)
                                        return vm
                                    }(),
                                    action: openSettings
                                )
                            }

                            SUButton(
                                model: {
                                    var vm = ButtonVM()
                                    vm.title = String(localized: "common_maybe_later")
                                    vm.style = .plain
                                    vm.size = .small
                                    vm.isFullWidth = false
                                    vm.isEnabled = !isRequesting
                                    return vm
                                }(),
                                action: skipForNow
                            )
                        }

                        Text(String(localized: "onboarding_microphone_optional_hint"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            )

            Spacer()
        }
        .padding(24)
        .onAppear {
            updatePermissionSnapshot()
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
            self.micDenied = !granted
            self.isRequesting = false
            if granted {
                // Small delay before advancing for better UX
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    next()
                }
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

    private func skipForNow() {
        next()
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

