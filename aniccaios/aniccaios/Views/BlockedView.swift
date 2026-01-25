import SwiftUI

/// Hard Paywall: 購読がキャンセル/期限切れの場合に表示するブロック画面
struct BlockedView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "lock.fill")
                .font(.system(size: 60))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)

            Text(String(localized: "blocked_title"))
                .font(.title2.bold())

            Text(String(localized: "blocked_message"))
                .font(.body)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)

            Button(String(localized: "profile_subscribe")) {
                SuperwallManager.shared.register(placement: SuperwallPlacement.resubscribe.rawValue)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("blocked_subscribe_button")
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppBackground())
    }
}
