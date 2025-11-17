import AuthenticationServices
import CryptoKit
import Foundation
import OSLog

@MainActor
final class AuthCoordinator {
    static let shared = AuthCoordinator()
    
    private let logger = Logger(subsystem: "com.anicca.ios", category: "AuthCoordinator")
    private var currentNonce: String?
    private var preparedController: ASAuthorizationController?
    private var preparedRequest: ASAuthorizationAppleIDRequest?
    
    private init() {}
    
    lazy var presentationDelegate: AuthPresentationDelegate = {
        AuthPresentationDelegate(coordinator: self)
    }()
    
    // Shared URLSession with keep-alive for better performance
    private static let sharedSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 30
        configuration.httpMaximumConnectionsPerHost = 1
        return URLSession(configuration: configuration)
    }()
    
    func configure(_ request: ASAuthorizationAppleIDRequest) {
        let startTime = Date()
        logger.info("Auth flow started")
        
        AppState.shared.setAuthStatus(.signingIn)
        
        let nonce = randomNonceString()
        currentNonce = nonce
        guard let hashedNonce = sha256Base64(nonce) else {
            logger.error("Failed to compute nonce hash")
            AppState.shared.setAuthStatus(.signedOut)
            return
        }
        
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce
        
        // Store prepared request for reuse
        preparedRequest = request
        
        let setupTime = Date().timeIntervalSince(startTime)
        logger.info("Auth request configured in \(setupTime * 1000, privacy: .public)ms")
    }
    
    func reusePreparedRequest(_ request: ASAuthorizationAppleIDRequest) {
        // If we have a prepared request, reuse it
        if let prepared = preparedRequest {
            request.requestedScopes = prepared.requestedScopes
            request.nonce = prepared.nonce
        } else {
            configure(request)
        }
    }
    
    func startSignIn() {
        let nonce = randomNonceString()
        currentNonce = nonce
        guard let hashedNonce = sha256Base64(nonce) else {
            logger.error("Failed to compute nonce hash")
            return
        }
        
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce
        
        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = presentationDelegate
        authorizationController.presentationContextProvider = presentationDelegate
        
        AppState.shared.setAuthStatus(.signingIn)
        authorizationController.performRequests()
    }
    
    func completeSignIn(result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            handleAuthorization(authorization)
        case .failure(let error):
            logger.error("Apple sign in failed: \(error.localizedDescription, privacy: .public)")
            AppState.shared.setAuthStatus(.signedOut)
        }
    }
    
    func signOut() {
        AppState.shared.clearUserCredentials()
        AppState.shared.resetState()
    }
    
    private func handleAuthorization(_ authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            logger.error("Invalid credential type")
            AppState.shared.setAuthStatus(.signedOut)
            return
        }
        
        guard let nonce = currentNonce,
              sha256Base64(nonce) != nil,
              let identityTokenData = appleIDCredential.identityToken,
              let identityTokenString = String(data: identityTokenData, encoding: .utf8) else {
            logger.error("Missing identity token or nonce")
            AppState.shared.setAuthStatus(.signedOut)
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
        let startTime = Date()
        let url = AppConfig.appleAuthURL
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "identity_token": identityToken,
            "nonce": nonce,
            "user_id": userId
        ]
        
        var lastError: Error?
        let maxRetries = 2
        
        for attempt in 0...maxRetries {
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                
                let (data, response) = try await Self.sharedSession.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw AuthError.invalidResponse
                }
                
                guard (200..<300).contains(httpResponse.statusCode) else {
                    logger.error("Auth backend returned error status: \(httpResponse.statusCode, privacy: .public)")
                    await MainActor.run {
                        AppState.shared.setAuthStatus(.signedOut)
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
                    
                    let totalTime = Date().timeIntervalSince(startTime)
                    logger.info("Sign in successful for user: \(backendUserId, privacy: .public), took \(totalTime * 1000, privacy: .public)ms")
                    return
                } else {
                    throw AuthError.invalidResponseFormat
                }
            } catch {
                lastError = error
                logger.warning("Backend verification attempt \(attempt + 1) failed: \(error.localizedDescription, privacy: .public)")
                
                if attempt < maxRetries {
                    // Exponential backoff: 0.1s, 0.2s
                    let delay = pow(2.0, Double(attempt)) * 0.1
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        
        // All retries failed
        logger.error("Failed to verify with backend after \(maxRetries + 1) attempts: \(lastError?.localizedDescription ?? "unknown", privacy: .public)")
        await MainActor.run {
            AppState.shared.setAuthStatus(.signedOut)
        }
    }
    
    enum AuthError: Error {
        case invalidResponse
        case invalidResponseFormat
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
    
    private func sha256Base64(_ input: String) -> String? {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return Data(hashedData).base64EncodedString()
    }
    
}
