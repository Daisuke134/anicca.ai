import SwiftUI
import AuthenticationServices

struct WelcomeStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    @State private var isRestoring = false

    var body: some View {
        VStack {
            Spacer()
            
            VStack(spacing: 32) {
                Text(String(localized: "onboarding_welcome_title"))
                    .font(.system(size: 52, weight: .bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.Colors.label)

                VStack(spacing: 8) {
                    Text(String(localized: "onboarding_welcome_subtitle_line1"))
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        .multilineTextAlignment(.center)

                    Text(String(localized: "onboarding_welcome_subtitle_line2"))
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.label.opacity(0.8))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
            }
            
            Spacer()
            
            VStack(spacing: 16) {
                PrimaryButton(
                    title: String(localized: "onboarding_welcome_cta"),
                    style: .large
                ) { next() }
                .padding(.horizontal, 16)
                
                // v0.4: 既存ユーザー向けの復元ボタン
                VStack(spacing: 12) {
                    Text(String(localized: "onboarding_welcome_restore_description"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    
                    SignInWithAppleButton(.signIn) { request in
                        AuthCoordinator.shared.configure(request)
                    } onCompletion: { result in
                        isRestoring = true
                        AuthCoordinator.shared.completeSignIn(result: result) { success in
                            if success {
                                Task {
                                    await appState.bootstrapProfileFromServerIfAvailable()
                                    // v0.5: 認証成功後の遷移を確実に
                                    await MainActor.run {
                                        let hasProfile = !appState.userProfile.displayName.isEmpty
                                        let hasProblems = !appState.userProfile.struggles.isEmpty

                                        if hasProfile || hasProblems {
                                            // 既存ユーザー: オンボーディングをスキップしてメイン画面へ
                                            appState.markOnboardingComplete()
                                        } else {
                                            // 新規ユーザー: オンボーディングを続行
                                            next()
                                        }
                                        isRestoring = false
                                    }
                                }
                            } else {
                                isRestoring = false
                            }
                        }
                    }
                    .signInWithAppleButtonStyle(.whiteOutline)
                    .frame(height: 44)
                    .padding(.horizontal, 16)
                }
                .padding(.top, 8)
            }
            .padding(.bottom, 48)
        }
        .disabled(isRestoring)
        .overlay {
            if isRestoring {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)
            }
        }
        .background(AppBackground())
    }
}
