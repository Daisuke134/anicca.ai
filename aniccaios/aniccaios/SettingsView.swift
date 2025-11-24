import ComponentsKit
import RevenueCat
import RevenueCatUI
import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var isSaving = false
    @State private var displayName: String = ""
    @State private var preferredLanguage: LanguagePreference = .en



    var body: some View {
        navigationContainer {
            List {
                // Personalization section (簡略化)
                Section(String(localized: "settings_personalization")) {
                    TextField(String(localized: "settings_name"), text: $displayName)
                    Picker(String(localized: "settings_language"), selection: $preferredLanguage) {
                        Text(String(localized: "language_preference_ja")).tag(LanguagePreference.ja)
                        Text(String(localized: "language_preference_en")).tag(LanguagePreference.en)
                    }
                }
                
                // 理想の姿セクション（Phase 1に統合済み）
                Section(String(localized: "settings_ideal_traits")) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                        ForEach(idealTraitOptions, id: \.self) { trait in
                            idealTraitButton(trait: trait)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "settings_title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        Text(String(localized: "common_save"))
                            .fontWeight(.semibold)
                    }
                    .controlSize(.large)
                    .disabled(isSaving)
                }
            }
            .onAppear {
                loadPersonalizationData()
                Task { await SubscriptionManager.shared.syncNow() }
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
    
    private let idealTraitOptions = [
        "confident", "empathetic", "gentle", "optimistic", "creative",
        "energetic", "calm", "assertive", "motivational", "supportive",
        "direct", "encouraging", "analytical", "patient", "friendly", "professional"
    ]
    
    @ViewBuilder
    private func idealTraitButton(trait: String) -> some View {
        let isSelected = appState.userProfile.idealTraits.contains(trait)
        
        Button(action: {
            var traits = appState.userProfile.idealTraits
            if isSelected {
                traits.removeAll { $0 == trait }
            } else {
                traits.append(trait)
            }
            appState.updateIdealTraits(traits)
        }) {
            Text(trait)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? Color.black : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .secondary)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
    
    private func loadPersonalizationData() {
        displayName = appState.userProfile.displayName
        preferredLanguage = appState.userProfile.preferredLanguage
    }
    
    private func save() {
        isSaving = true
        var profile = appState.userProfile
        profile.displayName = displayName
        profile.preferredLanguage = preferredLanguage
        appState.updateUserProfile(profile, sync: true)
        isSaving = false
        dismiss()
    }
}
