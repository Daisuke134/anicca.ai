import Foundation

enum OnboardingStep: Int {
    case welcome       // 0
    case struggles     // 1  (value 削除、rawValue 変更)
    case liveDemo      // 2  (新規追加)
    case notifications // 3
}

extension OnboardingStep {
    /// 旧RawValue（v1.6.1以前）から現在の enum へマップする。
    ///
    /// ★ 呼び出し側（AppState）でバージョン判定を行い、この関数は legacy 値のみに適用する。
    /// v1.6.1 以降で保存された値は `OnboardingStep(rawValue:)` を直接使用する。
    ///
    /// ## rawValue履歴
    /// - v0.4:   0=welcome, 4=name, 11=att
    /// - v1.6.0: 0=welcome, 1=value, 2=struggles, 3=notifications, 4=att
    /// - v1.6.1: 0=welcome, 1=struggles, 2=liveDemo, 3=notifications（value削除、ATT削除）
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        // v1.6.0以前からの移行マッピング
        // 保存された rawValue が現在のEnumに存在しない場合のフォールバック
        switch rawValue {
        case 0: return .welcome
        case 1: return .struggles       // 旧 value/account → struggles（value 削除）
        case 2: return .struggles       // 旧 struggles → struggles（legacy only）
        case 3: return .notifications   // v1.6.0 の .notifications=3 を保護（現行ユーザー優先）
        case 5, 6, 7, 8: return .struggles  // 旧 name/gender/age/ideals → struggles（未実施防止）
        case 4: return .notifications   // v1.6.0の.att → notifications（ATT削除後）
        case 9, 10: return .notifications // 旧 habitSetup/notifications → notifications
        case 11, 12: return .notifications // 旧 att/alarmkit → notifications
        default:
            return .welcome
        }
    }
}
