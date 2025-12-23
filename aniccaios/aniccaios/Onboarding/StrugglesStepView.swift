import SwiftUI

struct StrugglesStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState

    // profile.md (Figma) 準拠: rumination, jealousy, self_criticism, anxiety, loneliness, irritation
    private let rows: [[String]] = [
        ["rumination", "jealousy", "self_criticism"],
        ["anxiety", "loneliness", "irritation"]
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
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        HStack(spacing: 12) {
                            ForEach(row, id: \.self) { key in
                                chipButton(kind: "problem", key: key)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }

            Spacer()

            PrimaryButton(
                title: String(localized: "common_next"),
                isEnabled: !selected.isEmpty,
                style: .large
            ) {
                var profile = appState.userProfile
                profile.problems = Array(selected)
                appState.updateUserProfile(profile, sync: true)
                next()
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



