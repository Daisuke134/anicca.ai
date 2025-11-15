import SwiftUI

struct PaywallStepView: View {
    let next: () -> Void
    var body: some View {
        PaywallContainerView(onPurchaseCompleted: next)
    }
}


