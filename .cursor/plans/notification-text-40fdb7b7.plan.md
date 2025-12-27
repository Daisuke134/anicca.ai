<!-- 40fdb7b7-9a47-4fe9-be45-1700e5b17218 10054f9b-c205-4825-be1e-911d62e44c0c -->
# 通知テキスト最適化

## 問題の背景

### 1. APIコストの問題

- **現状**: 事前通知（Pre-reminder）と本番通知（Main）の両方でOpenAI APIを呼び出してパーソナライズしていた
- **問題**: 毎回2回のAPI呼び出しはコストがかかりすぎる
- **解決**: 事前通知のみAIパーソナライズを維持し、本番通知・フォローアップは固定フレーズに変更

### 2. 通知テキストが長すぎる問題

- **現状**: 事前通知のプロンプトで「80文字以内」と指示していたが、通知枠に収まらない
- **問題**: 通知が「...」で切れて表示が不自然になっていた
- **原因**: サーバー側で切り詰め処理（`slice(0, maxLength - 3) + '...'`）をしていた
- **解決**: プロンプトで短い文字数を指示し、切り詰め処理を完全に削除

### 3. フォローアップ通知の問題

- **現状**: 10秒間隔で同じ文言が繰り返し来ていた
- **問題**: 同じ文言が連続で来ると怖い・不快
- **解決**: 30秒間隔に変更し、毎回異なる文言を表示

### 4. フォローアップ文言が曖昧

- **現状**: 「小さく始めれば続く。」「{name}、待ってるよ。」など何の習慣かわからない文言があった
- **解決**: すべての文言を「何の習慣についてか明確にわかる」内容に修正

---

## 変更概要

| 項目 | Before | After |

|-----|--------|-------|

| フォローアップ間隔 | 10秒 | 30秒 |

| 本番通知 | AIパーソナライズ | 固定フレーズ（毎日ローテーション） |

| フォローアップ | 固定フレーズ（毎回同じ） | 固定フレーズ（毎回異なる） |

| 事前通知プロンプト | 80文字 | 日本語25文字、英語40文字 |

| 切り詰め処理 | あり | 完全削除 |

---

## 変更ファイル一覧

| ファイル | 変更内容 |

|---------|---------|

| [`NotificationScheduler.swift`](aniccaios/aniccaios/Notifications/NotificationScheduler.swift) | 間隔30秒、ローテーションロジック、AI呼び出し削除 |

| [`ja.lproj/Localizable.strings`](aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings) | 本番10種×4習慣 + フォローアップ10種×4習慣（80キー追加） |

| [`en.lproj/Localizable.strings`](aniccaios/aniccaios/Resources/en.lproj/Localizable.strings) | 同上（英語版） |

| [`preReminder.js`](apps/api/src/routes/mobile/preReminder.js) | プロンプト文字数短縮、切り詰め処理削除 |

---

## 詳細な変更内容

### 1. フォローアップ間隔変更

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

**Before**:

```swift
private enum AlarmLoop {
    /// 8秒サウンド + 2秒休止 = 10秒ごとに再通知
    static let intervalSeconds = 10
}
```

**After**:

```swift
private enum AlarmLoop {
    /// 30秒ごとに再通知
    static let intervalSeconds = 30
}
```

---

### 2. 本番通知のAI呼び出し削除

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

**Before**:

```swift
private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
    let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
    let personalizedBody = await fetchMainNotificationMessage(...)
    content.body = personalizedBody ?? primaryBody(for: habit)
}
```

**After**:

```swift
private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
    content.body = primaryBody(for: habit)  // 固定フレーズのみ
}
```

- `fetchMainNotificationMessage()` 関数も完全に削除

---

### 3. 日付ベースローテーション（本番通知）

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

**ロジック**:

```swift
private func primaryBody(for habit: HabitType) -> String {
    let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
    let index = ((dayOfYear - 1) % 10) + 1  // 1〜10
    let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
    
    let key = "notification_\(habit.rawValue)_main_\(index)"
    return String(format: localizedString(key), userName)
}
```

**動作**: 年間の日（1〜365）を10で割った余り+1でインデックスを決定。毎日異なる文言が表示される。

---

### 4. インデックスベースローテーション（フォローアップ）

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

**ロジック**:

```swift
private func followupBody(for habit: HabitType, index: Int = 1) -> String {
    let rotationIndex = ((index - 1) % 10) + 1  // 1〜10
    let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
    
    let key = "notification_\(habit.rawValue)_followup_\(rotationIndex)"
    return String(format: localizedString(key), userName)
}
```

**動作**: フォローアップの順番（1, 2, 3...）でインデックスを決定。3回フォローアップがあれば3回とも異なる文言が表示される。

---

### 5. 事前通知プロンプト短縮

**ファイル**: `apps/api/src/routes/mobile/preReminder.js`

**Before（日本語例）**:

```javascript
system: `...
ルール:
- 80文字以内（厳守）
...`
```

**After（日本語例）**:

```javascript
system: `...
ルール:
- 25文字以内（厳守）通知枠に完全に収まるよう超短文で
- 1文で完結
...`
```

**文字数制限**:

- 日本語: 80文字 → 25文字
- 英語: 80文字 → 40文字

---

### 6. 切り詰め処理の削除

**ファイル**: `apps/api/src/routes/mobile/preReminder.js`

**Before**:

```javascript
const maxLength = language === 'ja' ? 30 : 50;
if (generatedMessage.length > maxLength) {
    return generatedMessage.slice(0, maxLength - 3) + '...';
}
return generatedMessage;
```

**After**:

```javascript
// AIがプロンプト通りの文字数で出力するので、切り詰め処理は不要
return generatedMessage;
```

---

## Localizableキー設計

### 本番通知キー（10種×4習慣 = 40キー）

```
notification_wake_main_1 ~ notification_wake_main_10
notification_training_main_1 ~ notification_training_main_10
notification_bedtime_main_1 ~ notification_bedtime_main_10
notification_custom_main_1 ~ notification_custom_main_10
```

### フォローアップキー（10種×4習慣 = 40キー）

```
notification_wake_followup_1 ~ notification_wake_followup_10
notification_training_followup_1 ~ notification_training_followup_10
notification_bedtime_followup_1 ~ notification_bedtime_followup_10
notification_custom_followup_1 ~ notification_custom_followup_10
```

### プレースホルダー

- `%@`（第1引数）: ユーザー名（wake/training/bedtime）または習慣名（custom）
- Swiftの`String(format:)`で置換

---

## レビュー時の確認ポイント

### 1. ローカライズの整合性

- [ ] 日本語と英語の両方に同じキーが存在するか
- [ ] プレースホルダー（%@）の数が一致しているか
- [ ] 各文言が通知枠に収まる長さか

### 2. ロジックの確認

- [ ] `dayOfYear % 10` で正しく1〜10のインデックスが生成されるか
- [ ] `followupIndex` が正しく渡されているか
- [ ] カスタム習慣のローテーションも同様に動作するか

### 3. 削除された機能

- [ ] `fetchMainNotificationMessage()` が完全に削除されているか
- [ ] 切り詰め処理が削除されているか

### 4. 後方互換性

- [ ] 旧キー（`notification_wake_body`等）が残っているか（フォールバック用）

---

## テスト方法

1. **通知テスト**: 習慣を設定し、本番通知・フォローアップが正しく表示されるか確認
2. **ローテーション確認**: 日付を変えて異なる文言が表示されるか確認
3. **フォローアップ連続確認**: 3回以上のフォローアップで毎回異なる文言が表示されるか確認
4. **言語切り替え**: 日本語/英語を切り替えて正しい言語の文言が表示されるか確認
5. **事前通知確認**: 事前通知が25文字（日本語）/40文字（英語）以内で表示されるか確認

---

## To-dos

- [x] フォローアップ間隔を10秒→30秒に変更
- [x] 日本語Localizable.stringsに本番通知・フォローアップ文言を追加（10種×4習慣）
- [x] 英語Localizable.stringsに本番通知・フォローアップ文言を追加（10種×4習慣）
- [x] 本番通知を日付ベースローテーション、フォローアップを毎回異なる文言に変更
- [x] 事前通知プロンプトの文字数制限を短縮、切り詰め処理を削除