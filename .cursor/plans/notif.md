# 通知テキスト最適化 - 実装仕様書

## 背景と目的

### 解決すべき問題

1. **APIコストの問題**
   - 現状、事前通知（Pre-reminder）と本番通知（Main Notification）の両方でOpenAI APIを呼び出してパーソナライズしている
   - 毎回2回のAPI呼び出しはコストがかかりすぎる
   - 解決策：すべての通知を固定フレーズに変更し、API呼び出しを廃止する

2. **通知テキストが長すぎる問題**
   - 事前通知のプロンプトで「80文字以内」と指示していたが、通知枠に収まらず「...」で切れていた
   - 原因はサーバー側の切り詰め処理（`slice(0, maxLength - 3) + '...'`）
   - この切り詰め処理は既に削除済み

3. **フォローアップ通知の問題**
   - 10秒間隔で同じ文言が繰り返し来ていた
   - 同じ文言が連続で来ると不快
   - 解決策：30秒間隔に変更し、毎回異なる文言を表示する（既に対応済み）

4. **フォローアップ文言が曖昧な問題**
   - 「小さく始めれば続く。」「待ってるよ。」など、何の習慣についての通知かわからない文言があった
   - 解決策：すべての文言に習慣名を明確に含める

5. **ユーザー名対応の問題**
   - ユーザー名を設定していない人が多い
   - 文言に`%@`でユーザー名を埋め込むと、設定していない人には文法が崩れる（例：「、おはよう。」と表示されてしまう）
   - 解決策：ユーザー名がある場合は「だいすけ、おはよう。」、ない場合は「おはよう。」と表示されるよう、プレフィックス方式で対応する

---

## 今回の実装内容

### 1. 事前通知をAIパーソナライズから固定フレーズに変更

現在、事前通知はサーバーにリクエストを送りOpenAI APIでパーソナライズされたメッセージを生成している。これを廃止し、ローカルに保存した固定フレーズをローテーションで表示するように変更する。

- 各習慣タイプ（起床、トレーニング、就寝、カスタム）ごとに10種類の固定フレーズを用意する
- 日付ベースでローテーション（年間日 % 10 で1〜10のインデックスを決定）
- これにより毎日異なる文言が表示される

### 2. ユーザー名の条件付き表示

すべての通知文言（事前通知、本番通知、フォローアップ）でユーザー名を条件付きで表示する。

**仕組み:**
- Localizable.stringsには `%@おはよう。新しい一日が始まるよ。` の形式で保存
- Swiftで `%@` を置換する際：
  - ユーザー名がある場合（日本語）：`%@` → `だいすけ、`
  - ユーザー名がある場合（英語）：`%@` → `Daisuke, `
  - ユーザー名がない場合：`%@` → `` (空文字)

**結果:**
- 日本語・ユーザー名あり：「だいすけ、おはよう。新しい一日が始まるよ。」
- 日本語・ユーザー名なし：「おはよう。新しい一日が始まるよ。」
- 英語・ユーザー名あり：「Daisuke, Good morning. A new day begins.」
- 英語・ユーザー名なし：「Good morning. A new day begins.」

### 3. 本番通知・フォローアップの文言修正

既に実装済みの本番通知・フォローアップの文言を、上記のユーザー名プレフィックス方式に対応させる。現在の実装では`%@`をユーザー名そのもので置換しているが、これを「ユーザー名+読点（または空文字）」で置換するように変更する。

### 4. 事前通知の固定フレーズ追加

Localizable.stringsに事前通知用のキーを追加する。

- 日本語：`notification_{habit}_prereminder_1` 〜 `notification_{habit}_prereminder_10`
- 英語：同上
- 合計：10種類 × 4習慣 × 2言語 = 80キー

### 5. サーバー側の変更

サーバー側（`preReminder.js`）のエンドポイントは残すが、iOS側からは呼び出さなくなる。将来AIパーソナライズを復活させる場合に備えて、実装はそのまま維持する。

### 6. AIパーソナライズ実装の記録

将来AIパーソナライズを復活させる際の参考資料として、`docs/ai-personalized-notifications.md` を作成する。このドキュメントには以下を含める：

- サーバー側（`preReminder.js`）のプロンプト設計
- iOS側からのAPI呼び出し方法（`fetchPreReminderMessage`関数）
- 本番通知用のAPI呼び出し方法（`fetchMainNotificationMessage`関数）
- 復活時の適用手順

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `aniccaios/aniccaios/Notifications/NotificationScheduler.swift` | ・`userNamePrefix()`関数を追加<br>・`preReminderBody()`関数を追加<br>・`schedulePreReminder()`からサーバー呼び出しを削除<br>・`scheduleCustomPreReminder()`からサーバー呼び出しを削除<br>・`primaryBody()`をプレフィックス方式に修正<br>・`followupBody()`をプレフィックス方式に修正<br>・`customBaseContent()`をプレフィックス方式に修正<br>・`fetchPreReminderMessage()`関数を削除<br>・`defaultPreReminderBody()`関数を削除<br>・`refreshPreRemindersIfNeeded()`を簡略化 |
| `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings` | ・事前通知キーを40個追加（10種×4習慣）<br>・本番通知キーを修正（`%@`をプレフィックス方式に）<br>・フォローアップキーを修正（`%@`をプレフィックス方式に） |
| `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings` | ・事前通知キーを40個追加（10種×4習慣）<br>・本番通知キーを修正（`%@`をプレフィックス方式に）<br>・フォローアップキーを修正（`%@`をプレフィックス方式に） |
| `docs/ai-personalized-notifications.md` | ・新規作成<br>・AIパーソナライズの実装方法を記録 |

---

## 通知文言の設計

### 共通ルール

1. すべての文言で「何の習慣についての通知か」が明確にわかるようにする
2. ユーザー名は先頭に配置し、ない場合は自然に省略される形式にする
3. 通知枠に収まる長さにする（日本語25文字程度、英語40文字程度）

### 文言のバリエーション

各習慣タイプ × 各通知タイプで10種類の文言を用意する。

- 事前通知：10種類 × 4習慣 = 40パターン
- 本番通知：10種類 × 4習慣 = 40パターン（既存を修正）
- フォローアップ：10種類 × 4習慣 = 40パターン（既存を修正）

### ローテーション方式

- 事前通知・本番通知：日付ベース（`dayOfYear % 10`）で毎日異なる文言を表示
- フォローアップ：インデックスベース（`followupIndex % 10`）で毎回異なる文言を表示

---

## 確認事項

レビュー時に以下を確認してほしい：

1. **ユーザー名プレフィックスのロジック**
   - ユーザー名がある場合：日本語は「名前、」、英語は「Name, 」になるか
   - ユーザー名がない場合：空文字になり、文法が自然になるか

2. **ローカライズの整合性**
   - 日本語と英語で同じキーが存在するか
   - プレースホルダー（`%@`、`%1$@`、`%2$@`）の数が一致しているか

3. **各文言が習慣を明示しているか**
   - 起床の通知には「起床」「起きる」「朝」「wake」などが含まれているか
   - トレーニングの通知には「トレーニング」「運動」「training」「exercise」などが含まれているか
   - 就寝の通知には「就寝」「眠り」「休む」「bedtime」「sleep」などが含まれているか
   - カスタムの通知には習慣名（`%2$@`）が含まれているか

ーーーー

---

# 通知テキスト最適化 - 実装仕様書（更新版）

## 背景と目的

### 解決すべき問題

1. **APIコストの問題**
   - 現状、事前通知（Pre-reminder）でOpenAI APIを呼び出してパーソナライズしている
   - 毎回のAPI呼び出しはコストがかかりすぎる
   - 解決策：フラグで切り替え可能にし、固定フレーズモードをデフォルトにする

2. **通知テキストが長すぎる問題**
   - 事前通知のプロンプトで「80文字以内」と指示していたが、通知枠に収まらず「...」で切れていた
   - 解決策：固定フレーズは25文字程度（日本語）に統一

3. **フォローアップ文言が曖昧な問題**
   - 「小さく始めれば続く。」「待ってるよ。」など、何の習慣かわからない文言があった
   - 解決策：すべての文言に習慣名を明確に含める

4. **ユーザー名対応の問題**
   - ユーザー名を設定していない人が多い
   - 文言に`%@`でユーザー名を埋め込むと、設定していない人には文法が崩れる
   - 解決策：プレフィックス方式（名前があれば「名前、」、なければ空文字）

---

## 実装方針

### フラグ切り替え方式を採用

**既存のAIパーソナライズコードは削除しない。** フラグ1つで切り替える。

```swift
private let useAIPersonalization = false
```

- `false`（デフォルト）：固定フレーズを使用、APIコストゼロ
- `true`：従来通りサーバーAPIでパーソナライズ

**メリット：**
- 将来復活させるときは `true` にするだけ
- 別途ドキュメントを作成する必要がない（コード自体がドキュメント）
- 変更箇所が最小限でバグリスクが低い

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `NotificationScheduler.swift` | ・`useAIPersonalization`フラグ追加<br>・`userNamePrefix()`関数追加<br>・`preReminderBody()`関数追加<br>・`schedulePreReminder()`をフラグ分岐に修正<br>・`scheduleCustomPreReminder()`をフラグ分岐に修正<br>・`primaryBody()`をプレフィックス方式に修正<br>・`followupBody()`をプレフィックス方式に修正<br>・`customBaseContent()`をプレフィックス方式に修正<br>・`refreshPreRemindersIfNeeded()`をフラグ対応に修正 |
| `ja.lproj/Localizable.strings` | ・事前通知キー40個追加<br>・本番通知キー30個修正<br>・フォローアップキー30個修正 |
| `en.lproj/Localizable.strings` | ・事前通知キー40個追加<br>・本番通知キー30個修正<br>・フォローアップキー30個修正 |

**※ `docs/ai-personalized-notifications.md` は不要**（コードを削除しないため）

---

## ユーザー名プレフィックス方式

### 仕組み

```swift
private func userNamePrefix() -> String {
    let language = AppState.shared.userProfile.preferredLanguage
    let name = AppState.shared.userProfile.displayName
    guard !name.isEmpty else { return "" }
    return language == .ja ? "\(name)、" : "\(name), "
}
```

### Localizable.stringsの形式

```
"notification_wake_main_1" = "%@おはよう。新しい一日が始まるよ。";
```

### 結果

| 言語 | ユーザー名 | 表示 |
|-----|----------|------|
| 日本語 | だいすけ | 「だいすけ、おはよう。新しい一日が始まるよ。」 |
| 日本語 | なし | 「おはよう。新しい一日が始まるよ。」 |
| 英語 | Daisuke | 「Daisuke, Good morning. A new day begins.」 |
| 英語 | なし | 「Good morning. A new day begins.」 |

---

## ローテーション方式

### 事前通知・本番通知

日付ベースで毎日異なる文言を表示：

```swift
let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
let index = ((dayOfYear - 1) % 10) + 1
// index は 1〜10
```

### フォローアップ

インデックスベースで毎回異なる文言を表示：

```swift
let rotationIndex = ((followupIndex - 1) % 10) + 1
// rotationIndex は 1〜10
```

---

## カスタム習慣の2引数対応

カスタム習慣は「ユーザー名プレフィックス」と「習慣名」の2引数が必要：

### Localizable.strings

```
"notification_custom_main_1" = "%1$@%2$@の時間だよ。始めよう。";
```

- `%1$@` = ユーザー名プレフィックス（「だいすけ、」または空文字）
- `%2$@` = 習慣名（「読書」など）

### Swift

```swift
String(format: localizedString(key), prefix, habitName)
```

---

## 変更しないもの

以下は**削除せず、そのまま残す**：

- `fetchPreReminderMessage()` 関数
- `defaultPreReminderBody()` 関数
- サーバー側 `preReminder.js` エンドポイント

理由：`useAIPersonalization = true` にすれば即座にAIパーソナライズを復活できるようにするため。

---

## 確認事項

1. **フラグのデフォルト値**
   - `useAIPersonalization = false` になっているか

2. **ユーザー名プレフィックス**
   - 名前あり：日本語「名前、」、英語「Name, 」
   - 名前なし：空文字

3. **Localizable.stringsの整合性**
   - 日本語と英語で同じキーが存在するか
   - プレースホルダーの数が一致しているか（通常習慣1個、カスタム習慣2個）

4. **文言が習慣を明示しているか**
   - 起床：「起床」「起きる」「朝」「wake」
   - トレーニング：「トレーニング」「運動」「training」「exercise」
   - 就寝：「就寝」「眠り」「休む」「bedtime」「sleep」
   - カスタム：習慣名（`%2$@`）

---

これが更新された完全な仕様書。実装してよければ言って。

----

レビューを行うために、まず現在の実装を確認させてください。

[3 tools called]

`AppState` の `displayName` の定義も確認させてください。

[1 tool called]

ファイルの内容を確認しました。詳細なレビューを行います。

---

了解。チャットで完全なパッチを示す。

---

# 完全実装パッチ

## 方針：フラグ切り替え方式
- AIパーソナライズのコードは削除しない
- `useAIPersonalization = false` で固定フレーズを使用
- 将来復活させるときは `true` にするだけ

---

## 1. NotificationScheduler.swift

### 追加① フラグ（line 35、`private init() {}` の直前）

```swift
// MARK: - AI Personalization Configuration
    
/// AIパーソナライズを使用するかどうか
/// - true: サーバーAPIでパーソナライズ
/// - false: 固定フレーズ（日付ベースローテーション）
private let useAIPersonalization = false
```

### 追加② userNamePrefix()（line 48付近、`localizedString` の後）

```swift
// MARK: - User Name Prefix

private func userNamePrefix() -> String {
    let language = AppState.shared.userProfile.preferredLanguage
    let name = AppState.shared.userProfile.displayName
    guard !name.isEmpty else { return "" }
    return language == .ja ? "\(name)、" : "\(name), "
}
```

### 追加③ preReminderBody()（userNamePrefix の後）

```swift
private func preReminderBody(for habit: HabitType, habitName: String? = nil) -> String {
    let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
    let index = ((dayOfYear - 1) % 10) + 1
    let prefix = userNamePrefix()
    
    switch habit {
    case .wake, .training, .bedtime:
        let key = "notification_\(habit.rawValue)_prereminder_\(index)"
        return String(format: localizedString(key), prefix)
    case .custom:
        let name = habitName ?? customHabitDisplayName()
        let key = "notification_custom_prereminder_\(index)"
        return String(format: localizedString(key), prefix, name)
    }
}
```

### 修正④ schedulePreReminder()（line 739-745）

```swift
// 変更前
let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
let message = await fetchPreReminderMessage(
    habitType: habit,
    scheduledTime: scheduledTimeStr,
    habitName: habitName
) ?? defaultPreReminderBody(for: habit, habitName: habitName)

// 変更後
let message: String
if useAIPersonalization {
    let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
    message = await fetchPreReminderMessage(
        habitType: habit,
        scheduledTime: scheduledTimeStr,
        habitName: habitName
    ) ?? preReminderBody(for: habit, habitName: habitName)
} else {
    message = preReminderBody(for: habit, habitName: habitName)
}
```

### 修正⑤ scheduleCustomPreReminder()（line 800-807）

```swift
// 変更前
let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
let message = await fetchPreReminderMessage(
    habitType: .custom,
    scheduledTime: scheduledTimeStr,
    habitName: name
) ?? String(format: localizedString("pre_reminder_custom_body_format"), minutesBefore, name)

// 変更後
let message: String
if useAIPersonalization {
    let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
    message = await fetchPreReminderMessage(
        habitType: .custom,
        scheduledTime: scheduledTimeStr,
        habitName: name
    ) ?? preReminderBody(for: .custom, habitName: name)
} else {
    message = preReminderBody(for: .custom, habitName: name)
}
```

### 修正⑥ primaryBody()（line 323-340 を全置換）

```swift
private func primaryBody(for habit: HabitType, at date: Date = Date()) -> String {
    let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: date) ?? 1
    let index = ((dayOfYear - 1) % 10) + 1
    let prefix = userNamePrefix()
    
    switch habit {
    case .wake:
        return String(format: localizedString("notification_wake_main_\(index)"), prefix)
    case .training:
        return String(format: localizedString("notification_training_main_\(index)"), prefix)
    case .bedtime:
        return String(format: localizedString("notification_bedtime_main_\(index)"), prefix)
    case .custom:
        let habitName = customHabitDisplayName()
        return String(format: localizedString("notification_custom_main_\(index)"), prefix, habitName)
    }
}
```

### 修正⑦ followupBody()（line 356-373 を全置換）

```swift
private func followupBody(for habit: HabitType, index: Int = 1) -> String {
    let rotationIndex = ((index - 1) % 10) + 1
    let prefix = userNamePrefix()
    
    switch habit {
    case .wake:
        return String(format: localizedString("notification_wake_followup_\(rotationIndex)"), prefix)
    case .training:
        return String(format: localizedString("notification_training_followup_\(rotationIndex)"), prefix)
    case .bedtime:
        return String(format: localizedString("notification_bedtime_followup_\(rotationIndex)"), prefix)
    case .custom:
        let habitName = customHabitDisplayName()
        return String(format: localizedString("notification_custom_followup_\(rotationIndex)"), prefix, habitName)
    }
}
```

### 修正⑧ customBaseContent()（line 557-578 を全置換）

```swift
private func customBaseContent(name: String, isFollowup: Bool, followupIndex: Int = 1) -> UNMutableNotificationContent {
    let c = UNMutableNotificationContent()
    c.title = isFollowup ? String(format: localizedString("notification_custom_followup_title_format"), name) : name
    let prefix = userNamePrefix()
    
    if isFollowup {
        let rotationIndex = ((followupIndex - 1) % 10) + 1
        c.body = String(format: localizedString("notification_custom_followup_\(rotationIndex)"), prefix, name)
    } else {
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let index = ((dayOfYear - 1) % 10) + 1
        c.body = String(format: localizedString("notification_custom_main_\(index)"), prefix, name)
    }
    
    c.categoryIdentifier = Category.habitAlarm.rawValue
    c.interruptionLevel = .timeSensitive
    c.sound = wakeSound()
    return c
}
```

### 修正⑨ refreshPreRemindersIfNeeded()（line 908-931 を全置換）

```swift
func refreshPreRemindersIfNeeded() async {
    // AIパーソナライズ無効時は日次リフレッシュ不要
    guard useAIPersonalization else {
        logger.debug("Pre-reminder refresh skipped (using fixed phrases)")
        return
    }
    
    let lastRefresh = UserDefaults.standard.double(forKey: lastRefreshKey)
    let now = Date().timeIntervalSince1970
    
    guard now - lastRefresh >= 86400 else {
        logger.debug("Pre-reminder refresh skipped (last refresh within 24h)")
        return
    }
    
    logger.info("Refreshing pre-reminders with new personalized messages")
    
    let schedules = AppState.shared.habitSchedules
    await cancelAllPreReminders()
    
    for (habit, components) in schedules {
        guard let hour = components.hour, let minute = components.minute else { continue }
        await schedulePreReminder(habit: habit, hour: hour, minute: minute)
    }
    
    UserDefaults.standard.set(now, forKey: lastRefreshKey)
    logger.info("Pre-reminder refresh completed")
}
```

---

## 2. ja.lproj/Localizable.strings

### 追加：事前通知キー（line 159付近、本番通知の前に追加）

```
/* ========== 事前通知（10種類ローテーション） ========== */

/* 起床 - 事前通知（5分前） */
"notification_wake_prereminder_1" = "%@あと5分で起床の時間だよ。";
"notification_wake_prereminder_2" = "%@もうすぐ起床アラームが鳴るよ。";
"notification_wake_prereminder_3" = "%@起床まであと5分。目覚めの準備を。";
"notification_wake_prereminder_4" = "%@起床時間が近づいてるよ。";
"notification_wake_prereminder_5" = "%@あと5分で起きる時間だよ。";
"notification_wake_prereminder_6" = "%@起床の5分前だよ。";
"notification_wake_prereminder_7" = "%@もうすぐ起床の時間だよ。";
"notification_wake_prereminder_8" = "%@起床まで残り5分。";
"notification_wake_prereminder_9" = "%@あと5分で朝の時間だよ。";
"notification_wake_prereminder_10" = "%@起床アラームまであと5分。";

/* トレーニング - 事前通知（15分前） */
"notification_training_prereminder_1" = "%@あと15分でトレーニングの時間。";
"notification_training_prereminder_2" = "%@トレーニングまであと15分。準備を。";
"notification_training_prereminder_3" = "%@もうすぐトレーニングの時間だよ。";
"notification_training_prereminder_4" = "%@トレーニングの15分前だよ。";
"notification_training_prereminder_5" = "%@あと15分で運動の時間。";
"notification_training_prereminder_6" = "%@トレーニング開始まで15分。";
"notification_training_prereminder_7" = "%@運動の時間が近いよ。";
"notification_training_prereminder_8" = "%@トレーニングまで残り15分。";
"notification_training_prereminder_9" = "%@あと15分でトレーニング開始。";
"notification_training_prereminder_10" = "%@トレーニングの準備を始めよう。";

/* 就寝 - 事前通知（15分前） */
"notification_bedtime_prereminder_1" = "%@あと15分で就寝の時間だよ。";
"notification_bedtime_prereminder_2" = "%@就寝まであと15分。休む準備を。";
"notification_bedtime_prereminder_3" = "%@もうすぐ就寝時間だよ。";
"notification_bedtime_prereminder_4" = "%@就寝の15分前だよ。";
"notification_bedtime_prereminder_5" = "%@あと15分で眠りの時間。";
"notification_bedtime_prereminder_6" = "%@就寝時間まで15分。";
"notification_bedtime_prereminder_7" = "%@眠りの時間が近いよ。";
"notification_bedtime_prereminder_8" = "%@就寝まで残り15分。";
"notification_bedtime_prereminder_9" = "%@あと15分で休む時間だよ。";
"notification_bedtime_prereminder_10" = "%@そろそろ就寝の準備を。";

/* カスタム - 事前通知 */
"notification_custom_prereminder_1" = "%1$@あと15分で%2$@の時間だよ。";
"notification_custom_prereminder_2" = "%1$@%2$@まであと15分。準備を。";
"notification_custom_prereminder_3" = "%1$@もうすぐ%2$@の時間だよ。";
"notification_custom_prereminder_4" = "%1$@%2$@の15分前だよ。";
"notification_custom_prereminder_5" = "%1$@あと15分で%2$@を始める時間。";
"notification_custom_prereminder_6" = "%1$@%2$@の時間が近いよ。";
"notification_custom_prereminder_7" = "%1$@%2$@まで残り15分。";
"notification_custom_prereminder_8" = "%1$@もうすぐ%2$@の時間。";
"notification_custom_prereminder_9" = "%1$@あと15分で%2$@。";
"notification_custom_prereminder_10" = "%1$@そろそろ%2$@の準備を。";
```

### 修正：本番通知キー（既存を置換）

```
/* 起床 - 本番通知 */
"notification_wake_main_1" = "%@おはよう。新しい一日が始まるよ。";
"notification_wake_main_2" = "%@起きる時間だよ。目を開けてみて。";
"notification_wake_main_3" = "%@朝だよ。一緒に始めよう。";
"notification_wake_main_4" = "%@今日という日が待ってるよ。起きよう。";
"notification_wake_main_5" = "%@朝の光が来てる。目を開けてみて。";
"notification_wake_main_6" = "%@起きる準備はできてる。さあ、起きよう。";
"notification_wake_main_7" = "%@新しい朝だよ。どんな一日にする？";
"notification_wake_main_8" = "%@起きる時間。深呼吸から始めよう。";
"notification_wake_main_9" = "%@今日も一緒にいるよ。起きよう。";
"notification_wake_main_10" = "%@朝が来たよ。まず身体を伸ばしてみて。";

/* トレーニング - 本番通知 */
"notification_training_main_1" = "%@トレーニングの時間だよ。身体を動かそう。";
"notification_training_main_2" = "%@運動の時間。準備はいい？";
"notification_training_main_3" = "%@身体が動きたがってる。さあ、始めよう。";
"notification_training_main_4" = "%@今日のトレーニング、まず1分から。";
"notification_training_main_5" = "%@運動の時間だよ。どこから始める？";
"notification_training_main_6" = "%@一緒にトレーニングしよう。";
"notification_training_main_7" = "%@身体を動かす時間。気持ちよくなるよ。";
"notification_training_main_8" = "%@トレーニング開始の時間だよ。";
"notification_training_main_9" = "%@今日も身体を鍛えよう。準備OK？";
"notification_training_main_10" = "%@運動の時間。まずウォームアップから。";

/* 就寝 - 本番通知 */
"notification_bedtime_main_1" = "%@そろそろ寝る時間だよ。今日もお疲れさま。";
"notification_bedtime_main_2" = "%@ベッドに入る時間だよ。";
"notification_bedtime_main_3" = "%@今日はもう十分頑張った。休もう。";
"notification_bedtime_main_4" = "%@眠りの準備を始めよう。";
"notification_bedtime_main_5" = "%@一日を閉じる時間。おやすみの準備を。";
"notification_bedtime_main_6" = "%@身体が休みを求めてるよ。ベッドへ。";
"notification_bedtime_main_7" = "%@今夜もゆっくり休もう。";
"notification_bedtime_main_8" = "%@明日のために、今夜は眠ろう。";
"notification_bedtime_main_9" = "%@スクリーンを閉じて、目を休めよう。";
"notification_bedtime_main_10" = "%@今日の終わり。安らかな眠りを。";

/* カスタム - 本番通知 */
"notification_custom_main_1" = "%1$@%2$@の時間だよ。始めよう。";
"notification_custom_main_2" = "%1$@%2$@の時間。準備はいい？";
"notification_custom_main_3" = "%1$@%2$@を始める時間だよ。";
"notification_custom_main_4" = "%1$@今が%2$@のタイミング。さあ。";
"notification_custom_main_5" = "%1$@%2$@、まず1分だけやってみよう。";
"notification_custom_main_6" = "%1$@%2$@やろう。一緒に。";
"notification_custom_main_7" = "%1$@%2$@の時間が来たよ。";
"notification_custom_main_8" = "%1$@今日の%2$@、どこから始める？";
"notification_custom_main_9" = "%1$@%2$@を始めれば、気持ちも変わるよ。";
"notification_custom_main_10" = "%1$@%2$@の時間。小さく始めよう。";
```

### 修正：フォローアップキー（既存を置換）

```
/* 起床 - フォローアップ */
"notification_wake_followup_1" = "%@まだ寝てる？目を開けてみて。";
"notification_wake_followup_2" = "%@起きよう。待ってるよ。";
"notification_wake_followup_3" = "%@朝だよ。まず身体を伸ばしてみて。";
"notification_wake_followup_4" = "%@起きる時間だよ。深呼吸してみて。";
"notification_wake_followup_5" = "%@もう少しで起きれるよ。頑張って。";
"notification_wake_followup_6" = "%@一日が始まるよ。布団から出てみて。";
"notification_wake_followup_7" = "%@一緒に朝を始めよう。";
"notification_wake_followup_8" = "%@身体は起きる準備ができてるよ。";
"notification_wake_followup_9" = "%@朝の光が待ってる。起きよう。";
"notification_wake_followup_10" = "%@今起きれば、いい一日になるよ。";

/* トレーニング - フォローアップ */
"notification_training_followup_1" = "%@トレーニングまだ？1分だけやろう。";
"notification_training_followup_2" = "%@運動しよう。待ってるよ。";
"notification_training_followup_3" = "%@身体を動かす時間だよ。さあ。";
"notification_training_followup_4" = "%@今からでも間に合う。動いてみて。";
"notification_training_followup_5" = "%@トレーニング1セットだけでもOK。";
"notification_training_followup_6" = "%@運動すると気持ちいいよ。始めよう。";
"notification_training_followup_7" = "%@一緒にトレーニングしよう。";
"notification_training_followup_8" = "%@身体が運動を待ってる。動こう。";
"notification_training_followup_9" = "%@今日のトレーニング、まだできるよ。";
"notification_training_followup_10" = "%@小さく始めても大丈夫。動いてみて。";

/* 就寝 - フォローアップ */
"notification_bedtime_followup_1" = "%@そろそろ寝る準備を始めよう。";
"notification_bedtime_followup_2" = "%@照明を落として深呼吸しよう。";
"notification_bedtime_followup_3" = "%@スクリーンを閉じて、目を休めよう。";
"notification_bedtime_followup_4" = "%@今日はここまで。ベッドに入ろう。";
"notification_bedtime_followup_5" = "%@眠気がきたらそのまま休もう。";
"notification_bedtime_followup_6" = "%@おやすみルーティンを始めよう。";
"notification_bedtime_followup_7" = "%@今日もよく頑張った。目を閉じよう。";
"notification_bedtime_followup_8" = "%@歯みがきは済んだ？";
"notification_bedtime_followup_9" = "%@ベッドに横になって、身体を緩めよう。";
"notification_bedtime_followup_10" = "%@明日のために、今夜は眠ろう。";

/* カスタム - フォローアップ */
"notification_custom_followup_1" = "%1$@%2$@を始めよう。今ならできる。";
"notification_custom_followup_2" = "%1$@%2$@の時間を逃さないで。";
"notification_custom_followup_3" = "%1$@%2$@、まず1分だけやってみて。";
"notification_custom_followup_4" = "%1$@%2$@、今なら始められるよ。";
"notification_custom_followup_5" = "%1$@%2$@、一緒にやってみよう。";
"notification_custom_followup_6" = "%1$@%2$@をやると気持ちが変わるよ。";
"notification_custom_followup_7" = "%1$@%2$@の準備はできてるよ。";
"notification_custom_followup_8" = "%1$@%2$@、そろそろ進めよう。";
"notification_custom_followup_9" = "%1$@%2$@を少しだけでも進めよう。";
"notification_custom_followup_10" = "%1$@%2$@、待ってるよ。";
```

---

## 3. en.lproj/Localizable.strings

### 追加：事前通知キー

```
/* Wake - Pre-reminder (5 min before) */
"notification_wake_prereminder_1" = "%@5 min until wake-up time.";
"notification_wake_prereminder_2" = "%@Wake alarm coming in 5 min.";
"notification_wake_prereminder_3" = "%@5 min to wake. Get ready.";
"notification_wake_prereminder_4" = "%@Wake time is near.";
"notification_wake_prereminder_5" = "%@5 min to wake up.";
"notification_wake_prereminder_6" = "%@5 min before wake.";
"notification_wake_prereminder_7" = "%@Almost wake time.";
"notification_wake_prereminder_8" = "%@5 min left until wake.";
"notification_wake_prereminder_9" = "%@Morning in 5 min.";
"notification_wake_prereminder_10" = "%@5 min to wake alarm.";

/* Training - Pre-reminder (15 min before) */
"notification_training_prereminder_1" = "%@Training in 15 min.";
"notification_training_prereminder_2" = "%@15 min to training. Prepare.";
"notification_training_prereminder_3" = "%@Training time soon.";
"notification_training_prereminder_4" = "%@15 min before training.";
"notification_training_prereminder_5" = "%@Exercise in 15 min.";
"notification_training_prereminder_6" = "%@15 min until training.";
"notification_training_prereminder_7" = "%@Workout time is near.";
"notification_training_prereminder_8" = "%@15 min left to training.";
"notification_training_prereminder_9" = "%@Training starts in 15 min.";
"notification_training_prereminder_10" = "%@Time to prepare for training.";

/* Bedtime - Pre-reminder (15 min before) */
"notification_bedtime_prereminder_1" = "%@Bedtime in 15 min.";
"notification_bedtime_prereminder_2" = "%@15 min to bed. Time to rest.";
"notification_bedtime_prereminder_3" = "%@Bedtime soon.";
"notification_bedtime_prereminder_4" = "%@15 min before bedtime.";
"notification_bedtime_prereminder_5" = "%@Sleep time in 15 min.";
"notification_bedtime_prereminder_6" = "%@15 min to bedtime.";
"notification_bedtime_prereminder_7" = "%@Sleep time is near.";
"notification_bedtime_prereminder_8" = "%@15 min left to bedtime.";
"notification_bedtime_prereminder_9" = "%@Rest time in 15 min.";
"notification_bedtime_prereminder_10" = "%@Time to prepare for bed.";

/* Custom - Pre-reminder */
"notification_custom_prereminder_1" = "%1$@%2$@ in 15 min.";
"notification_custom_prereminder_2" = "%1$@15 min to %2$@. Prepare.";
"notification_custom_prereminder_3" = "%1$@%2$@ time soon.";
"notification_custom_prereminder_4" = "%1$@15 min before %2$@.";
"notification_custom_prereminder_5" = "%1$@Time for %2$@ in 15 min.";
"notification_custom_prereminder_6" = "%1$@%2$@ time is near.";
"notification_custom_prereminder_7" = "%1$@15 min left to %2$@.";
"notification_custom_prereminder_8" = "%1$@Almost time for %2$@.";
"notification_custom_prereminder_9" = "%1$@%2$@ in 15 min.";
"notification_custom_prereminder_10" = "%1$@Time to prepare for %2$@.";
```

### 修正：本番通知キー（既存を置換）

```
/* Wake - Main */
"notification_wake_main_1" = "%@Good morning. A new day begins.";
"notification_wake_main_2" = "%@Time to wake up. Just open your eyes first.";
"notification_wake_main_3" = "%@It's morning. Let's start together.";
"notification_wake_main_4" = "%@Today is waiting for you. Let's wake up.";
"notification_wake_main_5" = "%@Morning light is here. Open your eyes.";
"notification_wake_main_6" = "%@You're ready. Time to get up.";
"notification_wake_main_7" = "%@A fresh morning. What kind of day will it be?";
"notification_wake_main_8" = "%@Time to wake. Start with a deep breath.";
"notification_wake_main_9" = "%@I'm here with you today. Let's wake up.";
"notification_wake_main_10" = "%@Morning is here. Try stretching first.";

/* Training - Main */
"notification_training_main_1" = "%@Training time. Let's move your body.";
"notification_training_main_2" = "%@Time to work out. Ready?";
"notification_training_main_3" = "%@Your body wants to move. Let's start.";
"notification_training_main_4" = "%@Today's training. Start with 1 minute.";
"notification_training_main_5" = "%@Time to exercise. Where do you start?";
"notification_training_main_6" = "%@Let's train together.";
"notification_training_main_7" = "%@Time to move. You'll feel great.";
"notification_training_main_8" = "%@Time to start your training.";
"notification_training_main_9" = "%@Let's strengthen your body today. Ready?";
"notification_training_main_10" = "%@Exercise time. Start with a warm-up.";

/* Bedtime - Main */
"notification_bedtime_main_1" = "%@Time for bed. You did well today.";
"notification_bedtime_main_2" = "%@Time to get into bed.";
"notification_bedtime_main_3" = "%@You've done enough today. Time to rest.";
"notification_bedtime_main_4" = "%@Let's prepare for sleep.";
"notification_bedtime_main_5" = "%@Time to close the day. Get ready for sleep.";
"notification_bedtime_main_6" = "%@Your body needs rest. Head to bed.";
"notification_bedtime_main_7" = "%@Let's rest well tonight.";
"notification_bedtime_main_8" = "%@Sleep tonight for a better tomorrow.";
"notification_bedtime_main_9" = "%@Close your screens. Rest your eyes.";
"notification_bedtime_main_10" = "%@End of the day. Sleep peacefully.";

/* Custom - Main */
"notification_custom_main_1" = "%1$@Time for %2$@. Let's begin.";
"notification_custom_main_2" = "%1$@Time for %2$@. Ready?";
"notification_custom_main_3" = "%1$@Time to start %2$@.";
"notification_custom_main_4" = "%1$@Now's the time for %2$@. Go.";
"notification_custom_main_5" = "%1$@%2$@. Try just 1 minute first.";
"notification_custom_main_6" = "%1$@Let's do %2$@. Together.";
"notification_custom_main_7" = "%1$@%2$@ time has come.";
"notification_custom_main_8" = "%1$@Today's %2$@. Where do you start?";
"notification_custom_main_9" = "%1$@Starting %2$@ will shift your mood.";
"notification_custom_main_10" = "%1$@Time for %2$@. Start small.";
```

### 修正：フォローアップキー（既存を置換）

```
/* Wake - Follow-up */
"notification_wake_followup_1" = "%@Still in bed? Try opening your eyes.";
"notification_wake_followup_2" = "%@Wake up. I'm waiting.";
"notification_wake_followup_3" = "%@It's morning. Try stretching first.";
"notification_wake_followup_4" = "%@Time to wake. Take a deep breath.";
"notification_wake_followup_5" = "%@Almost there. You can do it.";
"notification_wake_followup_6" = "%@The day is starting. Get out of bed.";
"notification_wake_followup_7" = "%@Let's start the morning together.";
"notification_wake_followup_8" = "%@Your body is ready to wake up.";
"notification_wake_followup_9" = "%@Morning light awaits. Wake up.";
"notification_wake_followup_10" = "%@Wake now for a great day ahead.";

/* Training - Follow-up */
"notification_training_followup_1" = "%@Training not done? Just 1 minute.";
"notification_training_followup_2" = "%@Let's exercise. I'm waiting.";
"notification_training_followup_3" = "%@Time to move your body. Let's go.";
"notification_training_followup_4" = "%@Still time. Start moving.";
"notification_training_followup_5" = "%@Training. Even 1 set is OK.";
"notification_training_followup_6" = "%@Exercise feels good. Let's start.";
"notification_training_followup_7" = "%@Let's train together.";
"notification_training_followup_8" = "%@Your body awaits exercise. Move.";
"notification_training_followup_9" = "%@Today's training. You can still do it.";
"notification_training_followup_10" = "%@Starting small is fine. Just move.";

/* Bedtime - Follow-up */
"notification_bedtime_followup_1" = "%@Time to start winding down.";
"notification_bedtime_followup_2" = "%@Dim the lights and take a deep breath.";
"notification_bedtime_followup_3" = "%@Close your screens. Rest your eyes.";
"notification_bedtime_followup_4" = "%@That's enough for today. Get into bed.";
"notification_bedtime_followup_5" = "%@When sleepiness comes, just rest.";
"notification_bedtime_followup_6" = "%@Let's start your bedtime routine.";
"notification_bedtime_followup_7" = "%@You did well today. Close your eyes.";
"notification_bedtime_followup_8" = "%@Have you brushed your teeth?";
"notification_bedtime_followup_9" = "%@Lie down and let your body relax.";
"notification_bedtime_followup_10" = "%@Sleep tonight for tomorrow.";

/* Custom - Follow-up */
"notification_custom_followup_1" = "%1$@Let's start %2$@. You can do it now.";
"notification_custom_followup_2" = "%1$@Don't miss the time for %2$@.";
"notification_custom_followup_3" = "%1$@%2$@, just try 1 minute first.";
"notification_custom_followup_4" = "%1$@%2$@, you can start now.";
"notification_custom_followup_5" = "%1$@%2$@, let's do it together.";
"notification_custom_followup_6" = "%1$@Doing %2$@ will change how you feel.";
"notification_custom_followup_7" = "%1$@You're ready for %2$@.";
"notification_custom_followup_8" = "%1$@%2$@, let's move forward.";
"notification_custom_followup_9" = "%1$@Let's make progress on %2$@, even a little.";
"notification_custom_followup_10" = "%1$@%2$@, I'm waiting.";
```

---

これで完全なパッチ。実装してよければ言って。