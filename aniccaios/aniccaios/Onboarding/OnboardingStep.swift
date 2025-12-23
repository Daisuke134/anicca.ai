import Foundation

enum OnboardingStep: Int {
    case welcome
    // v3: サインインを先に
    case account       // 1. Sign in with Apple
    case microphone    // 2. マイク許可
    case notifications // 3. 通知許可
    case alarmkit      // 4. AlarmKit許可
    case ideals        // 5. Ideal Self選択
    case struggles     // 6. Current Struggles選択
    case paywall       // 7. Paywall
}

extension OnboardingStep {
    /// 旧RawValue（v0.2系など）から v0.3 の enum へマップする。
    /// AppState はオンボーディング未完了時に `.welcome` から開始する仕様だが、
    /// `onboardingComplete==true` で残っている値を安全に解釈するために残す。
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        // 既に新enumの値が入っているケースはそのまま解釈
        if let step = OnboardingStep(rawValue: rawValue) {
            return step
        }
        
        // v0.2系→v3へのマイグレーション
        switch rawValue {
        case 0: return .welcome
        case 1: return .microphone
        case 2: return .notifications
        case 3: return .account
        case 4, 5, 6, 7, 8, 9: return .welcome
        default:
            return .welcome
        }
    }
}
