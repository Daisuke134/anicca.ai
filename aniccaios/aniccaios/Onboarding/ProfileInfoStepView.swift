import ComponentsKit
import SwiftUI

struct ProfileInfoStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var displayName: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Tell us your name")
                .font(.title)
                .padding(.top, 40)

            Text("We'll use your name when Anicca speaks to you.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            TextField("John", text: $displayName)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal, 32)

            Spacer()

            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? "Saving…" : "Continue"
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
            displayName = appState.userProfile.displayName
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

