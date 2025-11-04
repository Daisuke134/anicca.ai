import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome

    var body: some View {
        switch step {
        case .welcome:
            WelcomeStepView(next: advance)
        case .permissions:
            PermissionsStepView(next: advance)
        case .wakeSetup:
            WakeSetupStepView(next: advance)
        }
    }

    private func advance() {
        switch step {
        case .welcome:
            step = .permissions
        case .permissions:
            step = .wakeSetup
        case .wakeSetup:
            appState.markOnboardingComplete()
        }
    }
}
