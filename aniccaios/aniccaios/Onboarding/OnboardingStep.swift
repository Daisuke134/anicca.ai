import Foundation

enum OnboardingStep: Int {
    case welcome       // 0
    case account       // 1. Sign in with Apple
    case value         // 2. What Anicca Can Do
    case source        // 3. 流入元
    case name          // 4. 名前入力
    case gender        // 5. 性別
    case age           // 6. 年齢
    case ideals        // 7. Ideal Self選択
    case struggles     // 8. Current Struggles選択
    case habitSetup    // 9. 習慣設定
    case notifications // 10. 通知許可
    case alarmkit      // 11. アラーム許可（最終ステップ）
}

extension OnboardingStep {
    /// 旧RawValue（v0.2系など）から v0.4 の enum へマップする。
    /// AppState はオンボーディング未完了時に `.welcome` から開始する仕様だが、
    /// `onboardingComplete==true` で残っている値を安全に解釈するために残す。
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        // 既に新enumの値が入っているケースはそのまま解釈
        if let step = OnboardingStep(rawValue: rawValue) {
            return step
        }
        
        // v0.3系→v0.4へのマイグレーション
        // v0.3の順番: 0=welcome, 1=value, 2=account, 3=ideals, 4=struggles, 5=notifications, 6=alarmkit
        // v0.4の順番: 0=welcome, 1=account, 2=value, 3=source, 4=name, 5=gender, 6=age,
        //            7=ideals, 8=struggles, 9=habitSetup, 10=notifications, 11=alarmkit
        switch rawValue {
        case 0: return .welcome
        case 1: return .value       // v0.3のvalue
        case 2: return .account     // v0.3のaccount
        case 3: return .ideals      // v0.3のideals
        case 4: return .struggles   // v0.3のstruggles
        case 5: return .notifications // v0.3のnotifications
        case 6: return .alarmkit    // v0.3のalarmkit
        default:
            return .welcome
        }
    }
}
