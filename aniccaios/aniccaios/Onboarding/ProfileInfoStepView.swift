import ComponentsKit
import SwiftUI

struct ProfileInfoStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var displayName: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_profile_title")
                .font(.title)
                .padding(.top, 40)

            Text("onboarding_profile_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            TextField(String(localized: "onboarding_profile_placeholder"), text: $displayName)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never) // 【修正】勝手な大文字化を防ぐ
                .autocorrectionDisabled()
                .padding(.horizontal, 32)

            Spacer()

            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "onboarding_profile_continue")
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.isEnabled = !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                    return vm
                }(),
                action: save
            )
            .padding(.horizontal)
            .padding(.bottom)
        }
        .onAppear {
            let currentName = appState.userProfile.displayName.trimmingCharacters(in: .whitespaces)
            // Don't pre-fill with "User" - show placeholder instead
            if currentName.isEmpty || currentName == "User" {
                displayName = ""
            } else {
                displayName = currentName
            }
        }
    }

    private func save() {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            var profile = appState.userProfile
            profile.displayName = trimmed
            appState.updateUserProfile(profile, sync: true)
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}

