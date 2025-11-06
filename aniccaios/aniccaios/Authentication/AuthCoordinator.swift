import AuthenticationServices
import CryptoKit
import Foundation
import OSLog

@MainActor
final class AuthCoordinator {
    static let shared = AuthCoordinator()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AuthCoordinator")
    private var currentNonce: String?
    
    private init() {}
    
    func startSignIn() {
        let nonce = randomNonceString()
        currentNonce = nonce
        let hashedNonce = sha256(nonce)
        
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce
        
        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = presentationDelegate
        authorizationController.presentationContextProvider = presentationDelegate
        
        AppState.shared.authStatus = .signingIn
        authorizationController.performRequests()
    }
    
    func completeSignIn(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            handleAuthorization(authorization)
        case .failure(let error):
            logger.error("Apple sign in failed: \(error.localizedDescription, privacy: .public)")
            AppState.shared.authStatus = .signedOut
        }
    }
    
    func signOut() {
        AppState.shared.clearUserCredentials()
        AppState.shared.resetState()
    }
    
    private func handleAuthorization(_ authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            logger.error("Invalid credential type")
            AppState.shared.authStatus = .signedOut
            return
        }
        
        guard let nonce = currentNonce,
              let hashedNonce = sha256(nonce),
              let identityTokenString = String(data: appleIDCredential.identityToken ?? Data(), encoding: .utf8) else {
            logger.error("Missing identity token or nonce")
            AppState.shared.authStatus = .signedOut
            return
        }
        
        // Extract user info
        let userId = appleIDCredential.user
        let fullName = appleIDCredential.fullName
        let email = appleIDCredential.email
        
        let displayName = [fullName?.givenName, fullName?.familyName]
            .compactMap { $0 }
            .joined(separator: " ")
        
        // Send to backend for verification
        Task {
            await verifyWithBackend(
                identityToken: identityTokenString,
                nonce: nonce,
                userId: userId,
                displayName: displayName.isEmpty ? "User" : displayName,
                email: email
            )
        }
    }
    
    private func verifyWithBackend(
        identityToken: String,
        nonce: String,
        userId: String,
        displayName: String,
        email: String?
    ) async {
        let url = AppConfig.appleAuthURL
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "identity_token": identityToken,
            "nonce": nonce,
            "user_id": userId
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                logger.error("Auth backend returned error status")
                await MainActor.run {
                    AppState.shared.authStatus = .signedOut
                }
                return
            }
            
            // Parse backend response (expected: { userId, displayName, email })
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let backendUserId = json["userId"] as? String {
                
                let credentials = UserCredentials(
                    userId: backendUserId,
                    displayName: displayName,
                    email: email
                )
                
                await MainActor.run {
                    AppState.shared.updateUserCredentials(credentials)
                }
                
                logger.info("Sign in successful for user: \(backendUserId, privacy: .public)")
            } else {
                logger.error("Invalid backend response format")
                await MainActor.run {
                    AppState.shared.authStatus = .signedOut
                }
            }
        } catch {
            logger.error("Failed to verify with backend: \(error.localizedDescription, privacy: .public)")
            await MainActor.run {
                AppState.shared.authStatus = .signedOut
            }
        }
    }
    
    // MARK: - Nonce generation
    
    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length
        
        while remainingLength > 0 {
            let randoms: [UInt8] = (0..<16).map { _ in
                var random: UInt8 = 0
                let errorCode = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
                if errorCode != errSecSuccess {
                    fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
                }
                return random
            }
            
            randoms.forEach { random in
                if remainingLength == 0 {
                    return
                }
                
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }
        
        return result
    }
    
    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        let hashString = hashedData.compactMap { String(format: "%02x", $0) }.joined()
        return hashString
    }
    
    lazy var presentationDelegate: AuthPresentationDelegate = {
        AuthPresentationDelegate(coordinator: self)
    }()
}

