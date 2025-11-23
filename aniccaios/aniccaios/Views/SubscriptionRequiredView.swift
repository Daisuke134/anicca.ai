import SwiftUI

struct SubscriptionRequiredView: View {
    var body: some View {
        PaywallContainerView()
            .environment(\.locale, .autoupdatingCurrent)
            .ignoresSafeArea()
    }
}


