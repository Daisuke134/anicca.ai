import SwiftUI
import UIKit

struct AlarmKitPermissionStepView: View {
    let next: () -> Void

    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_alarmkit_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text(String(localized: "onboarding_alarmkit_description"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            PrimaryButton(
                title: isRequesting ? String(localized: "common_requesting") : String(localized: "onboarding_alarmkit_allow"),
                isEnabled: !isRequesting,
                isLoading: isRequesting,
                style: .primary
            ) {
                requestAlarmKit()
            }
        }
        .padding(24)
        .background(AppBackground())
    }

    private func requestAlarmKit() {
        guard !isRequesting else { return }
        isRequesting = true

        Task { @MainActor in
            // AlarmKit is available iOS 26+ and only when linked framework exists.
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                _ = await AlarmKitHabitCoordinator.shared.requestAuthorizationIfNeeded()
            }
            #endif

            isRequesting = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.easeInOut(duration: 0.35)) { next() }
            }
        }
    }
}

