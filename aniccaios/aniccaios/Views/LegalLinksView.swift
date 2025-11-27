import SwiftUI

struct LegalLinksView: View {
    var body: some View {
        VStack(spacing: 8) {
            Link(String(localized: "legal_privacy_policy"), destination: URL(string: "https://aniccaai.com/privacy")!)
            Link(String(localized: "legal_terms_of_use"), destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
        }
        .font(.footnote)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }
}

