import ComponentsKit
import SwiftUI
import UserNotifications
import UIKit

struct NotificationPermissionStepView: View {
    let next: () -> Void

    @State private var notificationGranted = false
    @State private var notificationDenied = false
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_notifications_title"))
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)

            Text(String(localized: "onboarding_notifications_description"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Text(String(localized: notificationGranted ? "onboarding_permission_status_allowed" : "onboarding_permission_status_not_allowed"))
                .font(.subheadline)
                .foregroundStyle(.secondary)

            PrimaryButton(
                title: isRequesting
                    ? String(localized: "common_requesting")
                    : String(localized: "onboarding_notifications_allow"),
                isEnabled: !isRequesting && !notificationGranted,
                isLoading: isRequesting,
                style: notificationGranted ? .selected : .primary
            ) { requestNotifications() }

        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            Task { await refreshAuthorizationState(autoAdvance: true) }
        }
    }

    private func requestNotifications() {
        guard !isRequesting else { return }
        isRequesting = true
        Task {
            let granted = await NotificationScheduler.shared.requestAuthorization()
            await MainActor.run {
                notificationGranted = granted
                notificationDenied = !granted
                isRequesting = false
                // 許可/拒否に関わらず必ず次へ（5.1.1対策: プリプロンプト後はOSダイアログに必ず進ませる）
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    withAnimation(.easeInOut(duration: 0.35)) { next() }
                }
            }
            await refreshAuthorizationState(autoAdvance: false)
        }
    }

    private func refreshAuthorizationState(autoAdvance: Bool) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await MainActor.run {
            let authorized = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            let timeSensitiveOk = settings.timeSensitiveSetting != .disabled
            notificationGranted = authorized && timeSensitiveOk
            notificationDenied = settings.authorizationStatus == .denied

            if autoAdvance, notificationGranted {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    withAnimation(.easeInOut(duration: 0.35)) { next() }
                }
            }
        }
    }

    // 『あとで設定』ハンドラは削除（5.1.1対策）

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
