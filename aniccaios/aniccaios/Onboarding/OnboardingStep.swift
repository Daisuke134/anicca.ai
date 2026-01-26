import Foundation

enum OnboardingStep: Int {
    case welcome       // 0
    case value         // 1
    case struggles     // 2
    case notifications // 3
}

extension OnboardingStep {
    /// 旧RawValue（v0.2〜v0.5系）から現在の enum へマップする。
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        if let step = OnboardingStep(rawValue: rawValue) {
            return step
        }

        // v0.5以前からのマイグレーション（旧ステップを現在のフローにマップ）
        // 旧v0.4: 0=welcome, 1=account, 2=value, 3=source, 4=name, 5=gender, 6=age,
        //         7=ideals, 8=struggles, 9=habitSetup, 10=notifications, 11=att, 12=alarmkit
        switch rawValue {
        case 0: return .welcome
        case 1, 2: return .value          // account, value → value
        case 3, 4, 5, 6, 7: return .struggles  // source〜ideals → struggles
        case 8: return .struggles
        case 9, 10: return .notifications // habitSetup, notifications → notifications
        case 11, 12: return .notifications // att, alarmkit → notifications (ATT step removed)
        default:
            return .welcome
        }
    }
}
