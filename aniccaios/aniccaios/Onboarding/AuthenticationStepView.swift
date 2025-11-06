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
                AuthCoordinator.shared.configure(request)
            } onCompletion: { result in
                AuthCoordinator.shared.completeSignIn(result: result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .padding(.horizontal, 40)
            .onChange(of: appState.authStatus) { status in
                switch status {
                case .signedIn:
                    isProcessing = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        next()
                    }
                case .signingIn:
                    isProcessing = true
                case .signedOut:
                    isProcessing = false
                }
            }
            .onAppear {
                if case .signedIn = appState.authStatus {
                    next()
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

