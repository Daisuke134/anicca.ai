import SwiftUI

struct IdealsStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState

    // v3-ui.md の例（推測で増やさない）
    private let options: [String] = [
        "kind",
        "honest",
        "mindful",
        "confident",
        "early_riser",
        "runner",
        "healthy",
        "calm",
        "disciplined",
        "open",
        "courageous"
    ]

    @State private var selected: Set<String> = []

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_ideals_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text(String(localized: "onboarding_ideals_subtitle"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 110), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(options, id: \.self) { key in
                        chipButton(kind: "ideal_trait", key: key)
                    }
                }
                .padding(.horizontal, 16) // v3-ui.md: 画面左右 16pt
                .padding(.top, 8)
            }

            Spacer()

            HStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_skip"),
                    style: .unselected
                ) {
                    // v3-ui.md: Skip で次へ（空で保存）
                    appState.updateIdealTraits([])
                    next()
                }
                PrimaryButton(
                    title: String(localized: "common_next"),
                    style: .primary
                ) {
                    appState.updateIdealTraits(Array(selected))
                    next()
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom)
        }
        .background(AppBackground())
        .onAppear {
            selected = Set(appState.userProfile.idealTraits)
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
                .font(.subheadline)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
                .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.buttonTextUnselected)
                .cornerRadius(AppTheme.Radius.md)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                        .stroke(
                            isSelected ? AppTheme.Colors.border : AppTheme.Colors.borderLight,
                            lineWidth: isSelected ? 2 : 1
                        )
                )
        }
        .buttonStyle(.plain)
    }
}

