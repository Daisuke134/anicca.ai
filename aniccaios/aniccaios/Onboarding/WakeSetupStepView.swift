import SwiftUI

struct WakeSetupStepView: View {
    let next: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var selectedDate = Date()
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("wake_setup_title")
                .font(.title)
                .padding(.top, 40)

            DatePicker(String(localized: "common_time"), selection: $selectedDate, displayedComponents: [.hourAndMinute])
                .datePickerStyle(.wheel)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "en_GB"))

            Text("wake_setup_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 16) {
                Button(String(localized: "common_preview_alarm")) {
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
                        Text(LocalizedStringKey("common_save_wake_time"))
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)
            }

            Spacer()
        }
        .padding(24)
        .background(AppBackground())
        .tint(AppTheme.Colors.accent)
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
