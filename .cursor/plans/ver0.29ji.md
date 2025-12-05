## 実現しようとしている体験（全体像）

### 1. AlarmKit フルスクリーンアラーム（iOS 26+）

- **目的**: ユーザーがiPhoneがロック中でも、習慣の時刻になったら全画面でアラームが表示され、確実に起床・行動できるようにする
- **対象**: 全習慣（Wake, Training, Bedtime, Custom）
- **設定**: 各習慣の詳細画面で個別にON/OFF可能
- **デフォルト**: すべてON（iOS 26+ の場合）

### 2. Sticky モード（全習慣対応）

- **目的**: ユーザーが二度寝したり、通知を無視して行動しないことを防ぐ
- **動作**: Anicca がユーザーが5回応答するまで話し続ける（間断なく）
- **対象**: 全習慣（Wake, Training, Bedtime, Custom）- 以前は Wake のみだった
- **設定**: 設定画面で一括ON/OFF
- **デフォルト**: ON

### 3. サインイン時のデータ復元＆オンボーディングスキップ

- **目的**: サインアウト→サインインしたユーザーが、以前の設定を復元して即座にアプリを使えるようにする
- **動作**: Appleサインイン後、サーバーにユーザーデータ（習慣スケジュール）が存在すれば、オンボーディングを完全にスキップしてメイン画面へ直行
- **以前の挙動**: データがあっても「All Set」画面を表示していた

### 4. データのAppleアカウント紐付け

- **目的**: ユーザーの設定・習慣・プロフィールを永続的に保存し、デバイス変更時も復元可能にする
- **動作**: 全データ（習慣スケジュール、フォローアップ回数、プロフィール情報、Sticky設定、AlarmKit設定）がAppleアカウント（userId）に紐付けられてサーバーに保存

---

## 実装内容の詳細（コンテキスト）

### ファイル変更一覧

| ファイル | 変更種別 | 主な変更内容 |
|---------|---------|-------------|
| `UserProfile.swift` | 修正 | プロパティ追加・リネーム |
| `AlarmKitWakeCoordinator.swift` → `AlarmKitHabitCoordinator.swift` | リネーム＆修正 | 全習慣対応 |
| `VoiceSessionController.swift` | 修正 | Sticky全習慣化 |
| `SettingsView.swift` | 修正 | UIトグル変更 |
| `NotificationScheduler.swift` | 修正 | AlarmKit全習慣対応 |
| `AppState.swift` | 修正 | プロファイル同期＆オンボーディングスキップ |
| `HabitsSectionView.swift` | 修正 | 習慣詳細画面にAlarmKitトグル追加 |
| `profile.js` (API) | 修正 | スキーマ変更 |
| `Localizable.strings` (ja/en) | 修正 | 新ローカライズキー追加 |

---

### 1. `UserProfile.swift` の変更

**変更前:**
```swift
var useAlarmKitForWake: Bool
var wakeStickyModeEnabled: Bool
```

**変更後:**
```swift
// AlarmKit設定（各習慣ごと）
var useAlarmKitForWake: Bool
var useAlarmKitForTraining: Bool
var useAlarmKitForBedtime: Bool
var useAlarmKitForCustom: Bool

// Stickyモード（全習慣共通）
var stickyModeEnabled: Bool
```

**後方互換性**: `wakeStickyModeEnabled` キーも読み取り可能

---

### 2. `AlarmKitHabitCoordinator.swift` の新規作成

- 旧 `AlarmKitWakeCoordinator.swift` を削除し、新ファイルを作成
- `scheduleHabit(_ habit: HabitType, hour:, minute:, followupCount:)` メソッドで全習慣に対応
- 各習慣ごとに別々のストレージキー（`com.anicca.alarmkit.{habit}.ids`）
- `AlarmButton` 拡張で `.stopButton` と `.openAppButton` を定義
- `Locale.Weekday` 拡張で `.allWeekdays` を定義
- `HabitAlarmStopIntent` を `AppIntent` として実装

---

### 3. `VoiceSessionController.swift` の変更

**変更前:**
```swift
private var wakeStickyActive = false
private var wakeUserReplyCount = 0
private var isWakeStickyEnabled: Bool {
    AppState.shared.userProfile.wakeStickyModeEnabled
}
// Sticky は Wake のみ適用
if currentHabitType == .wake && isWakeStickyEnabled { ... }
```

**変更後:**
```swift
private var stickyActive = false
private var stickyUserReplyCount = 0
private var isStickyEnabled: Bool {
    AppState.shared.userProfile.stickyModeEnabled
}
// Sticky は全習慣に適用
if currentHabitType != nil && isStickyEnabled { ... }
```

---

### 4. `SettingsView.swift` の変更

**変更前:**
- AlarmKitトグル（Wake専用）
- Wake Stickyモードトグル

**変更後:**
- AlarmKitトグルを削除（各習慣の詳細画面に移動）
- Stickyモードトグル（全習慣共通）+ 説明テキスト追加

---

### 5. `NotificationScheduler.swift` の変更

**変更前:**
```swift
if habit == .wake && AppState.shared.userProfile.useAlarmKitForWake { ... }
await AlarmKitWakeCoordinator.shared.scheduleWake(...)
```

**変更後:**
```swift
switch habit {
case .wake: return profile.useAlarmKitForWake
case .training: return profile.useAlarmKitForTraining
case .bedtime: return profile.useAlarmKitForBedtime
case .custom: return profile.useAlarmKitForCustom
}
await AlarmKitHabitCoordinator.shared.scheduleHabit(habit, ...)
```

---

### 6. `AppState.swift` の変更

**プロファイル同期ペイロード:**
```swift
// 変更前
"useAlarmKitForWake": profile.useAlarmKitForWake,
"wakeStickyModeEnabled": profile.wakeStickyModeEnabled

// 変更後
"useAlarmKitForWake": profile.useAlarmKitForWake,
"useAlarmKitForTraining": profile.useAlarmKitForTraining,
"useAlarmKitForBedtime": profile.useAlarmKitForBedtime,
"useAlarmKitForCustom": profile.useAlarmKitForCustom,
"stickyModeEnabled": profile.stickyModeEnabled
```

**オンボーディングスキップ:**
```swift
// 変更前
if (!habitSchedules.isEmpty || !profile.displayName.isEmpty) && !isOnboardingComplete {
    isOnboardingComplete = true
    setOnboardingStep(.completion)  // All Set 画面へ
}

// 変更後
if !habitSchedules.isEmpty && !isOnboardingComplete {
    isOnboardingComplete = true
    defaults.removeObject(forKey: onboardingStepKey)  // メイン画面へ直行
}
```

---

### 7. `HabitsSectionView.swift` の変更

`HabitEditSheet` にAlarmKitトグルセクションを追加（iOS 26+ のみ表示）:
```swift
#if canImport(AlarmKit)
if #available(iOS 26.0, *) {
    Section(String(localized: "settings_alarmkit_section_title")) {
        alarmKitToggle  // 習慣タイプに応じた設定を切り替え
    }
}
#endif
```

---

### 8. `profile.js` (API) の変更

**スキーマ追加:**
```javascript
useAlarmKitForWake: z.boolean().optional(),
useAlarmKitForTraining: z.boolean().optional(),
useAlarmKitForBedtime: z.boolean().optional(),
useAlarmKitForCustom: z.boolean().optional(),
stickyModeEnabled: z.boolean().optional(),
wakeStickyModeEnabled: z.boolean().optional(),  // 後方互換
```

**レスポンス:**
```javascript
stickyModeEnabled: profile.stickyModeEnabled ?? profile.wakeStickyModeEnabled ?? true
```

---

### 9. ローカライズキー追加

| キー | 日本語 | 英語 |
|-----|-------|------|
| `settings_sticky_mode_title` | スティッキーモード | Sticky Mode |
| `settings_sticky_mode_description` | ONにすると、5回応答するまでAniccaが話し続けます | When ON, Anicca keeps talking until you reply 5 times |
| `settings_alarmkit_section_title` | アラーム表示 | Alarm Display |
| `settings_alarmkit_toggle` | フルスクリーンアラームを使用 | Use full-screen alarm |
| `settings_alarmkit_description` | ONにすると、iPhoneがロック中でも全画面アラームが表示されます（iOS 26以上） | When ON, a full-screen alarm will show even when iPhone is locked (iOS 26+) |

---

このコンテキストで他のエージェントがレビュー可能です。追加で必要な情報があればお知らせください。