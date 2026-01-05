## 最終版オンボーディング

| # | ステップ | 内容 |
|---|----------|------|
| 1 | welcome | ウェルカム |
| 2 | value | What Anicca Can Do |
| 3 | source | Where did you hear about us? |
| 4 | gender | What's your gender? |
| 5 | age | How old are you? |
| 6 | ideals | Ideal Self選択 |
| 7 | struggles | Current Struggles選択 |
| 8 | habitSetup | 習慣・時間設定 |
| 9 | **review** | **評価リクエスト** |
| 10 | account | Sign in with Apple |
| 11 | notifications | 通知許可 |
| 12 | alarmkit | アラーム許可 |
| 13 | **paywall** | **Paywall（最後）** |
| 14 | completion | 完了 |

---

## フロー図

```
質問群（離脱しにくい）
  ↓
habitSetup（習慣設定）
  ↓
review（評価リクエスト）← Life Resetと同じタイミング
  ↓
account（Sign in with Apple）
  ↓
notifications / alarmkit（権限）
  ↓
Paywall（最後）
  ↓
completion（完了）
```

---

**この構成で実装を進めていいですか？**

ーーー
3つの質問にそれぞれ答えます。

---

## 1. Todoリスト（ベストプラクティス優先版）

**考え方**: まずベストプラクティスで最適化 → その後ステップ計測

| 順番 | タスク | Jake Mor | 詳細 |
|------|--------|----------|------|
| 1 | **オンボーディングフロー設計** | #28-30 | Life Reset参考に構成を決定 |
| 2 | **個人情報をPaywall後に移動** | #29 | 名前・プロフィール入力はPaywall後 |
| 3 | **ステップ順序の最適化** | #30 | 離脱しにくい質問を前に |
| 4 | **オンボ直後の評価リクエスト** | #26 | SKStoreReviewController追加 |
| 5 | **Paywall閉じた時のサーベイ** | #33 | Superwall Survey機能 |
| 6 | **ステップ完了率の計測** | #28 | 各ステップでMixpanelイベント |
| 7 | **データ分析・改善** | #30 | 計測結果に基づいて調整 |

---

## 2. Life Resetオンボーディング文字起こし

スクショを順番に整理しました：

| # | 画面 | 質問 | 選択肢 |
|---|------|------|--------|
| 1 | 性別 | What's your gender? | Male / Female / Other / Prefer not to answer |
| 2 | 現状 | How would you describe your current life? | I'm satisfied with my life now / I'm alright and want to self-improve / I'm doing okay, not good or bad / I'm often sad and rarely happy / I'm at the lowest and need help |
| 3 | 理由A | What is the biggest reason you want to reset your life? | Lack motivation and discipline / Improve my study and career / Quit porn addiction and improve life / Build muscle and get fit / Overcome major life setbacks |
| 4 | 年齢 | How old are you? | 13-17 / 18-24 / 25-34 / 35-44 / 45-54 / 55 or above |
| 5 | 流入元 | Where did you hear about our app? | Instagram / Twitter / TikTok / Facebook / Youtube / Friends |
| 6 | 理由B | What is the biggest reason you want to reset your life? | Fix my bad habits and discipline / Manage my stress and mental health / Improve my productivity and work / Improve physical health and look / Improve my study and grades / Stay closer to my faith and religion |
| 7 | 自己肯定 | What's the last time you were proud of yourself? | Just today / Few days ago / Few weeks ago / Few months ago / Too long I can't remember |
| 8 | モチベーション | What gets you out of bed every morning? | Make money to support my needs / To not get fired or expelled / To provide for my family / Achieve my goals and dreams / I don't really know / None of the above |
| 9 | 依存症 | Are you addicted to any one of the below? | Smoking or vaping / Pornography / Alcohol / Video game / Junk food / More than one of the above / None of the above |
| 10 | 変化段階 | Where are you now in your transformation journey? | I am not sure if I need to change yet / I know I need to change but still thinking / I am ready to commit and start soon / I am very ready to make big changes / I've already started building better habits |
| 11 | 期待 | How quickly do you want to see results? | In a day / In a few days / In a week / In two weeks / In a month / In a few months |
| 12 | 共感A | Do you relate to the statement? "I want to reflect more often" | No / Yes |
| 13 | 共感B | Do you relate to the statement? "I want to challenge myself and do difficult things" | No / Yes |
| 14 | 社会的証明 | After 66 days, you'll overcome the setback. [グラフ] The average Life Reset members showed 348% improvement in physical, mental well-being and focus. [レビュー] Jake, 22: "Life Reset keeps me on track..." | Got it |
| 15 | 通知設定 | Get daily notifications to keep motivated | Stay on track (ON) / Daily ritual / Weekly Recap |
| 16 | 評価リクエスト | Help us build our vision. 1M+ members. [SKStoreReviewController表示] | 星評価 / Not Now → Get my program |

**特徴**:
- 約16ステップ（長い）
- 質問形式が多い（サンクコスト効果）
- 流入元を聞いている（アトリビューション）
- 社会的証明（グラフ + レビュー）をPaywall前に表示
- 通知設定をPaywall前に表示
- **評価リクエストをPaywall直前に表示**（Jake Mor #26）
---

## 現在のオンボーディングコード確認

習慣設定の画面があるか確認します。

[2 tools called]

現在のオンボーディングを確認しました。

**現在のステップ**:
1. welcome
2. value（What Anicca Can Do）
3. account（Sign in with Apple）
4. ideals（Ideal Self選択）
5. struggles（Current Struggles選択）
6. notifications（通知許可）
7. alarmkit（アラーム許可）

**HabitSetupStepViewは存在するが、OnboardingStepには含まれていない**（削除された模様）

OnboardingFlowViewで実際のフローを確認します：

[1 tool called]

現在のオンボーディングフローを確認しました。

---

## 現在のAniccaオンボーディング

| # | ステップ | 内容 |
|---|----------|------|
| 1 | welcome | ウェルカム画面 |
| 2 | value | What Anicca Can Do |
| 3 | account | **Sign in with Apple** |
| 4 | ideals | Ideal Self選択 |
| 5 | struggles | Current Struggles選択 |
| 6 | notifications | 通知許可 |
| 7 | alarmkit | アラーム許可（iOS 26+） |
| → | **Paywall** | onboarding_complete placement発火 |

**HabitSetupStepViewは存在するが、フローから削除されている**

---

## Jake Morの推奨 vs 現状

| Jake Mor | 現状 | 対応 |
|----------|------|------|
| #29: 個人情報はPaywall後 | Sign in with AppleはPaywall前 | 要検討 |
| #26: オンボ直後に評価リクエスト | 評価リクエストなし | 追加必要 |
| #33: Paywall閉じた時サーベイ | なし | Superwall Survey追加 |
| #30: 離脱しにくいステップを前に | 不明 | 計測後に調整 |

**注意**: Sign in with AppleをPaywall後に移動すると、SuperwallのユーザーIDが使えない問題がある。これは別途検討が必要。

---

## Life Reset参考 改善案

Life Resetの良い点をAniccaに取り入れる：

| 追加すべき要素 | Life Resetでの例 | Aniccaでの適用 |
|---------------|------------------|----------------|
| 流入元質問 | Where did you hear about our app? | Instagram/TikTok/YouTube/Twitter/Friends/Other |
| 変化段階質問 | Where are you now in your transformation journey? | 「変化への準備段階」を聞く |
| 社会的証明 | 348% improvement + レビュー | 統計 + ユーザーレビュー画面 |
| 評価リクエスト | Paywall直前に表示 | SKStoreReviewController追加 |
| 習慣設定 | （Life Resetにはないが） | HabitSetupStepView復活 |

---

## 改訂版Todoリスト（オンボーディング最適化）

| 順番 | タスク | 詳細 | 実行者 |
|------|--------|------|--------|
| 1 | **オンボーディングフロー再設計** | Life Reset参考に構成決定 | Agent + User |
| 2 | **流入元質問追加** | アトリビューション計測用 | Agent（コード） |
| 3 | **HabitSetupStepView復活** | 習慣と時間を設定 | Agent（コード） |
| 4 | **社会的証明画面追加** | 統計 + レビュー表示 | Agent（コード） |
| 5 | **評価リクエスト追加** | Paywall直前にSKStoreReviewController | Agent（コード） |
| 6 | **Paywall閉じた時サーベイ** | Superwall Survey設定 | User（ダッシュボード） |
| 7 | **ステップ完了率計測** | 各ステップでMixpanelイベント | Agent（コード） |
| 8 | **データ分析・改善** | 計測結果に基づいて調整 | User + Agent |

---

**この計画で進めていいですか？** まずはフロー設計を決めてから実装に入ります。

ーーー
## 決定と理由

### Jake Mor #28-29の解釈

Jake Morの教えを整理すると：

| # | 教え | ポイント |
|---|------|---------|
| #28 | 長いオンボーディング = Paywallコンバージョン率向上（サンクコスト効果） | オンボを短くしすぎない |
| #29 | 名前、年齢、メール、電話番号、アプリ権限 = 離脱率が高い → Paywall後に | **離脱しやすいもの**を後に |

**重要な区別**:
- 「離脱しやすい」= テキスト入力、詳細な個人情報、強制的な権限リクエスト
- 「離脱しにくい」= 選択式質問、ワンタップ認証、機能説明付き権限

Life ResetやFinchがPaywallを最後に持ってくるのは、**質問を「離脱しにくい選択式」で設計しているから**。

---

## 決定：Paywall最後スタイル採用

**理由**:
1. Life Reset/Finchなど成功アプリがこのスタイル
2. サンクコスト効果を最大化できる
3. 質問を選択式にすれば離脱しにくい
4. 価値を十分に伝えてからPaywallを見せる

**ただし**:
- 詳細な習慣設定（時間選択）はPaywall後に移動
- テキスト入力はPaywall後に移動

---

## 現在のオンボーディング vs 改善版

### 現在（7ステップ）

| # | ステップ | 離脱リスク |
|---|----------|-----------|
| 1 | welcome | 低 |
| 2 | value（What Anicca Can Do） | 低 |
| 3 | **account（Sign in with Apple）** | 中 |
| 4 | ideals（Ideal Self選択） | 低 |
| 5 | struggles（Current Struggles選択） | 低 |
| 6 | notifications（通知許可） | 高 |
| 7 | alarmkit（アラーム許可） | 高 |
| → | **Paywall** | - |

**問題点**:
- 権限リクエストがPaywall前にある
- 流入元質問がない
- 評価リクエストがない
- 社会的証明がない

---

### 改善版（10ステップ）

| # | ステップ | 内容 | 離脱リスク | 目的 |
|---|----------|------|-----------|------|
| 1 | welcome | ウェルカム | 低 | 導入 |
| 2 | value | What Anicca Can Do | 低 | 価値説明 |
| 3 | source | Where did you hear about us? | **低（選択式）** | アトリビューション |
| 4 | account | Sign in with Apple | 中 | ユーザー識別 |
| 5 | ideals | Ideal Self選択 | 低 | パーソナライズ |
| 6 | struggles | Current Struggles選択 | 低 | パーソナライズ |
| 7 | readiness | 変化への準備段階（Life Reset参考） | **低（選択式）** | サンクコスト |
| 8 | proof | 社会的証明（将来追加） | 低 | コンバージョン向上 |
| 9 | review | **評価リクエスト** | 低 | レビュー獲得 |
| → | **Paywall** | Superwall表示 | - | - |
| 10 | notifications | 通知許可 | 高 | **Paywall後** |
| 11 | alarmkit | アラーム許可 | 高 | **Paywall後** |
| 12 | habitSetup | 習慣・時間設定 | 高 | **Paywall後** |
| 13 | completion | 完了 | 低 | - |

---

## なぜこの順番か

```
【Paywall前】離脱しにくいもの
1. welcome → 導入、離脱なし
2. value → 価値を伝える
3. source → 選択式、アトリビューション計測
4. account → Sign in with Appleはワンタップ
5. ideals → 選択式、パーソナライズ
6. struggles → 選択式、パーソナライズ
7. readiness → 選択式、サンクコスト効果
8. proof → 社会的証明でコンバージョン向上
9. review → 評価リクエスト（Jake Mor #26）

【Paywall】
→ サンクコスト効果 + 社会的証明 + 評価後 = コンバージョン最大

【Paywall後】離脱しやすいもの
10. notifications → 権限リクエスト
11. alarmkit → 権限リクエスト
12. habitSetup → 詳細設定（時間選択）
13. completion → 完了
```

---

## Sign in with Appleの位置について

**Paywall前に残す理由**:
1. SuperwallのユーザーIDにApple User IDが必要
2. ワンタップなので離脱リスクは中程度
3. Paywallでの購入にユーザー識別が必要

**代替案**（Sign in with AppleをPaywall後にする場合）:
- 匿名のデバイスIDでSuperwallを識別
- Paywall後にSign in with Appleで識別を統合

→ 今はシンプルにPaywall前に残す。データを見て調整。

---

## 実装計画

| 順番 | タスク | 詳細 |
|------|--------|------|
| 1 | **OnboardingStep enum更新** | 新ステップ追加 |
| 2 | **SourceStepView作成** | 流入元質問（選択式） |
| 3 | **ReadinessStepView作成** | 変化準備段階（選択式） |
| 4 | **ReviewStepView作成** | 評価リクエスト |
| 5 | **権限リクエストをPaywall後に移動** | notifications, alarmkit |
| 6 | **HabitSetupStepView復活** | Paywall後に配置 |
| 7 | **OnboardingFlowView更新** | 新しい順序に変更 |
| 8 | **ステップ完了計測追加** | 各ステップでMixpanelイベント |

---

**この計画で実装を進めていいですか？**