import SwiftUI

struct SubscriptionRequiredView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        PaywallContainerView(
            onDismissRequested: { dismiss() }
        )
            .environment(\.locale, .autoupdatingCurrent)
            .ignoresSafeArea()
            .background(AppBackground())
    }
}


