<!-- 3cf49aae-2384-46af-b3ea-bbc5005bb835 0e1a7df2-8153-4d73-ae69-ef95f16187af -->
# オンボーディングとプロファイル画面の不整合修正計画

各質問に順番にお答えします。

---

## 1. 各修正によるユーザー体験の変化

### 修正1: Profile画面のIdeals/Strugglesリスト修正

**Before（現状）:**
オンボーディングで「Kind」「Confident」「Early Riser」「Runner」「Creative」などを選んだのに、後でProfile画面を開くと「Kind」「Altruistic」「Confident」「Mindful」「Honest」「Open」「Courageous」という**全く違うリスト**が表示される。ユーザーが選んだ項目がProfile画面に表示されず、混乱する。

**After（修正後）:**
オンボーディングで選んだ項目がそのままProfile画面でも表示される。ユーザーが「Creative」「Focused」「Brave」を選んでいれば、Profile画面でもそれらがハイライトされた状態で表示され、必要に応じて後から変更できる。一貫した体験。

---

### 修正2: AlarmKitダイアログのタイミング修正

**Before（現状）:**
Appleログインした直後、突然「Allow Anicca to schedule alarms and timers?」というダイアログが表示される。ユーザーは「なぜ今アラーム？」と困惑する。

**After（修正後）:**
ダイアログはWake習慣をオンにした時に初めて表示される。「起床アラームを設定しようとしてるからアラームの許可が必要なんだな」と**文脈が明確**で、ユーザーが許可する理由を理解できる。

---

### 修正3: Mem0テレメトリーエラー修正

**Before（現状）:**
サーバーログに `Telemetry event capture failed: TypeError: fetch failed` というエラーが大量に出力される。アプリ動作には影響ないが、ログが汚れて本当の問題を見つけにくい。

**After（修正後）:**
テレメトリーが無効化され、エラーログが出なくなる。サーバーログがクリーンになり、本当の問題を発見しやすくなる。

---

### 修正4: 15分前通知が届くようになる

**Before（現状）:**
22:44にBedtimeを設定しても、22:29に通知が来ない。`mutableContent = true` がないため、Notification Service Extensionが呼び出されず、通知自体がスケジュールされていても**配信されない**可能性がある。

**After（修正後）:**
設定した時刻の15分前（Bedtime/Training）または5分前（Wake）に通知が確実に届く。

---

### 修正5: 通知のパーソナライズ

**Before（現状）:**
通知に「Time to start winding down for bed.」「Your training time is coming up.」というデフォルトメッセージが表示される。ユーザーの名前や理想の姿への言及がない。

**After（修正後）:**
通知が「太郎さん、そろそろ寝る準備を始めましょう。明日のCreativeな自分のために。」のようにパーソナライズされる。ユーザーの名前、理想の姿（ideals）、現在の課題（struggles）を参照した温かいメッセージが届く。

---

## 2. データの流れと保存について

はい、おっしゃる通りです！流れを整理すると：

```
オンボーディング（IdealsStepView / StrugglesStepView）
    ↓ ユーザーが選択
appState.updateIdealTraits() / appState.updateUserProfile()
    ↓ UserProfileモデルに保存
UserDefaults（ローカル）+ ProfileSyncService（サーバー同期）
    ↓ mobile_profilesテーブルに保存
```

**Profile画面で表示:**
- `appState.userProfile.ideals` / `appState.userProfile.struggles` から読み出してチップ表示

**会話時のグラウンディング:**
- `preReminder.js` の `generatePersonalizedMessage()` 関数で：
  - `profile.idealTraits` → プロンプトに「なりたい自分: Kind, Creative, Focused」と含める
  - `profile.problems` → プロンプトに「今抱えている課題: Stress, Procrastination」と含める
- これによりOpenAI APIが**ユーザーの理想と課題を参照して**メッセージを生成

つまり、**オンボーディング → 保存 → Profile表示 → 会話グラウンディング** が一気通貫で繋がっています。

---

## 3. AlarmKitダイアログが出るべきタイミング

### 設計意図
AlarmKit（iOS 26+の新API）は**強力なアラーム**を鳴らせるAPIです。通常の通知より確実に起こせる。これは主に**Wake（起床）習慣**のためのものです。

### 出るべきタイミング

```
Habits画面でWake（起床）のトグルをONにする
    ↓
requestAlarmKitPermissionIfNeeded() が呼ばれる
    ↓
AlarmManager.authorizationState が .notDetermined の場合のみ
    ↓
「Allow Anicca to schedule alarms and timers?」ダイアログ表示
```

### パッチの内容

現在の問題は、`UserProfile` のデフォルト値が `useAlarmKitForWake = true` になっているため：

1. 新規ユーザーがサインイン
2. 空のプロファイルが作成される（デフォルト値 `useAlarmKitForWake = true`）
3. アプリのどこかでAlarmKitの設定を確認する処理が走る
4. → ダイアログが表示される

**パッチで修正する点:**
- `UserProfile.swift` で `useAlarmKitForWake` のデフォルト値を `false` に変更
- これにより、ユーザーがWake習慣をオンにして、時刻を設定した時に初めて `HabitsSectionView.swift` の `requestAlarmKitPermissionIfNeeded()` が呼ばれる
- **文脈のある適切なタイミング**でダイアログが表示される

---

ご質問の回答は以上です。この理解で合っていますか？修正を開始してよければお知らせください。

## 問題1: Profile画面のIdeals/Strugglesがオンボーディングと不一致

**現状分析:**

- オンボーディング `IdealsStepView.swift` のリスト:
  - `["kind", "confident", "early_riser", "runner", "creative", "mindful", "organized", "calm", "healthy", "patient", "focused", "grateful", "brave"]`
- Profile画面 `ProfileView.swift` のリスト:
  - `["kind", "altruistic", "confident", "mindful", "honest", "open", "courageous"]`

- オンボーディング `StrugglesStepView.swift` のリスト:
  - `["procrastination", "anxiety", "poor_sleep", "stress", "focus", "motivation", "self_doubt", "time_management", "burnout", "relationships", "energy", "work_life_balance"]`
- Profile画面 `ProfileView.swift` のリスト:
  - `["rumination", "jealousy", "self_criticism", "anxiety", "loneliness", "irritation"]`

**修正パッチ:** `ProfileView.swift`

```diff
--- a/aniccaios/aniccaios/Views/Profile/ProfileView.swift
+++ b/aniccaios/aniccaios/Views/Profile/ProfileView.swift
@@ -181,9 +181,9 @@ struct ProfileView: View {
             .foregroundStyle(AppTheme.Colors.label)
             .padding(.horizontal, 2)

-        // profile.md (Figma) 準拠: kind, altruistic, confident, mindful, honest, open, courageous
+        // オンボーディングと同一リスト
         ProfileFlowChips(
-            options: ["kind", "altruistic", "confident", "mindful", "honest", "open", "courageous"],
+            options: ["kind", "confident", "early_riser", "runner", "creative", "mindful", "organized", "calm", "healthy", "patient", "focused", "grateful", "brave"],
             selected: Binding(
                 get: { Set(appState.userProfile.ideals) },
                 set: { newValue in
@@ -205,9 +205,9 @@ struct ProfileView: View {
             .foregroundStyle(AppTheme.Colors.label)
             .padding(.horizontal, 2)

-        // profile.md (Figma) 準拠: rumination, jealousy, self_criticism, anxiety, loneliness, irritation
+        // オンボーディングと同一リスト
         ProfileFlowChips(
-            options: ["rumination", "jealousy", "self_criticism", "anxiety", "loneliness", "irritation"],
+            options: ["procrastination", "anxiety", "poor_sleep", "stress", "focus", "motivation", "self_doubt", "time_management", "burnout", "relationships", "energy", "work_life_balance"],
             selected: Binding(
                 get: { Set(appState.userProfile.struggles) },
                 set: { newValue in
```

---

## 問題2: AlarmKitダイアログがAppleログイン直後に表示される

**現状分析:**

- `AuthCoordinator.swift` でサインイン後、ダイアログが表示される
- 原因: `updateUserCredentials()` 内でプロファイルのデフォルト値 `useAlarmKitForWake = true` が設定され、アプリ起動時に AlarmKit 許可が自動リクエストされている可能性
- `UserProfile.swift` の初期値: `useAlarmKitForWake: Bool = true`

**修正パッチ:** `UserProfile.swift` - デフォルト値を `false` に変更し、Wake習慣をオンにした時に初めてリクエスト

```diff
--- a/aniccaios/aniccaios/Models/UserProfile.swift
+++ b/aniccaios/aniccaios/Models/UserProfile.swift
@@ -99,7 +99,7 @@ struct UserProfile: Codable {
         nudgeIntensity: NudgeIntensity = .default,
         stickyMode: Bool = true,
-        useAlarmKitForWake: Bool = true,
+        useAlarmKitForWake: Bool = false,  // デフォルトOFF、Wake習慣ON時にユーザーに許可を求める
         useAlarmKitForTraining: Bool = false,
         useAlarmKitForBedtime: Bool = false,
         useAlarmKitForCustom: Bool = false
@@ -181,7 +181,7 @@ struct UserProfile: Codable {
         }

         // AlarmKit設定（各習慣ごと）
-        useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? true
+        useAlarmKitForWake = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForWake) ?? false
         useAlarmKitForTraining = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForTraining) ?? false
```

---

## 問題3: Mem0テレメトリーエラー (ETIMEDOUT)

**現状分析:**

- `mem0ai` SDKの内部テレメトリーがタイムアウトエラーを出力
- サーバー (`server.js`) で `unhandledRejection` をキャッチしているが、ログは抑制されていない
- 公式ドキュメントによると `MEM0_TELEMETRY=False` 環境変数で無効化可能

**修正パッチ1:** Railway環境変数に追加（手動設定が必要）

```bash
MEM0_TELEMETRY=False
```

**修正パッチ2:** `apps/api/src/modules/memory/mem0Client.js` - クライアント初期化前にテレメトリー無効化

```diff
--- a/apps/api/src/modules/memory/mem0Client.js
+++ b/apps/api/src/modules/memory/mem0Client.js
@@ -1,3 +1,6 @@
+// Mem0テレメトリーを無効化（ETIMEDOUT エラー回避）
+process.env.MEM0_TELEMETRY = 'False';
+
 import baseLogger from '../../utils/logger.js';
 import { MemoryClient } from 'mem0ai';
 import { Memory as OSSMemory } from 'mem0ai/oss';
```

---

## 問題4: 15分前の通知が来ない

**現状分析:**

- `NotificationScheduler.swift` の `schedulePreReminder()` で `mutable-content` フラグが設定されていない
- Service Extension が呼ばれるには `UNMutableNotificationContent` に `mutableContent = true` を設定する必要がある

**修正パッチ:** `NotificationScheduler.swift`

```diff
--- a/aniccaios/aniccaios/Notifications/NotificationScheduler.swift
+++ b/aniccaios/aniccaios/Notifications/NotificationScheduler.swift
@@ -645,6 +645,9 @@ class NotificationScheduler {
         ]

         // mutable-content を有効化（Service Extension が処理するため）
+        // ★ 重要: Service Extensionが呼ばれるにはこのフラグが必須
+        content.mutableContent = true
+
         if #available(iOS 15.0, *) {
             content.interruptionLevel = .timeSensitive
         }
```

---

## 問題5: 通知メッセージがデフォルトのまま（パーソナライズされない）

**現状分析:**

1. `NotificationService.swift` (Service Extension) で `bestAttemptContent` の代入行が切れている
2. プロファイル情報が `mobile_profiles` から取得されるが、キー名が `profile` であり、`idealTraits` や `problems` は旧形式

**修正パッチ1:** `AniccaNotificationService/NotificationService.swift` - 初期化漏れ修正

```diff
--- a/aniccaios/AniccaNotificationService/NotificationService.swift
+++ b/aniccaios/AniccaNotificationService/NotificationService.swift
@@ -24,7 +24,7 @@ class NotificationService: UNNotificationServiceExtension {
     override func didReceive(_ request: UNNotificationRequest,
                              withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
         self.contentHandler = contentHandler
-
+        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

         guard let bestAttemptContent = bestAttemptContent else {
             contentHandler(request.content)
```

（注: 読んだコードでは `bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)` が既にあるが、行27を確認すると正しく書かれている。通知が来ない主因は `mutableContent = true` の欠落）

**修正パッチ2:** `apps/api/src/routes/mobile/preReminder.js` - プロファイル取得時のフィールド参照修正

```diff
--- a/apps/api/src/routes/mobile/preReminder.js
+++ b/apps/api/src/routes/mobile/preReminder.js
@@ -245,10 +245,10 @@ async function generatePersonalizedMessage({ profileId, habitType, habitName, sc
   const trainingFocus = profile?.trainingFocus || [];
   const trainingGoal = profile?.trainingGoal || '';

-  // ★ idealTraits と problems を追加
-  const idealTraits = profile?.idealTraits || [];
-  const problems = profile?.problems || [];
+  // ★ idealTraits と problems を追加（ideals/strugglesをフォールバック）
+  const idealTraits = profile?.idealTraits || profile?.ideals || [];
+  const problems = profile?.problems || profile?.struggles || [];
```

---

## まとめ

| 問題 | ファイル | 修正内容 |

|------|----------|----------|

| 1. Ideals/Strugglesリスト不一致 | `ProfileView.swift` | オンボーディングと同じリストに変更 |

| 2. AlarmKitダイアログ早期表示 | `UserProfile.swift` | `useAlarmKitForWake` のデフォルトを `false` に |

| 3. Mem0テレメトリーエラー | `mem0Client.js` | `MEM0_TELEMETRY=False` 設定 |

| 4. 15分前通知が来ない | `NotificationScheduler.swift` | `mutableContent = true` 追加 |

| 5. 通知パーソナライズ失敗 | `preReminder.js` | `ideals/struggles` フォールバック追加 |


原因:
英語版 Localizable.strings には "ideal_trait_brave" = "Brave"; がある（行224）
日本語版 Localizable.strings には ideal_trait_brave の翻訳がない
オンボーディングの IdealsStepView.swift で使用しているキー "brave" に対応する ideal_trait_brave が日本語版に存在しないため、キーがそのまま表示されている


--- a/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
+++ b/aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings
@@ -218,6 +218,7 @@ 
 "ideal_trait_patient" = "忍耐強い";
 "ideal_trait_focused" = "集中力";
 "ideal_trait_grateful" = "感謝";
+"ideal_trait_brave" = "勇敢";
 "problem_self_loathing" = "自己嫌悪";
 "problem_rumination" = "反芻";
 "problem_anxiety" = "不安";

### To-dos

- [ ] ProfileView.swift のIdeals/Strugglesリストをオンボーディングと一致させる
- [ ] UserProfile.swift のuseAlarmKitForWakeデフォルト値をfalseに変更
- [ ] mem0Client.js でテレメトリーを無効化
- [ ] NotificationScheduler.swift にmutableContent=true追加
- [ ] preReminder.js のプロファイルフィールド参照修正