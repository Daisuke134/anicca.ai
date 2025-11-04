import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var wakeDate: Date
    @State private var isSaving = false

    init() {
        let calendar = Calendar.current
        let defaultDate = Date()
        let wakeTime = AppState.shared.wakeTime
        if let wakeTime = wakeTime {
            var components = DateComponents()
            components.hour = wakeTime.hour ?? calendar.component(.hour, from: defaultDate)
            components.minute = wakeTime.minute ?? calendar.component(.minute, from: defaultDate)
            if let date = calendar.date(from: components) {
                _wakeDate = State(initialValue: date)
            } else {
                _wakeDate = State(initialValue: defaultDate)
            }
        } else {
            _wakeDate = State(initialValue: defaultDate)
        }
    }

    var body: some View {
        NavigationView {
            Form {
                Section {
                    DatePicker("Wake Time", selection: $wakeDate, displayedComponents: .hourAndMinute)
                }
                Section {
                    Button("Save") {
                        Task {
                            isSaving = true
                            await appState.updateWakeTime(wakeDate)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

