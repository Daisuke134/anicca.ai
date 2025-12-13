了解。「この方針で本当にいいのか？」というチェックも含めて、
各ドメインごとの

* state（特徴量）一覧
* action（テンプレ候補）一覧
* reward（成功/失敗ルール）

を **そのまま TECH 用 md に貼れる形**でまとめるね。

ファイル名の提案：

> `tech-nudge-domains-v0.3.md`

としておくと分かりやすいと思う。

以下は v0.3 で扱う 6 ドメイン：

1. Sleep / Rhythm（起床 + 就寝）
2. Morning Phone（起床直後のスマホ依存）
3. Screen / SNS 長時間
4. Movement / Sedentary / Activity
5. Priority Habit Follow-up（やるはずの習慣をやらなかった日の夜）
6. Mental / Feeling（自己嫌悪・不安などの EMA ベース JITAI）

（Sleep と Morning Phone はかなり近いので、内部では同じ “Rhythm” モジュール内に複数 DP として実装してもよい。）

各仕様は、既存JITAI / mHealth の文献と整合するように設計してある。([PMC][1])

---

# tech-nudge-domains-v0.3.md

## 共通：共通 state フィールド

全ドメインで共通して使う state の一部（実装では struct / interface にマージする）

### 共通フィールド

| フィールド名                  | 型        | 説明                                                                                       |          |                  |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------- | -------- | ---------------- |
| `localHour`             | number   | ローカル時刻（0–23）                                                                             |          |                  |
| `dayOfWeek`             | number   | 0=Mon〜6=Sun（bandit では one-hot）                                                           |          |                  |
| `sleepDebtHours`        | number   | 過去7日平均と昨夜の睡眠時間の差（+なら寝不足）([researchprotocols.org][2])                                     |          |                  |
| `snsMinutesToday`       | number   | 今日の SNS/Video 累計分数                                                                       |          |                  |
| `stepsToday`            | number   | 今日の歩数                                                                                    |          |                  |
| `sedentaryMinutesToday` | number   | 今日の座位分数（CoreMotion/HealthKit 集約）([ResearchGate][3])                                      |          |                  |
| `big5`                  | object   | {O,C,E,A,N: 0〜1} Big Five 推定値（アンケート無し、スマホログ＋発話から推定）([reports-archive.adm.cs.cmu.edu][4]) |          |                  |
| `struggles`             | string[] | ["late_sleep","sns_addiction","self_loathing",…] Onboarding で選択したもの                      |          |                  |
| `nudgeIntensity`        | string   | `"quiet"                                                                                 | "normal" | "active"` ユーザー好み |
| `recentFeelingCounts`   | object   | { self_loathing: number, anxiety: number, … } 今日ボタンが押された回数                               |          |                  |

全 state struct は **この共通フィールド + ドメイン固有フィールド** で構成する。

---

## 1. Sleep / Rhythm ドメイン（起床 + 就寝）

### 1.1 DP（Decision Point）

* **起床 DP**

  * `targetWake` = `avgWake7d - 15min`

    * CBT-I の Sleep Restriction や SleepU のように、「過去1週間平均 + 目標差 15〜30分」で就床/起床ウィンドウを調整するのが標準的。([reports-archive.adm.cs.cmu.edu][4])
  * DP 条件:

    * `now` が `targetWake` ± 15分
    * HealthKitの sleepAnalysis で「まだ睡眠中」
    * 手動の「今日は静かにしてほしい」フラグが OFF

* **就寝 DP**

  * `avgBedtime7d` を計算
  * DP 条件:

    * `now` が `avgBedtime7d` − 60〜30分の間
    * 今日の `sleepDebtHours >= 0`（寝不足気味）
    * SNS/Video を 30 分以上連続利用している（DeviceActivity）([PMC][5])

### 1.2 state フィールド

`SleepState`:

| フィールド名                              | 型        | 説明                       |
| ----------------------------------- | -------- | ------------------------ |
| `localHour`                         | number   | 共通                       |
| `dayOfWeek`                         | number   | 共通                       |
| `avgWake7d`                         | number   | 過去7日平均起床時刻（ローカル時間, 0–24） |
| `avgBedtime7d`                      | number   | 過去7日平均就床時刻               |
| `sleepDebtHours`                    | number   | 共通                       |
| `wakeSuccessRate7d`                 | number   | 過去7日間の起床Nudge成功率 (0–1)   |
| `bedtimeSuccessRate7d`              | number   | 過去7日間の就寝Nudge成功率 (0–1)   |
| `snsMinutesLast60min`               | number   | 直近60分のSNS/Video使用分数      |
| `snsLongUseAtNight`                 | boolean  | 深夜帯(22–3時)での長時間SNS使用の有無  |
| `big5`                              | object   | 共通                       |
| `struggles`                         | string[] | 共通（"late_sleep" を含むかなど）  |
| `recentFeelingCounts.self_loathing` | number   | 今日の自己嫌悪感情レポート回数          |

### 1.3 action 候補（テンプレ）

**起床**

| actionId | 説明                                                 |
| -------- | -------------------------------------------------- |
| 0        | 送らない（do_nothing）                                   |
| 1        | gentle_wake: 優しい起床メッセージ（「今日は15分だけ早く起きよう」）          |
| 2        | direct_wake: 率直な呼びかけ（「今起きないと、また同じ朝になる。起きよう。」）      |
| 3        | future_ref_wake: 未来シナリオを引用（「このパターンが続くと1年後も同じ朝になる」） |

**就寝**

| actionId | 説明                                               |
| -------- | ------------------------------------------------ |
| 0        | do_nothing                                       |
| 1        | gentle_bedtime: 優しい就寝リマインド（「そろそろ休もうか」）           |
| 2        | firm_bedtime: 少し強め（「ここでスマホを置かないと、明日がきつくなる」）      |
| 3        | psychoedu_bedtime: 睡眠の科学を混ぜる（「寝る前の光は睡眠質を落とすので…」） |

### 1.4 reward 判定

**起床 reward**

* 成功 = `reward = 1` の条件（「起きた」とみなす）：

  1. Nudge 送信後 30〜60 分以内に

     * HealthKit `sleepAnalysis` で睡眠が終わっている（起床時刻記録）([researchprotocols.org][2])
     * or DeviceActivity の最初の pick-up が `targetWake + 60min` 以内
  2. その後 30 分間で

     * Screen on/off が複数回あり
     * `snsMinutes` が極端に長くない（また別ドメイン）

* 失敗 = `reward = 0`：

  * 上記条件を満たさない。

**就寝 reward**

* 成功:

  1. Nudge 送信後 90 分以内に HealthKit で sleep start が記録される([Preprints][6])
  2. その後 30 分間の SNS/Video使用が 15分未満。

* 失敗: 上記条件を満たさない（夜更かし継続）。

---

## 2. Morning Phone ドメイン（起床直後のスマホ依存）

### 2.1 DP

* HealthKit / DeviceActivity で起床が検知されたあと、
* 起床後 30 分 / 45 分時点に DP。
* 条件:

  * 起床後 30 分間で SNS/Video 使用が 20 分以上。

JITAI の Screen Time 系研究でも、30 分程度のしきい値で中断を促す介入が多い。([OUP Academic][7])

### 2.2 state フィールド

`MorningPhoneState`:

| フィールド名                 | 型        | 説明          |
| ---------------------- | -------- | ----------- |
| `timeSinceWakeMinutes` | number   | 起床からの経過分数   |
| `snsMinutesSinceWake`  | number   | 起床後の SNS 分数 |
| `sleepDebtHours`       | number   | 共通          |
| `big5`                 | object   | 共通          |
| `struggles`            | string[] | 共通          |

### 2.3 action 候補

| actionId | 説明                                                                 |
| -------- | ------------------------------------------------------------------ |
| 0        | do_nothing                                                         |
| 1        | gentle_morning_break: 「起きたばかりだから、まずは顔を洗おう」                         |
| 2        | focus_morning: 「この30分を“一番クリアな時間”にしよう。スマホを置いて、今日やりたいことを1つだけ書いてみよう。」 |

### 2.4 reward 判定

* 成功:

  * Nudge 後 5 分以内に SNS/Video アプリが閉じられ、
  * 次の 10〜15 分間 SNS/Video が再開されない。([OUP Academic][7])

* 失敗:

  * SNS/Video の使用がそのまま続く or すぐ再開される。

---

## 3. Screen / SNS 長時間ドメイン

### 3.1 DP

* DeviceActivity で選択された SNS / Video アプリ群について、
* 「連続使用 30 分」「連続使用 60 分」の閾値 DP。

Time2Stopや他のスマホ overuse 介入でも、20〜30 分／1時間などをしきい値にして Nudge を出している。([arXiv][8])

### 3.2 state フィールド

`ScreenState`:

| フィールド名                     | 型        | 説明                  |
| -------------------------- | -------- | ------------------- |
| `snsCurrentSessionMinutes` | number   | 今回の連続利用時間           |
| `snsMinutesToday`          | number   | 今日の総SNS分数           |
| `sleepDebtHours`           | number   | 共通                  |
| `timeOfDay`                | number   | localHour           |
| `big5`                     | object   | 共通                  |
| `struggles`                | string[] | 共通                  |
| `recentFeelingCounts`      | object   | 共通（self_loathing 等） |

### 3.3 action 候補

| actionId | 説明                                                 |
| -------- | -------------------------------------------------- |
| 0        | do_nothing                                         |
| 1        | gentle_sns_break: 「もう30分見続けているよ。一度手を離して、目と心を休めよう。」 |
| 2        | direct_sns_stop: 「この時間が積み重なると、1年後も同じ毎日になる。ここで切ろう。」 |
| 3        | mindful_reflection: 「今スクロールしているのは、何から逃げたいからだろう？」   |

### 3.4 reward 判定

* 成功 = `1`:

  * Nudge 後 5 分以内に対象アプリを閉じる AND
  * 次の 10〜30 分間、対象カテゴリアプリが起動しない。([OUP Academic][7])

* 失敗 = `0`:

  * 閉じない or 閉じてもすぐ再開。

---

## 4. Movement / Sedentary / Activity ドメイン

### 4.1 DP

Sedentary JITAI のレビューでは、

* 60 分〜90 分の座位継続を検知し、5 分程度の break を促す設計が一般的。([PMC][9])

ここでは：

* 座位継続 90 分を DP とする（将来 60〜90 分の調整幅も考慮）。

### 4.2 state フィールド

`MovementState`:

| フィールド名                    | 型        | 説明                |
| ------------------------- | -------- | ----------------- |
| `sedentaryMinutesCurrent` | number   | 現在の連続座位分数         |
| `sedentaryMinutesToday`   | number   | 今日の座位合計           |
| `stepsToday`              | number   | 今日の歩数             |
| `recentActivityEvents`    | JSON     | 直近の歩行/ランニングイベント   |
| `sleepDebtHours`          | number   | 共通                |
| `big5`                    | object   | 共通                |
| `struggles`               | string[] | 共通（"sedentary" 等） |

### 4.3 action 候補

| actionId | 説明                                            |
| -------- | --------------------------------------------- |
| 0        | do_nothing                                    |
| 1        | short_break: 「90分座りっぱなし。1〜2分だけ立ち上がって、伸びをしよう。」 |
| 2        | walk_invite: 「この5分で、部屋の中を歩き回ってみよう。」           |

### 4.4 reward 判定

* 成功:

  * Nudge 後 30 分以内に

    * 歩数が +300〜500 以上増加
    * CoreMotion の `walking` or `running` イベントが検出される([PMC][9])

* 失敗:

  * 歩数・ Activity 状態がほぼ変化なし。

---

## 5. Priority Habit Follow-up ドメイン

### 5.1 DP

* ユーザーが「優先習慣」として設定したもの（例: 瞑想, 筋トレ, ランニング）。
* DP:

  * その日の終わり（21〜23時）に

    * 「その習慣が今日一度も行われていない」ことが metrics から判明したとき。

### 5.2 state フィールド

`HabitState`:

| フィールド名               | 型        | 説明                                    |
| -------------------- | -------- | ------------------------------------- |
| `habitId`            | string   | "meditation", "running", "strength" 等 |
| `habitMissedStreak`  | number   | 連続未達日数                                |
| `habitSuccessStreak` | number   | 連続達成日数                                |
| `localHour`          | number   | 共通                                    |
| `big5`               | object   | 共通                                    |
| `struggles`          | string[] | 共通                                    |

### 5.3 action 候補

| actionId | 説明                                                  |
| -------- | --------------------------------------------------- |
| 0        | do_nothing                                          |
| 1        | gentle_habit_reminder: 「今日は瞑想はできなかったね。明日は1分から始めよう。」 |
| 2        | plan_tomorrow: 「明日のいつ、その習慣を入れるか、一緒に決めよう。」           |

### 5.4 reward 判定

ここだけ少し長期的な reward になるので、v0.3 では「翌日 or 翌回 DP での成功」で近似する。

* 成功:

  * 翌日、その習慣が達成された場合 → reward=1
* 失敗:

  * 翌日も未達成 → reward=0

v0.3では **ログだけとっておき、bandit更新は v0.3.5 以降でもOK**。
最初はルールベース（未達連続なら gentle → plan テンプレ）でも十分。

---

## 6. Mental / Feeling EMI ドメイン（EMA ベース bandit）

### 6.1 DP

* ユーザーが Talk の Feeling ボタンを押した瞬間。

例:

* `feelingId = "self_loathing"`
* `feelingId = "anxiety"`
* `feelingId = "anger"`
* `feelingId = "jealousy"` …

### 6.2 state フィールド

`MentalState`:

| フィールド名                 | 型        | 説明                                                    |
| ---------------------- | -------- | ----------------------------------------------------- |
| `localHour`            | number   | 現在時刻                                                  |
| `dayOfWeek`            | number   | 共通                                                    |
| `feelingId`            | string   | "self_loathing" 等                                     |
| `recentFeelingCount`   | number   | 今日この feeling を押した回数                                   |
| `recentFeelingCount7d` | number   | 過去7日間の押下回数                                            |
| `sleepDebtHours`       | number   | 共通                                                    |
| `snsMinutesToday`      | number   | 共通                                                    |
| `ruminationProxy`      | number   | 0〜1（深夜SNS + mem0の反芻発言数から計算）([formative.jmir.org][10]) |
| `big5`                 | object   | 共通                                                    |
| `struggles`            | string[] | 共通                                                    |

### 6.3 action 候補（テンプレ）

Feelingごとに持つが、形式は共通。

例：`feelingId = "self_loathing"` の場合

| actionId | 説明                                                   |
| -------- | ---------------------------------------------------- |
| 0        | do_nothing（Feeling ボタンでは基本使わないが bandit のために残す）       |
| 1        | soft_self_compassion: 「まずは、ここまでやってきた自分を責めるのを一旦やめよう」  |
| 2        | cognitive_reframe: 「何が事実で、何が“自分への評価”なのか、一緒に分けてみよう」   |
| 3        | behavioral_activation_micro: 「この後5分だけ、何か一つだけ片付けてみよう」 |
| 4        | metta_like: 「君が幸せでありますように…」系の慈悲のことば                  |

### 6.4 reward 判定（EMA ベース）

文献: rumination-focused CBT JITAI では、反芻スコアの EMA 変化を成果指標としている。([ResearchGate][11])

Anicca v3:

* セッション終了時、1問だけ質問：

  > 「さっきより少し楽になった？」
  > （はい / いいえ）

* `emaBetter = true` → `reward = 1`

* `emaBetter = false` → `reward = 0`

→ これを `MentalBandit.update(state, actionId, reward)` に渡す。

### 6.5 流れ

1. Feeling ボタン押下 → `/mental/feeling/start` に `userId` & `feelingId` が飛ぶ。
2. サーバ側で `MentalState` を構築し、bandit から `templateId` を選ぶ。
3. mem0 から関連エピソード（interaction / behavior_summary）を検索し、LLM に渡して script を生成。
4. Talk セッション中は Realtime で音声対話。
5. 終了時に `/mental/feeling/end` で `emaBetter` と `sessionSummary` を受け取り、

   * `reward` を計算
   * bandit を update
   * mem0 にセッション要約を保存。

---

この `tech-nudge-domains-v0.3.md` を置いておけば、

* どのドメインで
* どんな state を作り
* どんな action 候補を bandit に渡し
* どう reward を判定するか

が、実装側から見てかなりクリアになるはず。

あとはこれをもとに、
それぞれ

* `features.build<Domain>State`
* `policy.<Domain>Bandit.selectAction/update`
* `reward.compute<Domain>Reward`

を1ファイルずつ定義していけば、そのまま v0.3 の実装に突入できると思う。

[1]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12177897/?utm_source=chatgpt.com "Designing digital health interventions with causal inference ..."
[2]: https://www.researchprotocols.org/2025/1/e64023?utm_source=chatgpt.com "Efficacy of a Personalized Mobile Health Intervention ..."
[3]: https://www.researchgate.net/publication/332205632_A_systematic_review_of_just-in-time_adaptive_interventions_JITAIs_to_promote_physical_activity?utm_source=chatgpt.com "A systematic review of just-in-time adaptive interventions ..."
[4]: https://reports-archive.adm.cs.cmu.edu/anon/hcii/CMU-HCII-21-104.pdf?utm_source=chatgpt.com "Exploring AI-based personalization of a mobile health ..."
[5]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10029815/?utm_source=chatgpt.com "Screen Media Overuse and Associated Physical, Cognitive ..."
[6]: https://www.preprints.org/manuscript/202205.0029/v1/download?utm_source=chatgpt.com "Context-Aware Sleep Health Recommender Systems ( ..."
[7]: https://academic.oup.com/abm/article/52/6/446/4733473?utm_source=chatgpt.com "Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health"
[8]: https://arxiv.org/html/2403.05584v1?utm_source=chatgpt.com "Time2Stop: Adaptive and Explainable Human-AI Loop for ..."
[9]: https://pmc.ncbi.nlm.nih.gov/articles/PMC6448257/?utm_source=chatgpt.com "A systematic review of just-in-time adaptive interventions ..."
[10]: https://formative.jmir.org/2023/1/e37270?utm_source=chatgpt.com "Assessment and Disruption of Ruminative Episodes to ..."
[11]: https://www.researchgate.net/publication/364706729_Assessment_and_Disruption_of_Ruminative_Episodes_to_Enhance_Mobile_CBT_Just-in-Time_Adaptive_Interventions_in_Clinical_Depression_Pilot_Randomized_Controlled_Trial_Preprint?utm_source=chatgpt.com "(PDF) Assessment and Disruption of Ruminative Episodes ..."
