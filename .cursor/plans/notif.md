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

4. **AIパーソナライズの記録**
   - `docs/ai-personalized-notifications.md` に復活時に必要な情報がすべて含まれているか

----


## 今回実装する内容（完全版パッチ）

---

### 1. Localizable.strings（日本語）

**ファイル**: `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

**追加・修正内容**:

```diff
+ /* ========== 事前通知（10種類ローテーション） ========== */
+ 
+ /* 起床 - 事前通知（5分前） */
+ "notification_wake_prereminder_1" = "%@あと5分で起床の時間だよ。";
+ "notification_wake_prereminder_2" = "%@もうすぐ起床アラームが鳴るよ。";
+ "notification_wake_prereminder_3" = "%@起床まであと5分。目覚めの準備を。";
+ "notification_wake_prereminder_4" = "%@起床時間が近づいてるよ。";
+ "notification_wake_prereminder_5" = "%@あと5分で起きる時間だよ。";
+ "notification_wake_prereminder_6" = "%@起床の5分前だよ。";
+ "notification_wake_prereminder_7" = "%@もうすぐ起床の時間だよ。";
+ "notification_wake_prereminder_8" = "%@起床まで残り5分。";
+ "notification_wake_prereminder_9" = "%@あと5分で朝の時間だよ。";
+ "notification_wake_prereminder_10" = "%@起床アラームまであと5分。";
+ 
+ /* トレーニング - 事前通知（15分前） */
+ "notification_training_prereminder_1" = "%@あと15分でトレーニングの時間。";
+ "notification_training_prereminder_2" = "%@トレーニングまであと15分。準備を。";
+ "notification_training_prereminder_3" = "%@もうすぐトレーニングの時間だよ。";
+ "notification_training_prereminder_4" = "%@トレーニングの15分前だよ。";
+ "notification_training_prereminder_5" = "%@あと15分で運動の時間。";
+ "notification_training_prereminder_6" = "%@トレーニング開始まで15分。";
+ "notification_training_prereminder_7" = "%@運動の時間が近いよ。";
+ "notification_training_prereminder_8" = "%@トレーニングまで残り15分。";
+ "notification_training_prereminder_9" = "%@あと15分でトレーニング開始。";
+ "notification_training_prereminder_10" = "%@トレーニングの準備を始めよう。";
+ 
+ /* 就寝 - 事前通知（15分前） */
+ "notification_bedtime_prereminder_1" = "%@あと15分で就寝の時間だよ。";
+ "notification_bedtime_prereminder_2" = "%@就寝まであと15分。休む準備を。";
+ "notification_bedtime_prereminder_3" = "%@もうすぐ就寝時間だよ。";
+ "notification_bedtime_prereminder_4" = "%@就寝の15分前だよ。";
+ "notification_bedtime_prereminder_5" = "%@あと15分で眠りの時間。";
+ "notification_bedtime_prereminder_6" = "%@就寝時間まで15分。";
+ "notification_bedtime_prereminder_7" = "%@眠りの時間が近いよ。";
+ "notification_bedtime_prereminder_8" = "%@就寝まで残り15分。";
+ "notification_bedtime_prereminder_9" = "%@あと15分で休む時間だよ。";
+ "notification_bedtime_prereminder_10" = "%@そろそろ就寝の準備を。";
+ 
+ /* カスタム - 事前通知（15分前）%1$@=ユーザー名, %2$@=習慣名 */
+ "notification_custom_prereminder_1" = "%1$@あと15分で%2$@の時間だよ。";
+ "notification_custom_prereminder_2" = "%1$@%2$@まであと15分。準備を。";
+ "notification_custom_prereminder_3" = "%1$@もうすぐ%2$@の時間だよ。";
+ "notification_custom_prereminder_4" = "%1$@%2$@の15分前だよ。";
+ "notification_custom_prereminder_5" = "%1$@あと15分で%2$@を始める時間。";
+ "notification_custom_prereminder_6" = "%1$@%2$@の時間が近いよ。";
+ "notification_custom_prereminder_7" = "%1$@%2$@まで残り15分。";
+ "notification_custom_prereminder_8" = "%1$@もうすぐ%2$@の時間。";
+ "notification_custom_prereminder_9" = "%1$@あと15分で%2$@。";
+ "notification_custom_prereminder_10" = "%1$@そろそろ%2$@の準備を。";
```

**本番通知の修正**（既存キーを置き換え）:

```diff
- "notification_wake_main_1" = "おはよう、%@。新しい一日が始まるよ。";
+ "notification_wake_main_1" = "%@おはよう。新しい一日が始まるよ。";

- "notification_wake_main_2" = "起きる時間だよ。まず目を開けてみて。";
+ "notification_wake_main_2" = "%@起きる時間だよ。目を開けてみて。";

- "notification_wake_main_3" = "%@、朝だよ。一緒に始めよう。";
+ "notification_wake_main_3" = "%@朝だよ。一緒に始めよう。";

/* 以下同様に全キーを修正 */
```

**フォローアップの修正**（既存キーを置き換え）:

```diff
- "notification_wake_followup_1" = "まだ寝てる？目を開けてみて。";
+ "notification_wake_followup_1" = "%@まだ寝てる？目を開けてみて。";

- "notification_wake_followup_2" = "%@、起きよう。待ってるよ。";
+ "notification_wake_followup_2" = "%@起きよう。待ってるよ。";

/* 以下同様に全キーを修正 */
```

---

### 2. Localizable.strings（英語）

**ファイル**: `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`

**追加・修正内容**:

```diff
+ /* ========== Pre-Reminder Notifications (10 variants) ========== */
+ 
+ /* Wake - Pre-reminder (5 min before) */
+ "notification_wake_prereminder_1" = "%@5 min until wake-up time.";
+ "notification_wake_prereminder_2" = "%@Wake alarm coming in 5 min.";
+ "notification_wake_prereminder_3" = "%@5 min to wake. Get ready.";
+ "notification_wake_prereminder_4" = "%@Wake time is near.";
+ "notification_wake_prereminder_5" = "%@5 min to wake up.";
+ "notification_wake_prereminder_6" = "%@5 min before wake.";
+ "notification_wake_prereminder_7" = "%@Almost wake time.";
+ "notification_wake_prereminder_8" = "%@5 min left until wake.";
+ "notification_wake_prereminder_9" = "%@Morning in 5 min.";
+ "notification_wake_prereminder_10" = "%@5 min to wake alarm.";
+ 
+ /* Training - Pre-reminder (15 min before) */
+ "notification_training_prereminder_1" = "%@Training in 15 min.";
+ "notification_training_prereminder_2" = "%@15 min to training. Prepare.";
+ "notification_training_prereminder_3" = "%@Training time soon.";
+ "notification_training_prereminder_4" = "%@15 min before training.";
+ "notification_training_prereminder_5" = "%@Exercise in 15 min.";
+ "notification_training_prereminder_6" = "%@15 min until training.";
+ "notification_training_prereminder_7" = "%@Workout time is near.";
+ "notification_training_prereminder_8" = "%@15 min left to training.";
+ "notification_training_prereminder_9" = "%@Training starts in 15 min.";
+ "notification_training_prereminder_10" = "%@Time to prepare for training.";
+ 
+ /* Bedtime - Pre-reminder (15 min before) */
+ "notification_bedtime_prereminder_1" = "%@Bedtime in 15 min.";
+ "notification_bedtime_prereminder_2" = "%@15 min to bed. Time to rest.";
+ "notification_bedtime_prereminder_3" = "%@Bedtime soon.";
+ "notification_bedtime_prereminder_4" = "%@15 min before bedtime.";
+ "notification_bedtime_prereminder_5" = "%@Sleep time in 15 min.";
+ "notification_bedtime_prereminder_6" = "%@15 min to bedtime.";
+ "notification_bedtime_prereminder_7" = "%@Sleep time is near.";
+ "notification_bedtime_prereminder_8" = "%@15 min left to bedtime.";
+ "notification_bedtime_prereminder_9" = "%@Rest time in 15 min.";
+ "notification_bedtime_prereminder_10" = "%@Time to prepare for bed.";
+ 
+ /* Custom - Pre-reminder (15 min before) %1$@=username, %2$@=habit name */
+ "notification_custom_prereminder_1" = "%1$@%2$@ in 15 min.";
+ "notification_custom_prereminder_2" = "%1$@15 min to %2$@. Prepare.";
+ "notification_custom_prereminder_3" = "%1$@%2$@ time soon.";
+ "notification_custom_prereminder_4" = "%1$@15 min before %2$@.";
+ "notification_custom_prereminder_5" = "%1$@Time for %2$@ in 15 min.";
+ "notification_custom_prereminder_6" = "%1$@%2$@ time is near.";
+ "notification_custom_prereminder_7" = "%1$@15 min left to %2$@.";
+ "notification_custom_prereminder_8" = "%1$@Almost time for %2$@.";
+ "notification_custom_prereminder_9" = "%1$@%2$@ in 15 min.";
+ "notification_custom_prereminder_10" = "%1$@Time to prepare for %2$@.";
```

**本番通知・フォローアップも同様に修正**（日本語と同じパターンで`%@`を先頭に）

---

### 3. NotificationScheduler.swift

**ファイル**: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

#### 3.1 ユーザー名プレフィックス関数を追加

```diff
+ // MARK: - User Name Prefix
+ 
+ /// ユーザー名プレフィックスを生成（名前があれば「名前、」、なければ空文字）
+ private func userNamePrefix() -> String {
+     let language = AppState.shared.userProfile.preferredLanguage
+     if let name = AppState.shared.userProfile.displayName, !name.isEmpty {
+         return language == .ja ? "\(name)、" : "\(name), "
+     }
+     return ""
+ }
```

#### 3.2 事前通知のbody関数を追加

```diff
+ /// 事前通知の本文を生成（固定フレーズ、日付ベースローテーション）
+ private func preReminderBody(for habit: HabitType, habitName: String? = nil) -> String {
+     let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
+     let index = ((dayOfYear - 1) % 10) + 1
+     let prefix = userNamePrefix()
+     
+     switch habit {
+     case .wake, .training, .bedtime:
+         let key = "notification_\(habit.rawValue)_prereminder_\(index)"
+         return String(format: localizedString(key), prefix)
+     case .custom:
+         let name = habitName ?? customHabitDisplayName()
+         let key = "notification_custom_prereminder_\(index)"
+         return String(format: localizedString(key), prefix, name)
+     }
+ }
```

#### 3.3 schedulePreReminder関数を修正（AI呼び出し削除）

```diff
  func schedulePreReminder(
      habit: HabitType,
      hour: Int,
      minute: Int,
      habitName: String? = nil,
      customHabitId: UUID? = nil
  ) async {
      // ... 時刻計算部分は変更なし ...
      
-     // ★ サーバーからパーソナライズメッセージを取得（フォールバック付き）
-     let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
-     let message = await fetchPreReminderMessage(
-         habitType: habit,
-         scheduledTime: scheduledTimeStr,
-         habitName: habitName
-     ) ?? defaultPreReminderBody(for: habit, habitName: habitName)
+     // 固定フレーズ（日付ベースローテーション）
+     let message = preReminderBody(for: habit, habitName: habitName)
      
      let content = UNMutableNotificationContent()
      content.title = "Anicca"
      content.body = message
      // ... 以下変更なし ...
  }
```

#### 3.4 scheduleCustomPreReminder関数を修正（AI呼び出し削除）

```diff
  private func scheduleCustomPreReminder(id: UUID, name: String, hour: Int, minute: Int) async {
      // ... 時刻計算部分は変更なし ...
      
-     // ★ サーバーからパーソナライズメッセージを取得（フォールバック付き）
-     let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
-     let message = await fetchPreReminderMessage(
-         habitType: .custom,
-         scheduledTime: scheduledTimeStr,
-         habitName: name
-     ) ?? String(format: localizedString("pre_reminder_custom_body_format"), minutesBefore, name)
+     // 固定フレーズ（日付ベースローテーション）
+     let message = preReminderBody(for: .custom, habitName: name)
      
      let content = UNMutableNotificationContent()
      content.title = "Anicca"
      content.body = message
      // ... 以下変更なし ...
  }
```

#### 3.5 fetchPreReminderMessage関数を削除

```diff
- /// サーバーからパーソナライズされた事前通知メッセージを取得
- private func fetchPreReminderMessage(
-     habitType: HabitType,
-     scheduledTime: String,
-     habitName: String?
- ) async -> String? {
-     // ... 全削除 ...
- }
```

#### 3.6 primaryBody関数を修正（ユーザー名プレフィックス対応）

```diff
  private func primaryBody(for habit: HabitType) -> String {
      let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
      let index = ((dayOfYear - 1) % 10) + 1
-     let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
+     let prefix = userNamePrefix()
      
      switch habit {
      case .wake:
          let key = "notification_wake_main_\(index)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .training:
          let key = "notification_training_main_\(index)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .bedtime:
          let key = "notification_bedtime_main_\(index)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .custom:
          let habitName = customHabitDisplayName()
          let key = "notification_custom_main_\(index)"
-         return String(format: localizedString(key), habitName)
+         return String(format: localizedString(key), prefix, habitName)
      }
  }
```

#### 3.7 followupBody関数を修正（ユーザー名プレフィックス対応）

```diff
  private func followupBody(for habit: HabitType, index: Int = 1) -> String {
      let rotationIndex = ((index - 1) % 10) + 1
-     let userName = AppState.shared.userProfile.displayName ?? localizedString("common_user_fallback")
+     let prefix = userNamePrefix()
      
      switch habit {
      case .wake:
          let key = "notification_wake_followup_\(rotationIndex)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .training:
          let key = "notification_training_followup_\(rotationIndex)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .bedtime:
          let key = "notification_bedtime_followup_\(rotationIndex)"
-         return String(format: localizedString(key), userName)
+         return String(format: localizedString(key), prefix)
      case .custom:
          let habitName = customHabitDisplayName()
          let key = "notification_custom_followup_\(rotationIndex)"
-         return String(format: localizedString(key), habitName)
+         return String(format: localizedString(key), prefix, habitName)
      }
  }
```

#### 3.8 customBaseContent関数を修正（ユーザー名プレフィックス対応）

```diff
  private func customBaseContent(name: String, isFollowup: Bool, followupIndex: Int = 1) -> UNMutableNotificationContent {
      let c = UNMutableNotificationContent()
      c.title = isFollowup ? String(format: localizedString("notification_custom_followup_title_format"), name) : name
+     let prefix = userNamePrefix()
      
      if isFollowup {
          let rotationIndex = ((followupIndex - 1) % 10) + 1
          let key = "notification_custom_followup_\(rotationIndex)"
-         c.body = String(format: localizedString(key), name)
+         c.body = String(format: localizedString(key), prefix, name)
      } else {
          let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
          let index = ((dayOfYear - 1) % 10) + 1
          let key = "notification_custom_main_\(index)"
-         c.body = String(format: localizedString(key), name)
+         c.body = String(format: localizedString(key), prefix, name)
      }
      
      // ... 以下変更なし ...
  }
```

#### 3.9 defaultPreReminderBody関数を削除（不要になったため）

```diff
- private func defaultPreReminderBody(for habit: HabitType, habitName: String?) -> String {
-     // ... 全削除 ...
- }
```

#### 3.10 refreshPreRemindersIfNeeded関数を修正（AI呼び出しが不要になったため簡略化）

```diff
  func refreshPreRemindersIfNeeded() async {
-     let lastRefresh = UserDefaults.standard.double(forKey: lastRefreshKey)
-     let now = Date().timeIntervalSince1970
-     
-     // 24時間経過していなければスキップ
-     guard now - lastRefresh >= 86400 else {
-         logger.debug("Pre-reminder refresh skipped (last refresh within 24h)")
-         return
-     }
-     
-     logger.info("Refreshing pre-reminders with new personalized messages")
-     
-     // 現在の習慣スケジュールを再登録
-     let schedules = AppState.shared.habitSchedules
-     await cancelAllPreReminders()
-     
-     for (habit, components) in schedules {
-         guard let hour = components.hour, let minute = components.minute else { continue }
-         await schedulePreReminder(habit: habit, hour: hour, minute: minute)
-     }
-     
-     UserDefaults.standard.set(now, forKey: lastRefreshKey)
-     logger.info("Pre-reminder refresh completed")
+     // 固定フレーズ使用のため、日次リフレッシュは不要
+     // （日付ベースローテーションは通知発火時に動的に決定される）
+     logger.debug("Pre-reminder refresh skipped (using fixed phrases)")
  }
```

---

### 4. docs/ai-personalized-notifications.md（新規作成）

**ファイル**: `docs/ai-personalized-notifications.md`

```markdown
# AIパーソナライズ通知の実装方法

このドキュメントは、将来AIパーソナライズ通知を復活させる際の参考資料です。

## 概要

事前通知（Pre-reminder）と本番通知（Main）をOpenAI APIでパーソナライズする実装。

---

## サーバー側（preReminder.js）

### エンドポイント

`POST /api/mobile/nudge/pre-reminder`

### リクエスト

```json
{
  "habitType": "wake" | "bedtime" | "training" | "custom",
  "habitName": "習慣名（customの場合のみ）",
  "scheduledTime": "HH:MM",
  "notificationType": "pre" | "main"  // オプション
}
```

### プロンプト設計

```javascript
const PROMPT_TEMPLATES = {
  ja: {
    bedtime: {
      system: `あなたはAnicca（aniicha）という温かいライフコーチです。
就寝15分前のユーザーに睡眠準備を促す短いメッセージを生成してください。

ルール:
- 25文字以内（厳守）通知枠に完全に収まるよう超短文で
- 1文で完結
- ユーザーの名前を含める
- 命令形ではなく、提案や誘いの形で
- 絵文字は使わない
- 「Anicca」「アニッチャ」という名前は含めない`,
      user: (ctx) => `ユーザー情報:
- 名前: ${ctx.displayName}
- なりたい自分: ${ctx.idealTraits?.join('、') || '未設定'}
${ctx.memories ? `- 過去の記録: ${ctx.memories}` : ''}

25文字以内で就寝準備を促すメッセージを1文で生成してください。`
    },
    // ... 他の習慣タイプも同様
  },
  en: {
    // ... 英語版
  }
};
```

---

## iOS側の実装

### 1. fetchPreReminderMessage関数

```swift
/// サーバーからパーソナライズされた事前通知メッセージを取得
private func fetchPreReminderMessage(
    habitType: HabitType,
    scheduledTime: String,
    habitName: String?
) async -> String? {
    let baseURL = AppConfig.proxyBaseURL
    let url = baseURL.appendingPathComponent("mobile/nudge/pre-reminder")
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    // 認証ヘッダーを追加
    if let deviceId = UIDevice.current.identifierForVendor?.uuidString {
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
    }
    if case .signedIn(let credentials) = AppState.shared.authStatus {
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
    }
    
    request.timeoutInterval = 10
    
    var body: [String: Any] = [
        "habitType": habitType.rawValue,
        "scheduledTime": scheduledTime
    ]
    if let habitName = habitName {
        body["habitName"] = habitName
    }
    
    do {
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            return nil
        }
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = json["message"] as? String, !message.isEmpty else {
            return nil
        }
        
        return message
    } catch {
        return nil
    }
}
```

### 2. fetchMainNotificationMessage関数

```swift
/// サーバーからパーソナライズされたメイン通知メッセージを取得
private func fetchMainNotificationMessage(
    habitType: HabitType,
    scheduledTime: String,
    habitName: String? = nil
) async -> String? {
    let baseURL = AppConfig.proxyBaseURL
    let url = baseURL.appendingPathComponent("mobile/nudge/pre-reminder")
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    if let deviceId = UIDevice.current.identifierForVendor?.uuidString {
        request.setValue(deviceId, forHTTPHeaderField: "device-id")
    }
    if case .signedIn(let credentials) = AppState.shared.authStatus {
        request.setValue(credentials.userId, forHTTPHeaderField: "user-id")
    }
    
    request.timeoutInterval = 10
    
    var body: [String: Any] = [
        "habitType": habitType.rawValue,
        "scheduledTime": scheduledTime,
        "notificationType": "main"
    ]
    if let habitName = habitName {
        body["habitName"] = habitName
    }
    
    do {
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            return nil
        }
        
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = json["message"] as? String {
            return message
        }
    } catch {
        // エラー時はnilを返し、フォールバックを使用
    }
    
    return nil
}
```

### 3. 使用方法

#### 事前通知での使用

```swift
func schedulePreReminder(...) async {
    // AIパーソナライズを使う場合
    let message = await fetchPreReminderMessage(
        habitType: habit,
        scheduledTime: scheduledTimeStr,
        habitName: habitName
    ) ?? defaultPreReminderBody(for: habit, habitName: habitName)
    
    content.body = message
}
```

#### 本番通知での使用

```swift
private func scheduleMain(habit: HabitType, hour: Int, minute: Int) async {
    let scheduledTimeStr = String(format: "%02d:%02d", hour, minute)
    
    // AIパーソナライズを使う場合
    let personalizedBody = await fetchMainNotificationMessage(
        habitType: habit,
        scheduledTime: scheduledTimeStr
    )
    
    content.body = personalizedBody ?? primaryBody(for: habit)
}
```

---

## 復活時の手順

1. **サーバー側**: `preReminder.js` は既に実装済みのため変更不要

2. **iOS側**:
   - `fetchPreReminderMessage()` 関数をNotificationScheduler.swiftに追加
   - `fetchMainNotificationMessage()` 関数をNotificationScheduler.swiftに追加
   - `schedulePreReminder()` でAI呼び出しを復活
   - `scheduleMain()` でAI呼び出しを復活（オプション）

3. **注意点**:
   - API呼び出しはタイムアウト10秒で設定
   - 失敗時は必ず固定フレーズにフォールバック
   - 通知スケジュール時にAPI呼び出しを行うため、ネットワーク状況に注意
```

---

これで実装を進めてよろしいですか？