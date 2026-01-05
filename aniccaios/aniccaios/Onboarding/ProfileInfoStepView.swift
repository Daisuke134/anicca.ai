import ComponentsKit
import SwiftUI

struct ProfileInfoStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var displayName: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_profile_title")
                .font(AppTheme.Typography.appTitle)
                .fontWeight(.heavy)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text("onboarding_profile_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            TextField(String(localized: "onboarding_profile_placeholder"), text: $displayName)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never) // 【修正】勝手な大文字化を防ぐ
                .autocorrectionDisabled()
                .padding(.horizontal, 32)

            Spacer()

            PrimaryButton(
                title: isSaving
                    ? String(localized: "common_saving")
                    : String(localized: "onboarding_profile_continue"),
                isEnabled: !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
                isLoading: isSaving
            ) { save() }
            .padding(.horizontal)
            .padding(.bottom)

        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            let currentName = appState.userProfile.displayName.trimmingCharacters(in: .whitespaces)
            // Don't pre-fill with "User" - show placeholder instead
            if currentName.isEmpty || currentName == "User" {
                displayName = ""
            } else {
                displayName = currentName
            }
        }
    }

    private func save() {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            var profile = appState.userProfile
            profile.displayName = trimmed
            appState.updateUserProfile(profile, sync: true)
            
            // Mixpanelにも保存
            AnalyticsManager.shared.setUserProperty("display_name", value: trimmed)
            
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}

