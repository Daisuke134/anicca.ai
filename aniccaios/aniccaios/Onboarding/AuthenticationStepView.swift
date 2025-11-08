import AuthenticationServices
import SwiftUI

struct AuthenticationStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    @State private var isProcessing = false
    
    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_account_title")
                .font(.title)
                .padding(.top, 40)
            
            Text("onboarding_account_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            SignInWithAppleButton(.signIn) { request in
                isProcessing = true
                AuthCoordinator.shared.configure(request)
            } onCompletion: { result in
                AuthCoordinator.shared.completeSignIn(result: result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .padding(.horizontal, 40)
            .onChange(of: appState.authStatus) { _, status in
                handleAuthStatusChange(status)
            }
            
            if isProcessing {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("common_signing_in")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            
            Spacer()
        }
        .padding(24)
    }
    
    private func handleAuthStatusChange(_ status: AuthStatus) {
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
}

