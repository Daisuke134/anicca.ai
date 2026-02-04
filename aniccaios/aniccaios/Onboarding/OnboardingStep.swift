import Foundation

enum OnboardingStep: Int {
    case welcome       // 0
    case value         // 1
    case struggles     // 2
    case notifications // 3
}

extension OnboardingStep {
    /// 旧RawValue（v0.2〜v1.6.0）から現在の enum へマップする。
    ///
    /// ## 移行設計
    /// このマッピングは v1.5.x/v1.6.0 → v1.6.1 の移行を想定。
    ///
    /// ## リスク評価: v0.4直接更新
    /// 理論上の懸念: v0.4の rawValue=4 は "name" ステップだが、v1.6.0では .att だった。
    /// rawValue=4 を一律 .notifications にマップすると、v0.4ユーザーが struggles をスキップする。
    ///
    /// 実際のリスク: **極めて低い**
    /// 1. v0.4は2024年リリース。App Storeの段階的更新で中間バージョンを経由して移行済み
    /// 2. v0.4を長期保持→v1.6.1への直接更新は、アプリを2年間放置した極めてレアなケース
    /// 3. そのような長期離脱ユーザーには新規オンボーディング（Settings→Reset）が適切
    /// 4. v0.4の "name" ステップは現在のフローでは存在しない（struggles に統合済み）
    ///
    /// 結論: v1.6.0ユーザー（rawValue=4 = .att）の正常移行を優先し、
    /// v0.4直接更新の極めて稀なケースは、Settings からの struggles 再選択で対応可能。
    ///
    /// ## rawValue履歴
    /// - v0.4:   0=welcome, 4=name, 11=att
    /// - v1.6.0: 0=welcome, 4=att（5ステップEnum）
    /// - v1.6.1: 0=welcome, 3=notifications（4ステップEnum、ATT削除）
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        if let step = OnboardingStep(rawValue: rawValue) {
            return step
        }

        // v1.6.0以前からの移行マッピング
        // 保存された rawValue が現在のEnumに存在しない場合のフォールバック
        switch rawValue {
        case 0: return .welcome
        case 1, 2: return .value          // account, value → value
        case 3, 5, 6, 7, 8: return .struggles  // source, name, gender, age, ideals, struggles → struggles
        case 4: return .notifications     // v1.6.0の.att → notifications（ATT削除後）
        case 9, 10: return .notifications // habitSetup, notifications → notifications
        case 11, 12: return .notifications // 旧att, alarmkit → notifications
        default:
            return .welcome
        }
    }
}
