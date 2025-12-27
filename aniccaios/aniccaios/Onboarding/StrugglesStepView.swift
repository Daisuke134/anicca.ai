import SwiftUI

struct StrugglesStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState

    // スクショ準拠: Procrastination, Anxiety, Poor Sleep, Stress, Focus, Motivation, Self-doubt, Time Management, Burnout, Relationships, Energy, Work-Life Balance
    private let options: [String] = [
        "procrastination", "anxiety", "poor_sleep",
        "stress", "focus", "motivation",
        "self_doubt", "time_management", "burnout",
        "relationships", "energy", "work_life_balance"
    ]

    @State private var selected: Set<String> = []

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_struggles_title"))
                .font(.system(size: 36, weight: .bold))
                .fontWeight(.heavy)
                .lineSpacing(4) // line-height 40px
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
                .padding(.horizontal, 24)

            Text(String(localized: "onboarding_struggles_subtitle"))
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            ScrollView {
                FlowLayout(spacing: 12) {
                    ForEach(options, id: \.self) { key in
                        chipButton(kind: "problem", key: key)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 8)
            }

            Spacer()

            VStack(spacing: 12) {
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
                
                Button(String(localized: "common_skip")) {
                    next()
                }
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
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
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}



