import Foundation

enum LanguagePreference: String, Codable {
    case ja
    case en
    
    var languageLine: String {
        switch self {
        case .ja:
            return NSLocalizedString("language_preference_ja", comment: "")
        case .en:
            return NSLocalizedString("language_preference_en", comment: "")
        }
    }
    
    static func detectDefault(locale: Locale = .current) -> Self {
        let preferred = Locale.preferredLanguages.first ?? locale.identifier
        if preferred.hasPrefix("ja") || locale.identifier.hasPrefix("ja") {
            return .ja
        }
        return .en
    }
}

struct UserProfile: Codable {
    var displayName: String
    var preferredLanguage: LanguagePreference
    var sleepLocation: String
    var trainingFocus: [String]
    
    init(
        displayName: String = "",
        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
        sleepLocation: String = "",
        trainingFocus: [String] = []
    ) {
        self.displayName = displayName
        self.preferredLanguage = preferredLanguage
        self.sleepLocation = sleepLocation
        self.trainingFocus = trainingFocus
    }
}

struct UserCredentials: Codable {
    let userId: String
    let displayName: String
    let email: String?
}

enum AuthStatus: Codable, Equatable {
    case signedOut
    case signingIn
    case signedIn(UserCredentials)
    
    static func == (lhs: AuthStatus, rhs: AuthStatus) -> Bool {
        switch (lhs, rhs) {
        case (.signedOut, .signedOut), (.signingIn, .signingIn):
            return true
        case (.signedIn(let lhsCreds), .signedIn(let rhsCreds)):
            return lhsCreds.userId == rhsCreds.userId
        default:
            return false
        }
    }
}


