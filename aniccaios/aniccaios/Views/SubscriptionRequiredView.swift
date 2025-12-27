import SwiftUI

struct SubscriptionRequiredView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    var body: some View {
        PaywallContainerView(
            onDismissRequested: { dismiss() }
        )
            .ignoresSafeArea()
    }
}


