import ComponentsKit
import SwiftUI

struct HabitWakeLocationStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var sleepLocation: String = ""
    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_habit_wake_location_title")
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)

            Text("onboarding_habit_wake_location_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            AccessorylessTextField(
                placeholder: String(localized: "onboarding_habit_location_placeholder"),
                text: $sleepLocation
            )
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.horizontal, 32)

            Spacer()

            PrimaryButton(
                title: isSaving ? String(localized: "common_saving") : String(localized: "common_continue"),
                isEnabled: !sleepLocation.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving,
                isLoading: isSaving
            ) { save() }
            .padding(.horizontal)
            .padding(.bottom)

        }
        .padding(24)
        .background(AppBackground())
    }

    private func save() {
        let trimmed = sleepLocation.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            appState.updateSleepLocation(trimmed)
            await MainActor.run {
                isSaving = false
                next()
            }
        }
    }
}

