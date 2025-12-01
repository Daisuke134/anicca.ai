import AuthenticationServices
import SwiftUI

struct AuthenticationStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            Text("onboarding_account_title")
                .font(.title)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
            
            Text("onboarding_account_description")
                .font(.subheadline)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Spacer()
            
            SignInWithAppleButton(.signIn) { request in
                AuthCoordinator.shared.configure(request)
            } onCompletion: { result in
                AuthCoordinator.shared.completeSignIn(result: result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .padding(.horizontal, 40)
            .onChange(of: appState.authStatus) { status in
                handleAuthStatusChange(status)
            }
            
            Spacer()
        }
        .padding(AppTheme.Spacing.xl)
        .background(AppBackground())
        .onAppear {
            Task {
                await AuthHealthCheck.shared.warmBackend()
            }
        }
    }
    
    private func handleAuthStatusChange(_ status: AuthStatus) {
        if case .signedIn = status {
            next()
        }
    }
}

