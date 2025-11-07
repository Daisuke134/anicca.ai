import ComponentsKit
import SwiftUI

struct HabitTrainingFocusStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var selectedTrainingFocus: String = ""
    @State private var isSaving = false

    private let trainingFocusOptions = ["Push-up", "Core", "Cardio", "Stretch"]

    var body: some View {
        VStack(spacing: 24) {
            Text("Which training do you want to focus on every day?")
                .font(.title)
                .padding(.top, 40)

            Text("Choose one training focus that you want to build as a habit.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(trainingFocusOptions, id: \.self) { option in
                    Button(action: {
                        selectedTrainingFocus = option
                    }) {
                        HStack {
                            Image(systemName: selectedTrainingFocus == option ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selectedTrainingFocus == option ? .blue : .secondary)
                            Text(option)
                                .font(.body)
                                .foregroundStyle(.primary)
                            Spacer()
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(selectedTrainingFocus == option ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
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
                    vm.title = isSaving ? "Saving…" : "Continue"
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

