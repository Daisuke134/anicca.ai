# v1.5.1 通知バグ調査レポート

## 調査日: 2026-01-30

## ユーザー報告

- Day 2 のユーザーが**ルールベースの通知しか受け取っていない**（LLM なし）
- 6:30 AM に**3つの通知が同時に届く**
- 深夜 **2:30 AM / 3:30 AM** に通知が届く
- 1日の中で**同じ通知が何回も繰り返される**
- Production の Railway deploy log に cron 実行ログが見当たらない

---

## 特定した問題

### P1: Production Cron (`nudge-cronp`) が動いていない可能性（CRITICAL）

**症状:** Day 2 ユーザーが全てルールベースの通知を受信。LLM コンテンツがゼロ。

**証拠:**
- 受信した通知テキストを全て `Localizable.strings` で発見（ルールベース確定）
- Production の deploy log に cron 実行ログなし

| 通知テキスト | Localizable.strings キー |
|-------------|------------------------|
| "This moment of weakness doesn't define you." | `nudge_porn_addiction_notification_8` |
| "Every reason not to do it is an excuse." | `nudge_procrastination_notification_3` |
| "Return to Now" | `problem_rumination_notification_title` |
| "The thought is not you, let it pass." | `nudge_obsessive_notification_1` |
| "Get up now" | `problem_cant_wake_up_notification_title` |
| "Forgive yourself" | `problem_self_loathing_notification_title` |
| "Put the phone down" | `problem_staying_up_late_notification_title` |

**原因候補:**
1. `nudge-cronp` に `CRON_MODE=nudges` 環境変数が未設定
2. cron スケジュール (`0 20 * * *`) が実行されていない
3. OpenAI API キーが Production に未設定 → LLM 失敗 → ルールベースフォールバック

**確認方法:** Railway Dashboard で `nudge-cronp` のログ・環境変数を確認

---

### P2: 深夜 2-3 AM に通知が届く（HIGH）

**原因:** カスケード効果

- 各 ProblemType に5スロット → 3問題選択 = 15スロット
- 夜間 20:00-23:00 にスロット集中
- 60分間隔 enforcement が後ろにシフトし続ける
- `ProblemType.swift:59-61` で `validTimeRange` が `nil`（時間制限なし）

```
22:30 → 23:30 → 00:30 → 01:30 → 02:30 → 03:30
```

**修正方針:** `validTimeRange` に時間制限追加（例: 6:00-23:30）。範囲外はスキップ。

---

### P3: 6:30 AM に3つの通知が同時到着（HIGH）

**原因:**
- `cantWakeUp`: 6:00, 6:15, 6:30 スロット（wake window で 15分間隔許可）
- `anxiety`: 6:30 スロット
- 複数問題タイプが同じ時刻に重なる

**修正方針:**
- wake window 以外は最低30分間隔を保証
- 同一時刻に複数通知をスケジュールしない

---

### P4: 同じ通知が1日に何回も繰り返される（MEDIUM）

**原因:**
- Thompson Sampling が各スロットで独立実行（クロススロット重複排除なし）
- LLMNudgeCache の `cacheByHour` キーが hour レベル（minute 無視）で衝突
- Day 1 ルールベースで 10/13 問題タイプが同一デフォルトメッセージ

**修正方針:**
- Thompson Sampling に「今日使用済みバリアント」トラッキング追加
- `cacheByHour` のキー設計修正

---

## 修正優先順位

| # | 問題 | 優先度 | 修正対象 | 複雑度 |
|---|------|--------|---------|--------|
| 1 | Production cron 未実行 | CRITICAL | Railway 設定 / API | Low |
| 2 | 深夜通知 | HIGH | `ProblemType.swift` | Low |
| 3 | 同時通知 | HIGH | `ProblemNotificationScheduler.swift` | Medium |
| 4 | 通知内容重複 | MEDIUM | `NudgeContentSelector.swift` + `LLMNudgeCache.swift` | Medium |

## 次のステップ

1. Railway Dashboard で `nudge-cronp` の状態確認（環境変数、ログ）
2. 上記問題の修正を実装（v1.5.1 としてリリース）
3. iOS 側とサーバー側の修正を分離して進める
