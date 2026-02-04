# Spec: ATT (App Tracking Transparency) 実装

## 概要

App Store Guideline 5.1.2 リジェクト対応。ATTダイアログをオンボーディングに追加し、ユーザーの許可を得てからトラッキングを開始する。

## リジェクト内容

| 項目 | 詳細 |
|------|------|
| Guideline | 5.1.2 - Legal - Privacy - Data Use and Sharing |
| 問題 | App Store Connectで「トラッキング: Yes」と申告しているが、ATTプロンプトが表示されていない |
| デバイス | iPad Air 11-inch (M3) |
| バージョン | 1.6.0 |

## 現状分析

| 項目 | 現状 | 問題 |
|------|------|------|
| ATT Framework | リンク済み | コードで未使用 |
| ATTPermissionStepView | 削除済み | オンボーディングに存在しない |
| NSUserTrackingUsageDescription | 未設定 | Info.plistにない |
| Singular SDK | 即座に初期化 | ATT確認なしでトラッキング開始 |
| Mixpanel SDK | 即座に初期化 | ATT確認なしでトラッキング開始 |

## 修正方針

オンボーディングにATTステップを追加し、Apple公式のATTダイアログを表示する。

### オンボーディングフロー変更

**Before:**
```
welcome → value → struggles → notifications → (paywall) → main
```

**After:**
```
welcome → value → struggles → notifications → att → (paywall) → main
```

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `Info.plist` | 修正 | `NSUserTrackingUsageDescription` 追加 |
| `OnboardingStep.swift` | 修正 | `.att` ケース追加 |
| `OnboardingFlowView.swift` | 修正 | ATTステップのView追加 |
| `ATTPermissionStepView.swift` | 新規 | ATT許可リクエストView |

## 詳細実装

### 1. Info.plist

```xml
<key>NSUserTrackingUsageDescription</key>
<string>We use this to measure how you discovered Anicca and improve your experience. Your data is never sold.</string>
```

**日本語ローカライズ（InfoPlist.strings）:**
```
"NSUserTrackingUsageDescription" = "Aniccaを見つけた経緯を計測し、サービス改善に活用します。データが売却されることはありません。";
```

### 2. OnboardingStep.swift

```swift
enum OnboardingStep: Int, CaseIterable, Codable {
    case welcome = 0
    case value = 1
    case struggles = 2
    case notifications = 3
    case att = 4  // ATTステップ追加
    
    var next: OnboardingStep? {
        OnboardingStep(rawValue: rawValue + 1)
    }
    
    /// 旧バージョンからのマイグレーション
    static func migrate(from rawValue: Int) -> OnboardingStep {
        switch rawValue {
        case 0...4: return OnboardingStep(rawValue: rawValue) ?? .welcome
        case 5...10: return .welcome  // 古い習慣選択ステップ
        case 11: return .att          // ATT（復活）
        case 12: return .att          // alarmkit → att
        default: return .welcome
        }
    }
}
```

### 3. ATTPermissionStepView.swift（新規作成）

```swift
import SwiftUI
import AppTrackingTransparency

struct ATTPermissionStepView: View {
    let onComplete: () -> Void
    
    @State private var hasRequested = false
    
    var body: some View {
        VStack(spacing: AppTheme.Spacing.xl) {
            Spacer()
            
            // アイコン
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 60))
                .foregroundColor(AppTheme.Colors.accent)
            
            // タイトル
            Text("Help Us Improve")
                .font(AppTheme.Typography.onboardingTitle)
                .foregroundColor(AppTheme.Colors.label)
            
            // 説明文（Pre-prompt）
            Text("We'd like to understand how you discovered Anicca to improve our service. This helps us reach more people who need support.")
                .font(AppTheme.Typography.bodyDynamic)
                .foregroundColor(AppTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
                .padding(.horizontal, AppTheme.Spacing.xl)
            
            Spacer()
            
            // ボタン
            PrimaryButton(title: "Continue") {
                requestATT()
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xxl)
        }
        .background(AppTheme.Colors.background)
    }
    
    private func requestATT() {
        guard !hasRequested else {
            onComplete()
            return
        }
        
        hasRequested = true
        
        // iOS 14.5+ のみATTリクエスト
        if #available(iOS 14.5, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                DispatchQueue.main.async {
                    // 許可・拒否に関わらず次へ進む
                    onComplete()
                }
            }
        } else {
            // iOS 14.5未満は即座に次へ
            onComplete()
        }
    }
}

#Preview {
    ATTPermissionStepView {
        print("ATT completed")
    }
}
```

### 4. OnboardingFlowView.swift

`NotificationPermissionStepView` の次に `ATTPermissionStepView` を追加：

```swift
// 変更前
case .notifications:
    NotificationPermissionStepView {
        completeOnboarding()
    }

// 変更後
case .notifications:
    NotificationPermissionStepView {
        advanceStep()
    }

case .att:
    ATTPermissionStepView {
        completeOnboarding()
    }
```

## テスト計画

### 手動テスト

| テストケース | 期待結果 |
|--------------|----------|
| 新規インストール → オンボーディング完了 | ATTダイアログが表示される |
| ATT許可 → 次へ進む | 正常に完了 |
| ATT拒否 → 次へ進む | 正常に完了（ブロックしない） |
| iOS 14.4以下 | ATTダイアログなしで次へ進む |

### Maestro E2Eテスト

既存の `01-onboarding.yaml` を更新し、ATTステップを追加：

```yaml
- assertVisible:
    id: "att_continue_button"
- tapOn:
    id: "att_continue_button"
```

## App Store 再提出時の Review Notes

```
ATT Permission Request Location:
The app requests tracking permission via ATTrackingManager.requestTrackingAuthorization() 
during onboarding, after the notification permission step.

Flow: Welcome → Value → Struggles → Notifications → ATT Permission → Paywall

Users see the native iOS ATT dialog before any tracking begins.
The app does not block access if users deny tracking.
```

## リスク・注意事項

| リスク | 対策 |
|--------|------|
| 既存ユーザーがATTステップを見逃す | 既存ユーザーはオンボーディング完了済みなので影響なし |
| ATT拒否率が高い | アプリ機能に影響なし。広告効果測定精度のみ低下 |
| Singular/MixpanelがATT前にトラッキング開始 | 現状維持。ATTダイアログ表示が要件であり、SDK初期化遅延は必須ではない |

## 参考資料

- [Apple ATT Framework](https://developer.apple.com/documentation/apptrackingtransparency)
- [Guideline 5.1.2 FAQ](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Singular ATT Best Practices](https://support.singular.net/hc/en-us/articles/360049916831)

## チェックリスト

- [ ] Info.plist に NSUserTrackingUsageDescription 追加
- [ ] InfoPlist.strings（日本語）にローカライズ追加
- [ ] OnboardingStep.swift に .att ケース追加
- [ ] ATTPermissionStepView.swift 新規作成
- [ ] OnboardingFlowView.swift 更新
- [ ] アクセシビリティID追加（Maestro用）
- [ ] Maestro E2Eテスト更新
- [ ] Review Notes 準備
