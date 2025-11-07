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
            
            ZStack {
                SignInWithAppleButton(.signIn) { request in
                    isProcessing = true
                    AppState.shared.setAuthStatus(.signingIn)
                    AuthCoordinator.shared.configure(request)
                } onCompletion: { result in
                    AuthCoordinator.shared.completeSignIn(result: result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .padding(.horizontal, 40)
                .disabled(isProcessing)
                
                if isProcessing {
                    ZStack {
                        Color.black.opacity(0.5)
                            .cornerRadius(8)
                        Text("Signing in…")
                            .foregroundStyle(.white)
                            .font(.headline)
                    }
                    .frame(height: 50)
                    .padding(.horizontal, 40)
                }
            }
            .onChange(of: appState.authStatus) { status in
                switch status {
                case .signedIn:
                    isProcessing = false
                    next()
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
            
            Spacer()
        }
        .padding(24)
    }
}

