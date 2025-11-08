import ComponentsKit
import SwiftUI
import UserNotifications

struct NotificationPermissionStepView: View {
    let next: () -> Void

    @State private var notificationGranted = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text("Time-Sensitive Alerts")
                .font(.title)
                .padding(.top, 40)

            SUCard(
                model: .init(),
                content: {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Notification Access")
                            .font(.headline)
                        Text("Anicca needs notification access to remind you about your scheduled habits (wake-up, training, bedtime). These alerts will work even when your phone is silenced.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if notificationGranted {
                            HStack {
                                SUBadge(model: {
                                    var vm = BadgeVM()
                                    vm.title = "Enabled"
                                    vm.color = .init(main: .success, contrast: .white)
                                    return vm
                                }())
                                Spacer()
                            }
                        } else {
                            SUButton(
                                model: {
                                    var vm = ButtonVM()
                                    vm.title = isRequesting ? "Requesting…" : "Allow Notifications"
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
                let granted = await HabitAlarmScheduler.shared.alarmAuthorizationState()
                await MainActor.run {
                    notificationGranted = granted
                    if granted {
                        // Auto-advance if already granted
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
            let granted = await HabitAlarmScheduler.shared.requestAuthorization()
            await MainActor.run {
                notificationGranted = granted
                isRequesting = false
                if granted {
                    // Small delay before advancing for better UX
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        next()
                    }
                }
            }
        }
    }
}
