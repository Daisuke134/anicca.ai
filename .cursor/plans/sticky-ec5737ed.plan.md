<!-- ec5737ed-48ca-4bf3-8fca-488cb99fad4b fecaf849-b629-491e-9b4b-7fbee438ef26 -->
# Stickyモードの4秒→5秒変更とパッチ案

## 現状の挙動整理

- Sticky関連ロジックは `VoiceSessionController` の `handleRealtimeEvent(_:)` 内で実装されています。
- Realtime API から `"response.done"` イベントを受け取ったとき、Sticky が有効なら次のような処理をしています：
  - ログに「4s 後に次をスケジュール」と出力。
  - `Task.sleep(nanoseconds: 4_000_000_000)` で **4秒待機**。
  - その間に `stickyActive` が `false` になっていなければ `sendWakeResponseCreate()` を呼び、Anicca に次の発話をさせる。
- `"response.done"` は Anicca 側のレスポンス生成が完了したタイミングで送られるイベントなので、
  - 「Anicca が話し終わる（レスポンス生成完了）→ 4秒待つ → 次の発話用の `response.create` を送る」という流れになっています。
  - 実際の音声再生の終わりとは数百 ms 程度のズレがあり得ますが、ユーザー体感としては「話し終わってから約4秒後」に近い挙動です。
- Sticky の解除条件は `"input_audio_buffer.speech_stopped"` イベントで `stickyUserReplyCount` をインクリメントし、
  - `stickyUserReplyCount >= stickyReleaseThreshold`（現在は 5）になったら `stickyActive = false` にする、という形です。
  - つまり、あなたが **何も喋らなければカウントは増えず**、Sticky は有効なままなので、
    - Anicca が話す → `response.done` → 4秒待つ → また `response.create` → 話す… というループが続きます。

## 変更方針

- Sticky のロジック自体（何回で解除されるか等）はそのままにして、
  - **待ち時間だけ 4秒 → 5秒 に変更**します。
- 具体的には、次の 3 か所を 4 → 5 に揃えます：
  - ログ文言（`scheduling next in 4s`）
  - 実際のスリープ時間（`4_000_000_000` ns）
  - キャンセル時ログ（`cancelled during 4s delay`）

## 提案パッチ（diff 形式・チャット用）

対象ファイル: [`aniccaios/aniccaios/VoiceSessionController.swift`](/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/VoiceSessionController.swift) の `handleRealtimeEvent(_:)` 内 `case "response.done":` 付近。

```diff
-        case "response.done":
-            if stickyActive {
-                logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 4s")
-                print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 4s")
-                Task { @MainActor in
-                    try? await Task.sleep(nanoseconds: 4_000_000_000)
-                    guard self.stickyActive else {
-                        self.logger.info("Sticky: cancelled during 4s delay (stickyActive=false)")
-                        return
-                    }
-                    self.sendWakeResponseCreate()
-                }
-            }
+        case "response.done":
+            if stickyActive {
+                logger.info("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
+                print("Sticky \(self.stickyUserReplyCount)/\(self.stickyReleaseThreshold): response.done → scheduling next in 5s")
+                Task { @MainActor in
+                    try? await Task.sleep(nanoseconds: 5_000_000_000)
+                    guard self.stickyActive else {
+                        self.logger.info("Sticky: cancelled during 5s delay (stickyActive=false)")
+                        return
+                    }
+                    self.sendWakeResponseCreate()
+                }
+            }
```

## 反映後の想定挙動

- あなたが黙っている場合：
  - Anicca が Sticky モードで話し終わる → 約5秒待つ → 次の発話 → … を繰り返します。
- あなたが話した場合：
  - `input_audio_buffer.speech_stopped` が入るたびにカウントが 1 増え、5回目で Sticky が解除されます。
  - Sticky 解除後は `response.done` が来ても `stickyActive == false` なので、自動で次の発話は作られません。

このパッチをそのまま `VoiceSessionController.swift` に適用すれば、4秒待ちが5秒待ちに変わります。

### To-dos

- [ ] VoiceSessionController.handleRealtimeEvent(_:) 内で Sticky モードのタイマー起点と4秒待ちロジックを確認する。
- [ ] response.done ハンドラ内の4秒待ち（ログ/スリープ/キャンセルログ）をすべて5秒に変更する。

---

## 通知タップ時に対話が始まらない問題（custom習慣）

### 現状

- `NotificationScheduler` の通知IDは以下の形式で発行されている：
  - デフォルト習慣: `"HABIT_MAIN_<habit.rawValue>_..."` / `"HABIT_FOLLOW_<habit.rawValue>_..."`
  - カスタム習慣: `"HABIT_CUSTOM_MAIN_<uuid>_..."` / `"HABIT_CUSTOM_FOLLOW_<uuid>_..."`
- 現状の `habit(fromIdentifier:)` は `parts[2]` を `HabitType(rawValue:)` に渡すため、カスタム習慣IDでは `parts[2] == "MAIN"` となり `nil` になる。
- 結果として、custom習慣の通知をタップしても `prepareForImmediateSession(habit:)` が呼ばれず対話が始まらない。

### 方針

- `"HABIT_CUSTOM_..."` 形式のIDはすべて `.custom` にマップする。

### 擬似パッチ

対象ファイル: `aniccaios/aniccaios/Notifications/NotificationScheduler.swift`

```swift
func habit(fromIdentifier identifier: String) -> HabitType? {
    let parts = identifier.split(separator: "_")
    guard parts.count >= 3, parts[0] == "HABIT" else { return nil }

    // カスタム習慣: HABIT_CUSTOM_MAIN_..., HABIT_CUSTOM_FOLLOW_... は .custom にマップ
    if parts.count >= 2, parts[1] == "CUSTOM" {
        return .custom
    }

    // デフォルト習慣: HABIT_MAIN_wake_..., HABIT_FOLLOW_bedtime_...
    return HabitType(rawValue: String(parts[2]))
}
```

---

## AlarmKitフォアグラウンド時の8秒サウンドを無効化

### 現状

- iOS 26以上 + AlarmKit ON の場合、アプリがフォアグラウンド時に `playAlarmSoundInApp()` で8秒サウンドを再生している。
- 対話開始時に二重にアラームが鳴るだけで意味がない。

### 方針

- フォアグラウンド時の追加サウンド再生を無効化する。

### 擬似パッチ

対象ファイル: `aniccaios/aniccaios/Notifications/AlarmKitHabitCoordinator.swift`

```swift
// startAlarmMonitoring() 内
if case .alerting = alarm.state {
    let habit = await MainActor.run {
        self.findHabitForAlarmId(alarm.id)
    }
    await MainActor.run {
        self.currentAlertingHabit = habit
        // フォアグラウンド時でも、ここでは追加のアプリ内サウンドを鳴らさない。
        // アラーム音は AlarmKit / システム側の挙動に任せ、対話開始時は Anicca の音声だけにする。
    }
    break
}
```

---

## カスタム習慣のAlarmKitデフォルトをOFFにする

### 現状

- 初期値は `false` だが、既存ユーザーが以前に ON にしていた場合、サーバーやローカル保存から `true` が読み込まれる可能性がある。

### 方針

- 既存ユーザーも含めて、カスタム習慣の AlarmKit は一度 OFF にリセットする（マイグレーション）。

### 擬似パッチ

対象ファイル: `aniccaios/aniccaios/Models/UserProfile.swift`

```swift
// init(from decoder:) 内
useAlarmKitForCustom = try container.decodeIfPresent(Bool.self, forKey: .useAlarmKitForCustom) ?? false

// カスタム習慣のAlarmKitは常にOFFから始める（既存ユーザーも含めてリセット）
useAlarmKitForCustom = false
```

---

## 習慣タブのトグルOFF時のアニメーション無効化

### 現状

- トグルOFF時にリストの行が消えるため、SwiftUIの `List` がアニメーション付きで行削除を行う。
- 「パシュー」とした変なエフェクトになっている。

### 方針

- トグルOFF時の状態更新をアニメーション無効化する。

### 擬似パッチ

対象ファイル: `aniccaios/aniccaios/Habits/HabitsSectionView.swift`

```swift
// habitRow 内の Toggle
set: { isOn in
    if isOn {
        ...
    } else {
        withAnimation(.none) {
            activeHabits.remove(habit)
            habitTimes.removeValue(forKey: habit)
        }
        appState.removeHabitSchedule(habit)
    }
}

// customHabitRow 内の Toggle も同様
set: { isOn in
    if isOn {
        ...
    } else {
        withAnimation(.none) {
            activeCustomHabits.remove(id)
            customHabitTimes.removeValue(forKey: id)
        }
        appState.updateCustomHabitSchedule(id: id, time: nil)
    }
}
```