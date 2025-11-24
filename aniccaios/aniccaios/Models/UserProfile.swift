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
    
    // 追加フィールド
    var wakeLocation: String
    var wakeRoutines: [String]
    var sleepRoutines: [String]
    var trainingGoal: String
    var idealTraits: [String]
    
    init(
        displayName: String = "",
        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
        sleepLocation: String = "",
        trainingFocus: [String] = [],
        wakeLocation: String = "",
        wakeRoutines: [String] = [],
        sleepRoutines: [String] = [],
        trainingGoal: String = "",
        idealTraits: [String] = []
    ) {
        self.displayName = displayName
        self.preferredLanguage = preferredLanguage
        self.sleepLocation = sleepLocation
        self.trainingFocus = trainingFocus
        self.wakeLocation = wakeLocation
        self.wakeRoutines = wakeRoutines
        self.sleepRoutines = sleepRoutines
        self.trainingGoal = trainingGoal
        self.idealTraits = idealTraits
    }
    
    // 既存データとの互換性のためのカスタムデコーディング
    enum CodingKeys: String, CodingKey {
        case displayName, preferredLanguage, sleepLocation, trainingFocus
        case wakeLocation, wakeRoutines, sleepRoutines, trainingGoal, idealTraits
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        preferredLanguage = try container.decodeIfPresent(LanguagePreference.self, forKey: .preferredLanguage) ?? LanguagePreference.detectDefault()
        sleepLocation = try container.decodeIfPresent(String.self, forKey: .sleepLocation) ?? ""
        trainingFocus = try container.decodeIfPresent([String].self, forKey: .trainingFocus) ?? []
        wakeLocation = try container.decodeIfPresent(String.self, forKey: .wakeLocation) ?? ""
        wakeRoutines = try container.decodeIfPresent([String].self, forKey: .wakeRoutines) ?? []
        sleepRoutines = try container.decodeIfPresent([String].self, forKey: .sleepRoutines) ?? []
        trainingGoal = try container.decodeIfPresent(String.self, forKey: .trainingGoal) ?? ""
        idealTraits = try container.decodeIfPresent([String].self, forKey: .idealTraits) ?? []
    }
}

struct UserCredentials: Codable {
    let userId: String
    let displayName: String
    let email: String?
    // JWT Access Token (optional for backward compatibility)
    var jwtAccessToken: String?
    var accessTokenExpiresAt: Date?
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


