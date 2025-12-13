import AuthenticationServices
import SwiftUI

struct AuthenticationStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        VStack(spacing: 24) {
            Text("onboarding_account_title")
                .font(AppTheme.Typography.onboardingTitle)
                .fontWeight(.heavy)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
            
            Text("onboarding_account_description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
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

            Button(String(localized: "onboarding_account_skip")) {
                // v3-ui.md: Skip for now で次へ
                next()
            }
            .buttonStyle(.plain)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
            
            Spacer()
        }
        .padding(24)
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

