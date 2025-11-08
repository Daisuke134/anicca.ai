import ComponentsKit
import SwiftUI

struct HabitTrainingFocusStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var selectedTrainingFocus: String = ""
    @State private var isSaving = false

    private struct TrainingFocusOption: Identifiable {
        let id: String
        let labelKey: LocalizedStringKey
    }

    private let trainingFocusOptions: [TrainingFocusOption] = [
        .init(id: "Push-up", labelKey: "training_focus_option_pushup"),
        .init(id: "Core", labelKey: "training_focus_option_core"),
        .init(id: "Cardio", labelKey: "training_focus_option_cardio"),
        .init(id: "Stretch", labelKey: "training_focus_option_stretch")
    ]

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_habit_training_title")
                .font(.title)
                .padding(.top, 40)

            Text("onboarding_habit_training_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(trainingFocusOptions) { option in
                    Button(action: {
                        selectedTrainingFocus = option.id
                    }) {
                        HStack {
                            Image(systemName: selectedTrainingFocus == option.id ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selectedTrainingFocus == option.id ? .blue : .secondary)
                            Text(option.labelKey)
                                .font(.body)
                                .foregroundStyle(.primary)
                            Spacer()
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(selectedTrainingFocus == option.id ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 32)

            Spacer()

            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = isSaving ? String(localized: "common_saving") : String(localized: "common_continue")
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.isEnabled = !selectedTrainingFocus.isEmpty && !isSaving
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
        guard !selectedTrainingFocus.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            appState.updateTrainingFocus([selectedTrainingFocus])
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}


