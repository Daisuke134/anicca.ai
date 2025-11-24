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
                                    vm.title = isRequesting
                                        ? String(localized: "common_requesting")
                                        : String(localized: "common_continue")
                                    vm.style = .filled
                                    vm.size = .medium
                                    vm.isFullWidth = true
                                    vm.isEnabled = !isRequesting
                                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                                    return vm
                                }(),
                                action: requestNotifications
                            )

                            if notificationDenied {
                                SUButton(
                                    model: {
                                        var vm = ButtonVM()
                                        vm.title = String(localized: "common_open_settings")
                                        vm.style = .plain
                                        vm.size = .medium
                                        vm.isFullWidth = true
                                        vm.isEnabled = true
                                        vm.color = .init(main: .universal(.uiColor(.systemGray)), contrast: .secondaryForeground)
                                        return vm
                                    }(),
                                    action: openSettings
                                )
                            }
                            
                            // 『あとで設定』は削除（5.1.1対策: プリプロンプトに退出ボタンを置かない）
                        }

                        Text(String(localized: "onboarding_notifications_optional_hint"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            )

            Spacer()
        }
        .padding(24)
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
                    next()
                }
            }
            await refreshAuthorizationState(autoAdvance: false)
        }
    }

    private func refreshAuthorizationState(autoAdvance: Bool) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await MainActor.run {
            notificationGranted = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            notificationDenied = settings.authorizationStatus == .denied

            if autoAdvance, notificationGranted {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    next()
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
