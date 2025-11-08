import ComponentsKit
import SwiftUI

struct HabitWakeLocationStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var sleepLocation: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_habit_wake_location_title")
                .font(.title)
                .padding(.top, 40)

            Text("onboarding_habit_wake_location_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            AccessorylessTextField(
                placeholder: String(localized: "onboarding_habit_location_placeholder"),
                text: $sleepLocation
            )
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.horizontal, 32)

            Spacer()

            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
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

