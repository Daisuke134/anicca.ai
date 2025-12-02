import ComponentsKit
import SwiftUI

struct CompletionStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
                .padding(.top, 40)
            
            Text("onboarding_completion_title")
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)
            
            if let nextSchedule = appState.getNextHabitSchedule() {
                Text(nextSchedule.message)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else {
                Text("onboarding_completion_ready")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Spacer()
            
            PrimaryButton(
                title: String(localized: "onboarding_completion_continue")
            ) { next() }
            .padding(.horizontal)
            .padding(.bottom)

        }
        .padding(24)
        .background(AppBackground())
    }
}


