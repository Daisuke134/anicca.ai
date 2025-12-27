import SwiftUI
import UIKit
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
#endif

struct AlarmKitPermissionStepView: View {
    let next: () -> Void

    @State private var isRequesting = false
    @State private var hasAttemptedPermission = false
    @State private var permissionGranted = false
    @State private var permissionDenied = false

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
                title: isRequesting
                    ? String(localized: "common_requesting")
                    : (permissionGranted || hasAttemptedPermission
                        ? String(localized: "common_continue")
                        : String(localized: "onboarding_alarmkit_allow")),
                isEnabled: !isRequesting,
                isLoading: isRequesting,
                style: permissionGranted ? .selected : .primary
            ) {
                if permissionGranted || hasAttemptedPermission {
                    next()
                } else {
                    requestAlarmKit()
                }
            }
        }
        .padding(24)
        .background(AppBackground())
        .onAppear {
            checkCurrentPermission()
        }
    }

    private func requestAlarmKit() {
        guard !isRequesting else { return }
        isRequesting = true

        Task { @MainActor in
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                let granted = await AlarmKitPermissionManager.requestIfNeeded()
                permissionGranted = granted
                permissionDenied = !granted
                hasAttemptedPermission = true
                isRequesting = false
                // 許可・非許可ともに同じ遷移にする
                    next()
                return
            }
            #endif
            
            // iOS 26未満: AlarmKitは存在しないので、通知設定を確認
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            let authorized = settings.authorizationStatus == .authorized
            let timeSensitiveOk = settings.timeSensitiveSetting != .disabled
            
            if authorized && timeSensitiveOk {
                permissionGranted = true
            } else {
                permissionDenied = true
            }

            hasAttemptedPermission = true
            isRequesting = false
            next()
        }
    }
    
    private func checkCurrentPermission() {
        Task { @MainActor in
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                // AlarmKitHabitCoordinatorはauthorizationStateを内部で見ているが、
                // ここでは明示的に AlarmManager.shared.authorizationState を参照する
                permissionGranted = (AlarmManager.shared.authorizationState == .authorized)
                return
            }
            #endif
            
            // iOS 26未満: 通知設定を確認
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            permissionGranted = settings.authorizationStatus == .authorized
                && settings.timeSensitiveSetting != .disabled
        }
    }
}

