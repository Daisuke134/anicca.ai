import SwiftUI

struct AgeStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    
    private let options = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"]
    
    @State private var selected: String?
    
    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_age_title"))
                .font(.system(size: 36, weight: .bold))
                .fontWeight(.heavy)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
                .padding(.horizontal, 24)
            
            VStack(spacing: 12) {
                ForEach(options, id: \.self) { option in
                    optionButton(option)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            
            Spacer()
            
            VStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_next"),
                    isEnabled: selected != nil,
                    style: .large
                ) {
                    if let selected = selected {
                        appState.updateAgeRange(selected)
                        AnalyticsManager.shared.setUserProperty("age_range", value: selected)
                    }
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
    }
    
    @ViewBuilder
    private func optionButton(_ option: String) -> some View {
        let isSelected = selected == option
        Button {
            selected = option
        } label: {
            HStack {
                Text(option)
                    .font(.system(size: 16, weight: .medium))
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

