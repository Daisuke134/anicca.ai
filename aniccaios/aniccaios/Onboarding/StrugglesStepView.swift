import SwiftUI

struct StrugglesStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState

    // v3-ui.md の例（推測で増やさない）
    private let options: [String] = [
        "self_loathing",
        "rumination",
        "anxiety",
        "anger",
        "jealousy",
        "loneliness",
        "night_scrolling",
        "cant_wake_up",
        "no_motivation",
        "procrastination"
    ]

    @State private var selected: Set<String> = []

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_struggles_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text(String(localized: "onboarding_struggles_subtitle"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 140), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(options, id: \.self) { key in
                        chipButton(kind: "problem", key: key)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }

            Spacer()

            HStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_skip"),
                    style: .unselected
                ) {
                    var profile = appState.userProfile
                    profile.problems = []
                    appState.updateUserProfile(profile, sync: true)
                    next()
                }
                PrimaryButton(
                    title: String(localized: "common_next"),
                    style: .large
                ) {
                    var profile = appState.userProfile
                    profile.problems = Array(selected)
                    appState.updateUserProfile(profile, sync: true)
                    next()
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
        .onAppear {
            selected = Set(appState.userProfile.problems)
        }
    }

    @ViewBuilder
    private func chipButton(kind: String, key: String) -> some View {
        let isSelected = selected.contains(key)
        Button {
            if isSelected {
                selected.remove(key)
            } else {
                selected.insert(key)
            }
        } label: {
            Text(NSLocalizedString("\(kind)_\(key)", comment: ""))
                .font(.system(size: 16, weight: .medium))
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}



