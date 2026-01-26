import ComponentsKit
import SwiftUI
import UserNotifications
import UIKit

struct NotificationPermissionStepView: View {
    let next: () -> Void

    @State private var notificationGranted = false
    @State private var notificationDenied = false
    @State private var isRequesting = false
    // v3: 既に許可済みでも画面は表示、自動遷移しない
    @State private var hasAttemptedPermission = false

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


            Button {
                if hasAttemptedPermission {
                    next()
                } else {
                    requestNotifications()
                }
            } label: {
                if isRequesting {
                    ProgressView()
                        .tint(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(AppTheme.Colors.label)
                        .clipShape(RoundedRectangle(cornerRadius: 28))
                } else {
                    Text(hasAttemptedPermission ? String(localized: "common_continue") : String(localized: "onboarding_notifications_allow"))
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(hasAttemptedPermission ? AppTheme.Colors.buttonSelected : AppTheme.Colors.label)
                        .clipShape(RoundedRectangle(cornerRadius: 28))
                }
            }
            .disabled(isRequesting)
            .accessibilityIdentifier("onboarding-notifications-allow")

        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            // v3: autoAdvance を false にして自動遷移を廃止
            Task { await refreshAuthorizationState(autoAdvance: false) }
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
                hasAttemptedPermission = true
                // ★ 許可/拒否後に自動で次へ遷移
                next()
            }
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

            // v3: autoAdvance は常に無効（画面を必ず表示）
        }
    }

    // 『あとで設定』ハンドラは削除（5.1.1対策）

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
