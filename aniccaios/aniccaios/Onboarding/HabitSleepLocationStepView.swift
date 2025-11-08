import ComponentsKit
import SwiftUI

struct HabitSleepLocationStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var sleepLocation: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Where do you usually sleep?")
                .font(.title)
                .padding(.top, 40)

            Text("This helps Anicca personalize your bedtime experience.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            AccessorylessTextField(placeholder: "Third-floor bedroom", text: $sleepLocation)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.horizontal, 32)

            Spacer()

            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? "Saving…" : "Continue"
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.isEnabled = !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                    return vm
                }(),
                action: save
            )
            .padding(.horizontal)
            .padding(.bottom)
        }
    }

    private func save() {
        let trimmed = sleepLocation.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            appState.updateSleepLocation(trimmed)
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}

