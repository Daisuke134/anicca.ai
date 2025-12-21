import Foundation

enum OnboardingStep: Int {
    case welcome
    case value       // 2番目に移動
    case ideals      // 3番目
    case struggles   // 4番目
    case account
    case microphone
    case notifications
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
        
        // v0.2系: 0..9 を明示的にマップ（v3ではHabit/Paywall/All setは廃止）
        switch rawValue {
        case 0: return .welcome
        case 1: return .microphone
        case 2: return .notifications
        case 3: return .account
        // 旧: habit/paywall/completion 相当は全部welcomeへ戻す
        case 4, 5, 6, 7, 8, 9:
            return .welcome
        default:
            return .welcome
        }
    }
}
