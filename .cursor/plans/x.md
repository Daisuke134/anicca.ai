---

# 実装仕様書: オンボーディング簡略化 + 匿名ID移行

**作成日**: 2026-01-06  
**レビュー対象**: 他のエージェント  
**目的**: 抜け漏れなく全コンテキストを共有し、実装パッチをレビューする

---

## 目次

1. [背景と目的](#1-背景と目的)
2. [現状の問題点](#2-現状の問題点)
3. [修正項目一覧](#3-修正項目一覧)
4. [パッチ詳細](#4-パッチ詳細)
5. [既存ユーザーへの影響](#5-既存ユーザーへの影響)
6. [Mixpanel設定変更](#6-mixpanel設定変更)
7. [テスト項目](#7-テスト項目)

---

## 1. 背景と目的

### 1.1 やりたいこと

- **Paywall到達率を上げる**: オンボーディングが長すぎて途中離脱が多い
- **コンバージョン率を上げる**: Apple Sign Inで離脱するユーザーを減らす
- **バグ修正**: AlarmKitのデフォルト値がサーバー側で間違っている

### 1.2 Jake Morの推奨事項（参考）

> Paywall到達までの障壁を減らす。名前、年齢、メール、電話番号、アプリ権限はPaywall表示の後に移動。

---

## 2. 現状の問題点

### 2.1 オンボーディングが長すぎる

**現在のフロー（12ステップ）**:

```
1. Welcome
2. Account (Sign in with Apple)  ← 離脱ポイント
3. Value
4. Source (どこで知った？)
5. Name (名前入力)
6. Gender (性別)
7. Age (年齢)
8. Ideals (理想の自分)
9. Struggles (現在の課題)
10. HabitSetup (習慣設定)
11. Notifications (通知許可)
12. Alarmkit (アラーム許可)  ← 2つ連続で権限要求
→ Paywall表示
```

**問題**:
- 12ステップは長すぎる
- Sign in with Appleで離脱する
- 通知許可とアラーム許可が連続で来る

### 2.2 AlarmKitのデフォルト値が間違っている

**iOS側** (`UserProfile.swift` Line 122-125):
```swift
useAlarmKitForWake: Bool = false,  // デフォルトOFF
useAlarmKitForTraining: Bool = false,
useAlarmKitForBedtime: Bool = false,
useAlarmKitForCustom: Bool = false
```

**バックエンド側** (`profile.js` Line 101-104, 143-146):
```javascript
// プロフィールがない場合のデフォルト値
useAlarmKitForWake: true,   // ← 間違い！デフォルトTRUE
useAlarmKitForTraining: true,
useAlarmKitForBedtime: true,
useAlarmKitForCustom: true,

// プロフィールがある場合のデフォルト値
useAlarmKitForWake: profile.useAlarmKitForWake ?? true,  // ← 間違い！
```

**影響**: サーバーから復元したユーザーは、意図せずAlarmKitがONになる。

### 2.3 Apple Sign Inの必要性

**現状**: オンボーディングでSign in with Appleを必須としている

**問題**: 
- RevenueCatは匿名IDで課金できる（公式確認済み）
- Sign in with Appleで離脱するユーザーがいる

---

## 3. 修正項目一覧

| # | 修正項目 | ファイル | 重要度 |
|---|---------|---------|--------|
| 1 | オンボーディングフロー簡略化 | `OnboardingFlowView.swift` | 高 |
| 2 | Apple Sign In削除（新規ユーザー） | `OnboardingFlowView.swift`, `AppState.swift`, `SubscriptionManager.swift` | 高 |
| 3 | AlarmKitデフォルト値修正 | `profile.js` | 高 |
| 4 | Alarmkitステップを削除（オンデマンドに移行） | `OnboardingFlowView.swift` | 中 |
| 5 | Mixpanel Funnel更新 | Mixpanel UI | 中 |

---

## 4. パッチ詳細

### 4.1 パッチ1: オンボーディングフロー簡略化

**ファイル**: `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`

**目的**: 12ステップ → 7ステップに削減

**新しいフロー**:
```
Welcome → Value → Ideals → Struggles → HabitSetup → Notifications → 完了 → Paywall
```

**削除（スキップ）するステップ**:
- Account (Sign in with Apple)
- Source (どこで知った？)
- Name (名前入力)
- Gender (性別)
- Age (年齢)
- Alarmkit (アラーム許可)

**修正箇所**: `advance()` メソッド内の遷移先を変更

まず現在のコードを確認：

[1 tool called]

**パッチ1: OnboardingFlowView.swift**

```diff
--- a/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
+++ b/aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift
@@ -69,37 +69,42 @@ private func advance() {
         // Mixpanel: 各ステップ完了時に個別イベントを送信（Funnel分析用）
         switch step {
         case .welcome:
             AnalyticsManager.shared.track(.onboardingWelcomeCompleted)
-            step = .account
-        case .account:
-            AnalyticsManager.shared.track(.onboardingAccountCompleted)
-            step = .value
+            // v0.4: Account (Sign in with Apple) をスキップ
+            step = .value
         case .value:
             AnalyticsManager.shared.track(.onboardingValueCompleted)
-            step = .source
-        case .source:
-            AnalyticsManager.shared.track(.onboardingSourceCompleted)
-            step = .name
-        case .name:
-            AnalyticsManager.shared.track(.onboardingNameCompleted)
-            step = .gender
-        case .gender:
-            AnalyticsManager.shared.track(.onboardingGenderCompleted)
-            step = .age
-        case .age:
-            AnalyticsManager.shared.track(.onboardingAgeCompleted)
+            // v0.4: Source, Name, Gender, Age をスキップ
             step = .ideals
         case .ideals:
             AnalyticsManager.shared.track(.onboardingIdealsCompleted)
             step = .struggles
         case .struggles:
             AnalyticsManager.shared.track(.onboardingStrugglesCompleted)
             step = .habitSetup
         case .habitSetup:
             AnalyticsManager.shared.track(.onboardingHabitsetupCompleted)
             step = .notifications
         case .notifications:
             AnalyticsManager.shared.track(.onboardingNotificationsCompleted)
-            // AlarmKitは iOS 26+ のみ。非対応ならここで完了にする（通知権限と混同しない）
-            #if canImport(AlarmKit)
-            if #available(iOS 26.0, *) {
-                step = .alarmkit
-            } else {
-                completeOnboarding()
-                return
-            }
-            #else
+            // v0.4: Alarmkitステップを削除（習慣詳細画面でオンデマンド許可に変更）
             completeOnboarding()
             return
-            #endif
-        case .alarmkit:
-            AnalyticsManager.shared.track(.onboardingAlarmkitCompleted)
-            completeOnboarding()
-            return
+        // v0.4: 以下のステップはスキップされるが、コードは残す（将来の再利用のため）
+        case .account:
+            // スキップ: このcaseに到達することはない
+            step = .value
+        case .source:
+            step = .name
+        case .name:
+            step = .gender
+        case .gender:
+            step = .age
+        case .age:
+            step = .ideals
+        case .alarmkit:
+            completeOnboarding()
+            return
         }
         appState.setOnboardingStep(step)
     }
```

---

### 4.2 パッチ2: AlarmKitデフォルト値修正

**ファイル**: `apps/api/src/routes/mobile/profile.js`

**問題**: サーバー側のデフォルト値がTRUEになっている（iOS側はFALSE）

**修正箇所1**: プロフィールがない場合のデフォルト値（Line 101-104）

```diff
--- a/apps/api/src/routes/mobile/profile.js
+++ b/apps/api/src/routes/mobile/profile.js
@@ -98,10 +98,10 @@ router.get('/', async (req, res) => {
         trainingGoal: '',
         idealTraits: [],
         problems: [],
-        useAlarmKitForWake: true,
-        useAlarmKitForTraining: true,
-        useAlarmKitForBedtime: true,
-        useAlarmKitForCustom: true,
+        useAlarmKitForWake: false,
+        useAlarmKitForTraining: false,
+        useAlarmKitForBedtime: false,
+        useAlarmKitForCustom: false,
         stickyModeEnabled: true,
         habitSchedules: {},
         habitFollowupCounts: {},
```

**修正箇所2**: プロフィールがある場合のデフォルト値（Line 143-146）

```diff
@@ -140,10 +140,10 @@ router.get('/', async (req, res) => {
       summary: profile.summary || '',
       nudgeIntensity: profile.nudgeIntensity || 'normal',
       stickyMode: profile.stickyMode ?? profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
-      useAlarmKitForWake: profile.useAlarmKitForWake ?? true,
-      useAlarmKitForTraining: profile.useAlarmKitForTraining ?? true,
-      useAlarmKitForBedtime: profile.useAlarmKitForBedtime ?? true,
-      useAlarmKitForCustom: profile.useAlarmKitForCustom ?? true,
+      useAlarmKitForWake: profile.useAlarmKitForWake ?? false,
+      useAlarmKitForTraining: profile.useAlarmKitForTraining ?? false,
+      useAlarmKitForBedtime: profile.useAlarmKitForBedtime ?? false,
+      useAlarmKitForCustom: profile.useAlarmKitForCustom ?? false,
       stickyModeEnabled: profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true,
       habitSchedules: profile.habitSchedules || {},
```

---

### 4.3 パッチ3: 匿名ID対応（新規ユーザー）

**ファイル**: `aniccaios/aniccaios/Services/SubscriptionManager.swift`

まず現在のコードを確認：

[2 tools called]

**確認結果**: 現在のコードは既に匿名ID対応している。

- `configure()`: `appUserID`を渡していない → 匿名IDが自動生成
- `handleLogin()`: Sign in with Apple成功後にのみ呼ばれる

**変更不要**: `SubscriptionManager.swift`は修正不要。Sign in with Appleをスキップすれば自動的に匿名IDで動作する。

---

### 4.4 パッチ4: Mixpanel匿名ID対応

**ファイル**: `aniccaios/aniccaios/Services/AnalyticsManager.swift`

現在のコードを確認：

[1 tool called]

**確認結果**: 現在のコードは既に匿名ID対応している。

- `identify()`: Sign in with Apple成功後にのみ呼ばれる
- デフォルト: `$device_id`が`distinct_id`として使用される

**変更不要**: `AnalyticsManager.swift`は修正不要。

---

## 5. 既存ユーザーへの影響

### 5.1 アップデートするだけの既存ユーザー

| 項目 | 影響 |
|------|------|
| 認証状態 | **変化なし**。UserDefaultsに`userCredentials`が保存されている |
| サブスクリプション | **変化なし**。RevenueCatは既存のuser_idで動作 |
| プロフィール | **変化なし**。ローカルに保存されている |
| オンボーディング | **変化なし**。`isOnboardingComplete = true`なのでスキップ |

### 5.2 既存ユーザーがアプリを削除→再インストール

| 項目 | 影響 |
|------|------|
| 認証状態 | **失われる**。UserDefaultsがクリアされる |
| サブスクリプション | **復元可能**。「購入を復元」ボタンで復元できる |
| プロフィール | **復元不可**。サーバーからの復元機能は存在するが、Sign in with Appleがないとuser_idが不明 |

**注意**: 既存ユーザーがアプリを削除→再インストールした場合、「購入を復元」ボタンで課金状態は復元できるが、プロフィール（習慣設定、Ideals/Struggles）は復元できない。これは現状と同じ問題。

---

## 6. Mixpanel設定変更

### 6.1 新しいFunnelステップ

オンボーディング簡略化に伴い、Funnelを更新する：

**新しいFunnel「Onboarding v0.4」**:
```
1. onboarding_started
2. onboarding_welcome_completed
3. onboarding_value_completed
4. onboarding_ideals_completed
5. onboarding_struggles_completed
6. onboarding_habitsetup_completed
7. onboarding_notifications_completed
8. onboarding_completed
9. onboarding_paywall_viewed
10. onboarding_paywall_purchased
```

### 6.2 リテンションレポート

**設定**:
- A event (Start): `onboarding_completed`
- B event (Return): `app_opened`
- Unit: Day
- 名前: 「Day 1 / Day 7 Retention」

**MCPでも取得可能**:
```
mcp_mixpanel_run_retention_query(
  project_id: 3970220,
  born_event: "onboarding_completed",
  event: "app_opened",
  unit: "day",
  interval_count: 7
)
```

---
## 7. テスト項目

### 7.1 新規ユーザーテスト

| # | テスト項目 | 期待結果 |
|---|-----------|---------|
| 1 | オンボーディング開始 | Welcomeから始まる |
| 2 | Welcome完了後 | Valueに遷移（Accountをスキップ） |
| 3 | Value完了後 | Idealsに遷移（Source, Name, Gender, Ageをスキップ） |
| 4 | Notifications完了後 | オンボーディング完了（Alarmkitをスキップ） |
| 5 | Paywall表示 | オンボーディング完了後に表示される |
| 6 | 課金テスト | 匿名IDで課金できる |
| 7 | Mixpanelイベント | 各ステップ完了イベントが送信される |

### 7.2 既存ユーザーテスト

| # | テスト項目 | 期待結果 |
|---|-----------|---------|
| 1 | アプリ起動 | オンボーディングはスキップ（isOnboardingComplete = true） |
| 2 | 認証状態 | 既存のuser_idで認証済み |
| 3 | サブスクリプション | 既存の課金状態が維持される |

### 7.3 AlarmKitテスト

| # | テスト項目 | 期待結果 |
|---|-----------|---------|
| 1 | 新規ユーザー | AlarmKitはデフォルトOFF |
| 2 | サーバーから復元 | AlarmKitはOFF（修正後） |
| 3 | トグルをON | AlarmKit許可ダイアログが表示される |

---

## 8. 修正ファイルまとめ

| ファイル | 修正内容 |
|---------|---------|
| `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift` | フロー順序変更（パッチ1） |
| `apps/api/src/routes/mobile/profile.js` | AlarmKitデフォルト値修正（パッチ2） |

**変更不要**:
- `SubscriptionManager.swift`: 既に匿名ID対応済み
- `AnalyticsManager.swift`: 既に匿名ID対応済み
- `AppState.swift`: 変更不要
- `OnboardingStep.swift`: ステップ定義は削除しない（非表示のみ）

---

## 9. 未解決事項

### 9.1 プロフィール復元問題

**現状**: 既存ユーザーがアプリを削除→再インストールした場合、プロフィールが復元できない

**原因**: Sign in with Appleをスキップするため、user_idが不明でサーバーからフェッチできない

**対策案**:
- プロフィール画面に「Appleでサインイン」ボタンを追加（オプション）
- または、iCloudキーバリューストアでdevice_idを同期

### 9.2 AlarmKitオンデマンド許可

**現状**: 習慣詳細画面でAlarmKitトグルをONにしたとき、許可要求ダイアログが表示されるか未確認


---

## 10. レビューチェックリスト

- [ ] パッチ1: オンボーディングフロー遷移が正しいか
- [ ] パッチ1: スキップされるステップのcaseが残っているか（削除していないか）
- [ ] パッチ2: AlarmKitデフォルト値が4箇所すべて修正されているか
- [ ] 既存ユーザーへの影響が正しく理解されているか
- [ ] Mixpanel Funnelの新しいステップが正しいか
- [ ] テスト項目が網羅されているか

---

**以上が実装仕様書です。レビューをお願いします。**