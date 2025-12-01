import SwiftUI

struct HabitFollowUpView: View {
    let habit: HabitType
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var childSaveAction: (() -> Void)? = nil
    
    var body: some View {
        NavigationStack {
            Group {
                switch habit {
                case .wake:
                    HabitWakeFollowUpView(onRegisterSave: { action in
                        self.childSaveAction = action
                    })
                case .bedtime:
                    HabitSleepFollowUpView(onRegisterSave: { action in
                        self.childSaveAction = action
                    })
                case .training:
                    HabitTrainingFollowUpView(onRegisterSave: { action in
                        self.childSaveAction = action
                    })
                case .custom:
                    EmptyView()
                }
            }
            .navigationTitle(habit.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common_save")) {
                        save()
                    }
                }
            }
            .background(AppBackground())
        }
    }
    
    private func save() {
        childSaveAction?()
        dismiss()
    }
}

