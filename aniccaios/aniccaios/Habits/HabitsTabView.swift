import SwiftUI

struct HabitsTabView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingSettings = false
    
    var body: some View {
        navigationContainer {
            // HabitsSectionViewを表示（習慣セクションのコンポーネントを再利用）
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
            SettingsView() // Personalizationと理想の姿のみ
                .environmentObject(appState)
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
}

