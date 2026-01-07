まず現在のコードを確認します。

[3 tools called]

既存のIdealsStepViewとStrugglesStepViewも確認します（参考のため）。

[1 tool called]

---

# オンボーディング改善 実装仕様書

## 1. 概要

### 1.1 目的
Jake Mor #28-30とLife Reset参考に、オンボーディングフローを最適化し、離脱率を下げてPaywallコンバージョンを向上させる。

### 1.2 主な変更点
- 新規ステップ追加: source, gender, age
- habitSetupステップ復活
- 評価リクエスト追加（システムダイアログ）
- ステップ順序変更

---

## 2. 評価リクエストについて

**評価リクエストは画面ではなくシステムダイアログ。**

スクショの通り、`SKStoreReviewController.requestReview()` を呼び出すと、iOSがシステムダイアログを表示する。

**特徴**:
- 専用画面は**不要**
- 適切なタイミングで `requestReview()` を呼ぶだけ
- Appleが表示頻度を制御（年3回まで）
- ユーザーは「Not Now」でスキップ可能

**実装場所**: habitSetup完了後、notificationsステップへ進む前に呼び出す

---

## 3. 最終オンボーディングフロー

### AS-IS（現在）

| # | ステップ | rawValue |
|---|----------|----------|
| 0 | welcome | 0 |
| 1 | value | 1 |
| 2 | account | 2 |
| 3 | ideals | 3 |
| 4 | struggles | 4 |
| 5 | notifications | 5 |
| 6 | alarmkit | 6 |
| → | Paywall | - |

### TO-BE（改善後）


#	ステップ	rawValue	状態
0	welcome	0	既存
1	account	1	既存
2	value	2	既存
3	source	3	新規
4	name	4	復活
5	gender	5	新規
6	age	6	新規
7	ideals	7	既存
8	struggles	8	既存
9	habitSetup	9	復活
10	notifications	10	既存
11	alarmkit	11	既存
→	Paywall	-	既存ー＞ベター！！

**注**: habitSetup完了後、notificationsへ進む前に `SKStoreReviewController.requestReview()` を呼び出す

---



## 4. 修正後のユーザー体験

ユーザーがアプリを初めて起動すると：

1. **Welcome画面** - Aniccaへようこそ
2. **Sign in with Apple** - ワンタップでサインイン
3. **Value画面** - Aniccaでできること
4. **Source質問** - 「どこでAniccaを知りましたか？」（Instagram/TikTok/YouTube等から選択）
5. **Gender質問** - 「あなたの性別は？」（Male/Female/Other/回答しない）
6. **Age質問** - 「あなたの年齢は？」（13-17/18-24/25-34等から選択）
7. **Ideals選択** - 理想の自分を選択（Kind/Confident/Healthy等）
8. **Struggles選択** - 現在の課題を選択
9. **習慣設定** - 起床・トレーニング・就寝の時間を設定
10. **評価リクエスト** - システムダイアログで「Enjoying Anicca?」と表示
11. **通知許可** - 通知を許可
12. **アラーム許可** - アラームを許可（iOS 26+）
13. **Paywall** - サブスクリプション購入画面

**改善点**:
- 選択式質問が増えサンクコスト効果が向上
- 習慣設定でコア機能を体験
- 評価リクエストでApp Storeレビュー獲得
- 権限リクエストはPaywall直前（離脱してもPaywallは見せる）

---

## タイトル変更

### 英語版
```
【AS-IS】
"onboarding_profile_title" = "Tell us your name";

【TO-BE】
"onboarding_profile_title" = "Pick the name that suits you best";
```

### 日本語版
```
【AS-IS】
"onboarding_profile_title" = "お名前を教えてください";

【TO-BE】
"onboarding_profile_title" = "あなたに合った名前を選んでください";
```

---

## 完全なTO-BE順番

| # | ステップ | rawValue | 状態 |
|---|----------|----------|------|
| 0 | welcome | 0 | 既存 |
| 1 | account | 1 | 既存 |
| 2 | value | 2 | 既存 |
| 3 | **source** | 3 | **新規** |
| 4 | **name** | 4 | **復活** |
| 5 | **gender** | 5 | **新規** |
| 6 | **age** | 6 | **新規** |
| 7 | ideals | 7 | 既存 |
| 8 | struggles | 8 | 既存 |
| 9 | **habitSetup** | 9 | **復活** |
| 10 | notifications | 10 | 既存 |
| 11 | alarmkit | 11 | 既存 |
| → | Paywall | - | 既存 |

---

## 完全なパッチ

### 1. Localizable.strings（英語）

**ファイル**: `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`

```diff
- "onboarding_profile_title" = "Tell us your name";
+ "onboarding_profile_title" = "Pick the name that suits you best";
```

---

### 2. Localizable.strings（日本語）

**ファイル**: `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

```diff
- "onboarding_profile_title" = "お名前を教えてください";
+ "onboarding_profile_title" = "あなたに合った名前を選んでください";
```

---

### 3. OnboardingStep.swift

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingStep.swift`

```swift
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
    static func migratedFromLegacyRawValue(_ rawValue: Int) -> OnboardingStep {
        if let step = OnboardingStep(rawValue: rawValue) {
            return step
        }
        return .welcome
    }
}
```

---

### 4. OnboardingFlowView.swift

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

```swift
import SwiftUI
import StoreKit

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step: OnboardingStep = .welcome

    var body: some View {
        ZStack {
            AppBackground()
            Group {
                switch step {
                case .welcome:
                    WelcomeStepView(next: advance)
                case .account:
                    AuthenticationStepView(next: advance)
                case .value:
                    ValueStepView(next: advance)
                case .source:
                    SourceStepView(next: advance)
                case .name:
                    ProfileInfoStepView(next: advance)
                case .gender:
                    GenderStepView(next: advance)
                case .age:
                    AgeStepView(next: advance)
                case .ideals:
                    IdealsStepView(next: advance)
                case .struggles:
                    StrugglesStepView(next: advance)
                case .habitSetup:
                    HabitSetupStepView(next: advance)
                case .notifications:
                    NotificationPermissionStepView(next: advance)
                case .alarmkit:
                    AlarmKitPermissionStepView(next: advance)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            let alarmKitSupported: Bool = {
                #if canImport(AlarmKit)
                if #available(iOS 26.0, *) { return true }
                #endif
                return false
            }()
            if appState.onboardingStep == .alarmkit && !alarmKitSupported {
                step = .notifications
                appState.setOnboardingStep(.notifications)
            } else {
                step = appState.onboardingStep
            }
            
            if step == .welcome {
                AnalyticsManager.shared.track(.onboardingStarted)
            }
            
            Task {
                await SubscriptionManager.shared.refreshOfferings()
            }
        }
    }

    private func advance() {
        AnalyticsManager.shared.trackOnboardingStep(String(describing: step))
        
        switch step {
        case .welcome:
            step = .account
        case .account:
            step = .value
        case .value:
            step = .source
        case .source:
            step = .name
        case .name:
            step = .gender
        case .gender:
            step = .age
        case .age:
            step = .ideals
        case .ideals:
            step = .struggles
        case .struggles:
            step = .habitSetup
        case .habitSetup:
            // 評価リクエストを表示（システムダイアログ）
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            }
            step = .notifications
        case .notifications:
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                step = .alarmkit
            } else {
                completeOnboarding()
                return
            }
            #else
            completeOnboarding()
            return
            #endif
        case .alarmkit:
            completeOnboarding()
            return
        }
        appState.setOnboardingStep(step)
    }
    
    private func completeOnboarding() {
        AnalyticsManager.shared.track(.onboardingCompleted)
        appState.markOnboardingComplete()
        SuperwallManager.shared.register(placement: SuperwallPlacement.onboardingComplete.rawValue)
    }
}
```

## 5. 新規ファイル

### 5.1 SourceStepView.swift

```swift
import SwiftUI

struct SourceStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    
    private let options = [
        "instagram", "tiktok", "youtube", "twitter",
        "facebook", "friends", "app_store", "other"
    ]
    
    @State private var selected: String?
    
    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_source_title"))
                .font(.system(size: 36, weight: .bold))
                .fontWeight(.heavy)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
                .padding(.horizontal, 24)
            
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(options, id: \.self) { option in
                        optionButton(option)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
            }
            
            Spacer()
            
            VStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_next"),
                    isEnabled: selected != nil,
                    style: .large
                ) {
                    if let selected = selected {
                        appState.updateAcquisitionSource(selected)
                        AnalyticsManager.shared.setUserProperty("acquisition_source", value: selected)
                    }
                    next()
                }
                
                Button(String(localized: "common_skip")) {
                    next()
                }
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
    }
    
    @ViewBuilder
    private func optionButton(_ option: String) -> some View {
        let isSelected = selected == option
        Button {
            selected = option
        } label: {
            HStack {
                Text(NSLocalizedString("source_\(option)", comment: ""))
                    .font(.system(size: 16, weight: .medium))
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}
```

---

### 5.2 GenderStepView.swift

```swift
import SwiftUI

struct GenderStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    
    private let options = ["male", "female", "other", "prefer_not_to_say"]
    
    @State private var selected: String?
    
    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_gender_title"))
                .font(.system(size: 36, weight: .bold))
                .fontWeight(.heavy)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
                .padding(.horizontal, 24)
            
            VStack(spacing: 12) {
                ForEach(options, id: \.self) { option in
                    optionButton(option)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            
            Spacer()
            
            VStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_next"),
                    isEnabled: selected != nil,
                    style: .large
                ) {
                    if let selected = selected {
                        appState.updateGender(selected)
                        AnalyticsManager.shared.setUserProperty("gender", value: selected)
                    }
                    next()
                }
                
                Button(String(localized: "common_skip")) {
                    next()
                }
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
    }
    
    @ViewBuilder
    private func optionButton(_ option: String) -> some View {
        let isSelected = selected == option
        Button {
            selected = option
        } label: {
            HStack {
                Text(NSLocalizedString("gender_\(option)", comment: ""))
                    .font(.system(size: 16, weight: .medium))
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}
```

---

### 5.3 AgeStepView.swift

```swift
import SwiftUI

struct AgeStepView: View {
    let next: () -> Void
    @EnvironmentObject private var appState: AppState
    
    private let options = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"]
    
    @State private var selected: String?
    
    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "onboarding_age_title"))
                .font(.system(size: 36, weight: .bold))
                .fontWeight(.heavy)
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.top, 40)
                .padding(.horizontal, 24)
            
            VStack(spacing: 12) {
                ForEach(options, id: \.self) { option in
                    optionButton(option)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            
            Spacer()
            
            VStack(spacing: 12) {
                PrimaryButton(
                    title: String(localized: "common_next"),
                    isEnabled: selected != nil,
                    style: .large
                ) {
                    if let selected = selected {
                        appState.updateAgeRange(selected)
                        AnalyticsManager.shared.setUserProperty("age_range", value: selected)
                    }
                    next()
                }
                
                Button(String(localized: "common_skip")) {
                    next()
                }
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 64)
        }
        .background(AppBackground())
    }
    
    @ViewBuilder
    private func optionButton(_ option: String) -> some View {
        let isSelected = selected == option
        Button {
            selected = option
        } label: {
            HStack {
                Text(option)
                    .font(.system(size: 16, weight: .medium))
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(isSelected ? AppTheme.Colors.buttonSelected : AppTheme.Colors.buttonUnselected)
            .foregroundStyle(isSelected ? AppTheme.Colors.buttonTextSelected : AppTheme.Colors.label)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}
```

---

## 6. 既存ファイル修正

### 6.1 OnboardingStep.swift

**AS-IS:**
```swift
enum OnboardingStep: Int {
    case welcome
    case value         // 1. What Anicca Can Do
    case account       // 2. Sign in with Apple
    case ideals        // 3. Ideal Self選択
    case struggles     // 4. Current Struggles選択
    case notifications // 5. 通知許可
    case alarmkit      // 6. アラーム許可（最終ステップ）
}
```

**TO-BE:**
```swift
enum OnboardingStep: Int {
    case welcome       // 0
    case account       // 1. Sign in with Apple
    case value         // 2. What Anicca Can Do
    case source        // 3. 流入元
    case gender        // 4. 性別
    case age           // 5. 年齢
    case ideals        // 6. Ideal Self選択
    case struggles     // 7. Current Struggles選択
    case habitSetup    // 8. 習慣設定
    case notifications // 9. 通知許可
    case alarmkit      // 10. アラーム許可（最終ステップ）
}
```

---

### 6.2 OnboardingFlowView.swift

**AS-IS:**
```swift
switch step {
case .welcome:
    WelcomeStepView(next: advance)
case .value:
    ValueStepView(next: advance)
case .account:
    AuthenticationStepView(next: advance)
case .ideals:
    IdealsStepView(next: advance)
case .struggles:
    StrugglesStepView(next: advance)
case .notifications:
    NotificationPermissionStepView(next: advance)
case .alarmkit:
    AlarmKitPermissionStepView(next: advance)
}
```

**TO-BE:**
```swift
import StoreKit  // 追加

switch step {
case .welcome:
    WelcomeStepView(next: advance)
case .account:
    AuthenticationStepView(next: advance)
case .value:
    ValueStepView(next: advance)
case .source:
    SourceStepView(next: advance)
case .gender:
    GenderStepView(next: advance)
case .age:
    AgeStepView(next: advance)
case .ideals:
    IdealsStepView(next: advance)
case .struggles:
    StrugglesStepView(next: advance)
case .habitSetup:
    HabitSetupStepView(next: advance)
case .notifications:
    NotificationPermissionStepView(next: advance)
case .alarmkit:
    AlarmKitPermissionStepView(next: advance)
}
```

**advance()関数も更新:**

```swift
private func advance() {
    AnalyticsManager.shared.trackOnboardingStep(String(describing: step))
    
    switch step {
    case .welcome:
        step = .account
    case .account:
        step = .value
    case .value:
        step = .source
    case .source:
        step = .gender
    case .gender:
        step = .age
    case .age:
        step = .ideals
    case .ideals:
        step = .struggles
    case .struggles:
        step = .habitSetup
    case .habitSetup:
        // 評価リクエストを表示（システムダイアログ）
        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
            SKStoreReviewController.requestReview(in: scene)
        }
        step = .notifications
    case .notifications:
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            step = .alarmkit
        } else {
            completeOnboarding()
            return
        }
        #else
        completeOnboarding()
        return
        #endif
    case .alarmkit:
        completeOnboarding()
        return
    }
    appState.setOnboardingStep(step)
}

private func completeOnboarding() {
    AnalyticsManager.shared.track(.onboardingCompleted)
    appState.markOnboardingComplete()
    SuperwallManager.shared.register(placement: SuperwallPlacement.onboardingComplete.rawValue)
}
```

---

### 6.3 AppState.swift に追加

```swift
// MARK: - Demographics (新規)

func updateAcquisitionSource(_ source: String) {
    userProfile.acquisitionSource = source
    saveUserProfile()
}

func updateGender(_ gender: String) {
    userProfile.gender = gender
    saveUserProfile()
}

func updateAgeRange(_ ageRange: String) {
    userProfile.ageRange = ageRange
    saveUserProfile()
}
```

---

### 6.4 UserProfile に追加

```swift
struct UserProfile: Codable {
    // 既存プロパティ...
    
    // 新規追加
    var acquisitionSource: String?
    var gender: String?
    var ageRange: String?
}
```

---

### 6.5 Localizable.strings に追加

**英語:**
```
"onboarding_source_title" = "Where did you hear about us?";
"source_instagram" = "Instagram";
"source_tiktok" = "TikTok";
"source_youtube" = "YouTube";
"source_twitter" = "Twitter / X";
"source_facebook" = "Facebook";
"source_friends" = "Friends";
"source_app_store" = "App Store Search";
"source_other" = "Other";

"onboarding_gender_title" = "What's your gender?";
"gender_male" = "Male";
"gender_female" = "Female";
"gender_other" = "Other";
"gender_prefer_not_to_say" = "Prefer not to answer";

"onboarding_age_title" = "How old are you?";
```

**日本語:**
```
"onboarding_source_title" = "どこでAniccaを知りましたか？";
"source_instagram" = "Instagram";
"source_tiktok" = "TikTok";
"source_youtube" = "YouTube";
"source_twitter" = "Twitter / X";
"source_facebook" = "Facebook";
"source_friends" = "友人から";
"source_app_store" = "App Storeで検索";
"source_other" = "その他";

"onboarding_gender_title" = "あなたの性別は？";
"gender_male" = "男性";
"gender_female" = "女性";
"gender_other" = "その他";
"gender_prefer_not_to_say" = "回答しない";

"onboarding_age_title" = "あなたの年齢は？";
```

---

## 7. 実装Todoリスト

### 今すぐやること

| # | タスク | ファイル |
|---|--------|----------|
| 1 | OnboardingStep enum更新 | `OnboardingStep.swift` |
| 2 | SourceStepView作成 | `SourceStepView.swift` |
| 3 | GenderStepView作成 | `GenderStepView.swift` |
| 4 | AgeStepView作成 | `AgeStepView.swift` |
| 5 | OnboardingFlowView更新 | `OnboardingFlowView.swift` |
| 6 | HabitSetupStepViewをフローに追加 | `OnboardingFlowView.swift` |
| 7 | SKStoreReviewController呼び出し追加 | `OnboardingFlowView.swift` |
| 8 | UserProfileに新規プロパティ追加 | `UserProfile.swift` |
| 9 | AppStateに新規メソッド追加 | `AppState.swift` |
| 10 | Localizable.stringsに翻訳追加 | 各言語ファイル |

### 完了後のテスト

| # | タスク |
|---|--------|
| 1 | 全ステップが正しく表示されるか確認 |
| 2 | 評価ダイアログが表示されるか確認 |
| 3 | Mixpanelでステップイベントが送信されるか確認 |
| 4 | Paywallが最後に表示されるか確認 |

---

**この仕様書で実装を進めていいですか？**