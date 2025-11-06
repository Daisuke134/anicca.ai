import AuthenticationServices
import SwiftUI

struct AuthenticationStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    @State private var isProcessing = false
    
    var body: some View {
        VStack(spacing: 24) {
            Text("Sign in with Apple")
                .font(.title)
                .padding(.top, 40)
            
            Text("Sign in to sync your habits and preferences across your devices.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            SignInWithAppleButton(.signIn) { request in
                isProcessing = true
                AuthCoordinator.shared.startSignIn()
            } onCompletion: { result in
                // Handled by AuthCoordinator
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .padding(.horizontal, 40)
            .onChange(of: appState.authStatus) { status in
                if case .signedIn = status {
                    isProcessing = false
                    // Small delay before advancing for better UX
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        next()
                    }
                } else if case .signedOut = status {
                    isProcessing = false
                }
            }
            
            if isProcessing {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Signing in...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            
            Spacer()
        }
        .padding(24)
    }
}

