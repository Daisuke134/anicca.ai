import SwiftUI

struct LegalLinksView: View {
    var body: some View {
        VStack(spacing: 8) {
            Link(String(localized: "legal_privacy_policy"), destination: privacyURL)
            Link(String(localized: "legal_terms_of_use"), destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
        }
        .font(.footnote)
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }
    
    private var privacyURL: URL {
        let lang = AppState.shared.userProfile.preferredLanguage.rawValue
        return URL(string: "https://aniccaai.com/privacy/\(lang)")!
    }
}

