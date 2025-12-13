import Foundation

enum OnboardingStep: Int {
    case welcome
    case ideals
    case struggles
    case value
    case account
    case microphone
    case notifications
    case habitSetup
    case habitWakeLocation
    case habitSleepLocation
    case habitTrainingFocus
    case paywall
    case completion
}

extension OnboardingStep {
    /// 旧RawValue（v0.2系など）から v0.3 の enum へマップする。
    /// AppState はオンボーディング未完了時に `.welcome` から開始する仕様だが、
    /// `onboardingComplete==true` で残っている値を安全に解釈するために残す。
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        // 既に v0.3 の値が入っているケース（>=10など）はそのまま解釈する
        if rawValue >= 10, let step = OnboardingStep(rawValue: rawValue) {
            return step
        }
        
        // v0.2系: 0..9 を明示的にマップ（rawValue=4 が過去に profile を指していた実装もあったため、habitSetupへ寄せる）
        switch rawValue {
        case 0: return .welcome
        case 1: return .microphone
        case 2: return .notifications
        case 3: return .account
        case 4: return .habitSetup
        case 5: return .habitWakeLocation
        case 6: return .habitSleepLocation
        case 7: return .habitTrainingFocus
        case 8: return .paywall
        case 9: return .completion
        default:
            return .welcome
        }
    }
}
