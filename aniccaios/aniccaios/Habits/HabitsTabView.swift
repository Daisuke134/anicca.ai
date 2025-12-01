import SwiftUI

struct HabitsTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingSettings = false
    
    var body: some View {
        NavigationStack {
            HabitsSectionView()
                .navigationTitle(String(localized: "settings_habits"))
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showingSettings = true }) {
                            Image(systemName: "gearshape")
                        }
                    }
                }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(appState)
        }
        .background(AppBackground())
    }
}


