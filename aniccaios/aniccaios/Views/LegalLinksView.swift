import SwiftUI

struct LegalLinksView: View {
    var body: some View {
        VStack(spacing: 8) {
            Link("Privacy Policy", destination: URL(string: "https://aniccaai.com/privacy")!)
            Link("Terms of Use (EULA)", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
        }
        .font(.footnote)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }
}

