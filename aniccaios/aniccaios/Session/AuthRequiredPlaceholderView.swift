import SwiftUI

struct AuthRequiredPlaceholderView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            
            Text("Please Sign In")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Sign in to start using Anicca and set up your habits.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}



