import SwiftUI

struct HabitFollowUpView: View {
    let habit: HabitType
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        navigationContainer {
            Group {
                switch habit {
                case .wake:
                    HabitWakeFollowUpView()
                case .bedtime:
                    HabitSleepFollowUpView()
                case .training:
                    HabitTrainingFollowUpView()
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
        }
    }
    
    // iOS 16以降でNavigationStack、それ以前でNavigationViewを使用
    @ViewBuilder
    private func navigationContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if #available(iOS 16.0, *) {
            NavigationStack {
                content()
            }
        } else {
            NavigationView {
                content()
            }
        }
    }
    
    private func save() {
        // 各フォローアップ画面で実装
        dismiss()
    }
}

