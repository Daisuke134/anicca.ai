import SwiftUI

struct WakeSetupStepView: View {
    let next: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var selectedDate = Date()
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Set Your Wake Time")
                .font(.title)
                .padding(.top, 40)

            DatePicker("Wake Time", selection: $selectedDate, displayedComponents: [.hourAndMinute])
                .datePickerStyle(.wheel)
                .labelsHidden()

            Text("Anicca will ring exactly at this minute every day.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 16) {
                Button("Preview Alarm") {
                    // TODO: Local preview implementation
                }
                .buttonStyle(.bordered)
                .disabled(true)

                Button(action: save) {
                    if isSaving {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Save Wake Time")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)
            }

            Spacer()
        }
        .padding(24)
        .onAppear(perform: preload)
    }

    private func preload() {
        guard let stored = appState.wakeTime else { return }
        var components = stored
        components.second = 0
        if let date = Calendar.current.date(from: components) {
            selectedDate = date
        }
    }

    private func save() {
        guard !isSaving else { return }
        isSaving = true
        Task {
            await appState.updateWakeTime(selectedDate)
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}
