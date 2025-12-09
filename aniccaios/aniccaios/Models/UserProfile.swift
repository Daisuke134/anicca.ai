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
    var problems: [String]
    
    // AlarmKit設定（各習慣ごと）
    var useAlarmKitForWake: Bool
    var useAlarmKitForTraining: Bool
    var useAlarmKitForBedtime: Bool
    var useAlarmKitForCustom: Bool
    
    // Stickyモード（全習慣共通）
    var stickyModeEnabled: Bool
    
    init(
        displayName: String = "",
        preferredLanguage: LanguagePreference = LanguagePreference.detectDefault(),
        sleepLocation: String = "",
        trainingFocus: [String] = [],
        wakeLocation: String = "",
        wakeRoutines: [String] = [],
        sleepRoutines: [String] = [],
        trainingGoal: String = "",
        idealTraits: [String] = [],
        problems: [String] = [],
        useAlarmKitForWake: Bool = true,
        useAlarmKitForTraining: Bool = false,
        useAlarmKitForBedtime: Bool = false,
        useAlarmKitForCustom: Bool = false,
        stickyModeEnabled: Bool = true
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
        self.problems = problems
        self.useAlarmKitForWake = useAlarmKitForWake
        self.useAlarmKitForTraining = useAlarmKitForTraining
        self.useAlarmKitForBedtime = useAlarmKitForBedtime
        self.useAlarmKitForCustom = useAlarmKitForCustom
        self.stickyModeEnabled = stickyModeEnabled
    }
    
    // 既存データとの互換性のためのカスタムデコーディング
    enum CodingKeys: String, CodingKey {
        case displayName, preferredLanguage, sleepLocation, trainingFocus
        case wakeLocation, wakeRoutines, sleepRoutines, trainingGoal, idealTraits
        case problems
        case useAlarmKitForWake, useAlarmKitForTraining, useAlarmKitForBedtime, useAlarmKitForCustom
        case stickyModeEnabled, wakeStickyModeEnabled // 後方互換用
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
        problems = try container.decodeIfPresent([String].self, forKey: .problems) ?? []
        
        // AlarmKit設定（各習慣ごと）
        useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? true
        useAlarmKitForTraining = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForTraining) ?? false
        useAlarmKitForBedtime = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForBedtime) ?? false
        useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? false
        
        // カスタム習慣のAlarmKitは常にOFFから始める（既存ユーザーも含めてリセット）
        useAlarmKitForCustom = false
        
        // Stickyモード（後方互換: wakeStickyModeEnabled も読み取る）
        if let sticky = try container.decodeIfPresent(Bool.self, forKey: .stickyModeEnabled) {
            stickyModeEnabled = sticky
        } else if let oldSticky = try container.decodeIfPresent(Bool.self, forKey: .wakeStickyModeEnabled) {
            stickyModeEnabled = oldSticky
        } else {
            stickyModeEnabled = true
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(displayName, forKey: .displayName)
        try container.encode(preferredLanguage, forKey: .preferredLanguage)
        try container.encode(sleepLocation, forKey: .sleepLocation)
        try container.encode(trainingFocus, forKey: .trainingFocus)
        try container.encode(wakeLocation, forKey: .wakeLocation)
        try container.encode(wakeRoutines, forKey: .wakeRoutines)
        try container.encode(sleepRoutines, forKey: .sleepRoutines)
        try container.encode(trainingGoal, forKey: .trainingGoal)
        try container.encode(idealTraits, forKey: .idealTraits)
        try container.encode(problems, forKey: .problems)
        try container.encode(useAlarmKitForWake, forKey: .useAlarmKitForWake)
        try container.encode(useAlarmKitForTraining, forKey: .useAlarmKitForTraining)
        try container.encode(useAlarmKitForBedtime, forKey: .useAlarmKitForBedtime)
        try container.encode(useAlarmKitForCustom, forKey: .useAlarmKitForCustom)
        try container.encode(stickyModeEnabled, forKey: .stickyModeEnabled)
        // wakeStickyModeEnabled は後方互換のデコード用のみなのでエンコードしない
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


