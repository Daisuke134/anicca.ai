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
            
            ZStack {
                SignInWithAppleButton(.signIn) { request in
                    // Reuse prepared request if available for instant sheet display
                    AuthCoordinator.shared.reusePreparedRequest(request)
                    isProcessing = true
                } onCompletion: { result in
                    AuthCoordinator.shared.completeSignIn(result: result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .padding(.horizontal, 40)
                .disabled(isProcessing)
                .opacity(isProcessing ? 0.6 : 1.0)
                
                // Overlay with spinner when processing (no text)
                if isProcessing {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                }
            }
            
            Spacer()
        }
        .padding(24)
        .onChange(of: appState.authStatus) { _, status in
            handleAuthStatusChange(status)
        }
        .onAppear {
            Task {
                await AuthHealthCheck.shared.warmBackend()
            }
        }
    }
    
    private func handleAuthStatusChange(_ status: AuthStatus) {
        switch status {
        case .signingIn:
            isProcessing = true
        case .signedIn:
            isProcessing = false
            // Immediately transition to next screen
            next()
        case .signedOut:
            isProcessing = false
        }
    }
}

