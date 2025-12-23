import SwiftUI

struct HabitsTabView: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        NavigationStack {
            HabitsSectionView()
                .navigationTitle(String(localized: "settings_habits"))
        }
        .background(AppBackground())
    }
}


