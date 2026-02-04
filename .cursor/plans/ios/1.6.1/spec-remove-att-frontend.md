# Spec: ATTフロントエンド削除（プライバシーラベル変更対応）

## 概要

App Store Guideline 5.1.2 リジェクト対応。ATTを実装する代わりに、App Store Connectのプライバシーラベルを変更して「トラッキング: No」とする。ATTのフロントエンド（オンボーディングステップ）を削除し、Singularコードは将来使用のため残す。

## 背景

- トライアル発生がほぼない現状で、詳細なCPA計測は不要
- SKAdNetworkでインストール計測は可能
- オンボーディング最適化が最優先、不要な画面は削除すべき
- Singularは将来使用の可能性があるためコードは残す

## 対応方針

### App Store Connect側（手動）

| 設定 | 変更 |
|------|------|
| ユーザID → トラッキング目的に使用 | **チェックを外す** |
| デバイスID → トラッキング目的に使用 | **チェックを外す** |

### コード側

| 変更内容 | 詳細 |
|----------|------|
| ATTフロントエンド削除 | ATTPermissionStepView、OnboardingStep.att削除 |
| Singularコード維持 | 初期化しないが、コードは残す |
| NSUserTrackingUsageDescription削除 | Info.plist、InfoPlist.strings（6言語） |

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `ATTPermissionStepView.swift` | **削除** | ファイルごと削除 |
| `OnboardingStep.swift` | 修正 | `.att`ケース削除、マイグレーション元に戻す |
| `OnboardingFlowView.swift` | 修正 | `.att`ケース削除、`.notifications`で完了 |
| `AppDelegate.swift` | 修正 | ATT関連ロジック削除、Singular初期化をコメントアウト |
| `Info.plist` | 修正 | `NSUserTrackingUsageDescription`削除 |
| `InfoPlist.strings`（6言語） | 修正 | ATT説明文削除 |
| `AnalyticsManager.swift` | 修正 | `.onboardingATTCompleted`削除 |

## 詳細パッチ

### 1. ATTPermissionStepView.swift

**削除**: `aniccaios/aniccaios/Onboarding/ATTPermissionStepView.swift`

### 2. OnboardingStep.swift

```swift
// 変更前
enum OnboardingStep: Int {
    case welcome       // 0
    case value         // 1
    case struggles     // 2
    case notifications // 3
    case att           // 4  ← 削除
}

// 変更後
enum OnboardingStep: Int {
    case welcome       // 0
    case value         // 1
    case struggles     // 2
    case notifications // 3
}
```

マイグレーション:
```swift
// 変更前
case 11, 12: return .att          // att, alarmkit → att

// 変更後
case 11, 12: return .notifications // att, alarmkit → notifications（元に戻す）
```

### 3. OnboardingFlowView.swift

```swift
// 削除: case .att の View switch
case .att:
    ATTPermissionStepView(next: advance)

// 変更: advance()
// 変更前
case .notifications:
    AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
    step = .att
case .att:
    AnalyticsManager.shared.track(.onboardingATTCompleted)
    completeOnboarding()
    return

// 変更後
case .notifications:
    AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
    completeOnboarding()
    return
```

### 4. AppDelegate.swift

```swift
// 削除するもの:
// - import AppTrackingTransparency
// - storedLaunchOptions プロパティ
// - singularInitialized プロパティ
// - NotificationCenter.default.addObserver (ATT関連)
// - handleATTCompleted メソッド
// - initializeSingular メソッド
// - ATTステータスチェックロジック

// Singular初期化をコメントアウト（将来用に残す）
// AnalyticsManager.shared.configure() は維持

// 変更後のdidFinishLaunchingWithOptions:
func application(_ application: UIApplication, 
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // ... 既存コード
    
    UNUserNotificationCenter.current().delegate = self
    NotificationScheduler.shared.registerCategories()
    SubscriptionManager.shared.configure()
    AnalyticsManager.shared.configure()
    
    // Singular: 将来ATT実装時に有効化
    // SingularManager.shared.configure(launchOptions: launchOptions)
    // SingularManager.shared.trackAppLaunch()

    // ... 残りの処理
}
```

### 5. Info.plist

削除:
```xml
<key>NSUserTrackingUsageDescription</key>
<string>We use this to measure how you discovered Anicca and improve your experience. Your data is never sold.</string>
```

### 6. InfoPlist.strings（6言語）

各言語ファイルから削除:
```
/* App Tracking Transparency permission description */
"NSUserTrackingUsageDescription" = "...";
```

### 7. AnalyticsManager.swift

削除:
```swift
case onboardingATTCompleted = "onboarding_att_completed"
```

## オンボーディングフロー（変更後）

```
welcome → value → struggles → notifications → paywall → main
```

4ステップ + Paywall

## App Reviewへの返信文

```
Thank you for your feedback regarding Guideline 5.1.2.

We have reviewed our data collection practices and determined that our app 
will NOT track users. We have updated our App Privacy Information in 
App Store Connect to remove tracking from User ID and Device ID.

Our app uses:
- Mixpanel for first-party analytics only (no IDFA access, no cross-app tracking)
- SKAdNetwork for aggregate attribution (no user consent required)

We do NOT:
- Link user data with third-party data for advertising
- Share collected data with data brokers
- Access IDFA or any device advertising identifier

Please proceed with the current submission (1.6.0) as a bug fix update, 
or let us know if you need us to resubmit.

Thank you.
```

## テスト計画

| テストケース | 期待結果 |
|--------------|----------|
| 新規インストール → オンボーディング完了 | ATTダイアログなし、4ステップで完了 |
| .notifications完了後 | 直接paywallへ遷移 |
| Mixpanel初期化 | 正常に動作（IDFA不使用） |
| Singular | 初期化されない（コメントアウト） |

## チェックリスト

### コード変更
- [ ] ATTPermissionStepView.swift 削除
- [ ] OnboardingStep.swift から .att 削除
- [ ] OnboardingFlowView.swift から .att 関連削除
- [ ] AppDelegate.swift から ATT関連ロジック削除、Singularコメントアウト
- [ ] Info.plist から NSUserTrackingUsageDescription 削除
- [ ] InfoPlist.strings（6言語）から ATT説明文削除
- [ ] AnalyticsManager.swift から .onboardingATTCompleted 削除

### App Store Connect（手動）
- [ ] ユーザID → トラッキング目的に使用 → チェックを外す
- [ ] デバイスID → トラッキング目的に使用 → チェックを外す
- [ ] App Reviewに返信

### 確認
- [ ] ビルド成功
- [ ] オンボーディングフロー確認（4ステップ）
- [ ] devにpush
