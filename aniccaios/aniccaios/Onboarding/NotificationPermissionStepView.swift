import ComponentsKit
import SwiftUI
import UserNotifications

struct NotificationPermissionStepView: View {
    let next: () -> Void

    @State private var notificationGranted = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_notifications_title"))
                .font(.title)
                .padding(.top, 40)

            SUCard(
                model: .init(),
                content: {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(String(localized: "onboarding_notifications_card_title"))
                            .font(.headline)
                        Text(String(localized: "onboarding_notifications_description"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if notificationGranted {
                            HStack {
                                SUBadge(model: {
                                    var vm = BadgeVM()
                                    vm.title = String(localized: "common_enabled")
                                    vm.color = .init(main: .success, contrast: .white)
                                    return vm
                                }())
                                Spacer()
                            }
                        } else {
                            SUButton(
                                model: {
                                    var vm = ButtonVM()
                                    vm.title = isRequesting ? String(localized: "common_requesting") : String(localized: "common_allow_notifications")
                                    vm.style = .filled
                                    vm.size = .medium
                                    vm.isFullWidth = true
                                    vm.isEnabled = !isRequesting
                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                                    return vm
                                }(),
                                action: requestNotifications
                            )
                        }
                    }
                }
            )

            Spacer()
        }
        .padding(24)
        .onAppear {
            // Check current authorization status
            Task {
                let granted = await NotificationScheduler.shared.isAuthorizedForAlerts()
                await MainActor.run {
                    notificationGranted = granted
                    if granted {
                        // Auto-advance if already granted (same as microphone permission)
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            next()
                        }
                    }
                }
            }
        }
    }

    private func requestNotifications() {
        guard !isRequesting else { return }
        isRequesting = true
        Task {
            let granted = await NotificationScheduler.shared.requestAuthorization()
            await MainActor.run {
                notificationGranted = granted
                isRequesting = false
                if granted {
                    // Small delay before advancing for better UX
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        next()
                    }
                } else {
                    // Permission denied - show error message and retry button
                    // User must grant permission to proceed
                }
            }
        }
    }
}
