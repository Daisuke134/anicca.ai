了解。
いまの状態（Sleek にもある HTML テンプレ）と、これまで決めてきた仕様を全部踏まえて、**v0.3 時点の完全な UI 定義書**として書き直すね。

* Important Alarms は **v0.3 では未採用**（UI仕様からも外す）
* Talk タブの `Talk to Anicca` ボタンは **削除**
* サイレント説明は **Just-in-time で 1 回だけ出すモーダル**（iOS のサイレントに影響を受けるデバイスだけ）

として反映している。

---

# Anicca v0.3 UI 仕様書（完全版）

対象: iOS アプリ（SwiftUI / HTMLテンプレ 01〜11 + session.html）
目的: このドキュメントを元に、Sleek や実装エージェントが **全画面を正しくデザイン・実装** できるようにする。

タブ構成は 3 つ：

* Talk（会話）
* Behavior（習慣とインサイト）
* Profile（プロフィール）

---

## 0. 共通ルール

### 0-1. カラートーン（現在の実装に準拠）

* 背景: 暖かいオフホワイト系 `#F8F5ED`
* カード背景: ほぼ白に近い `#FDFCFB`
* 主要テキスト: `#393634`（ソフトな黒茶）
* 補助テキスト: `#898783`（暖色グレー）
* プライマリボタン: `#222222` にテキスト `#E1E1E1`
* 非アクティブボタン／タグ: `#E9E6E0` にテキスト `#898783`
* ボーダー: `#C8C6BF` / ライトボーダー `#F2F0ED`

### 0-2. Spacing / 角丸 / コンポーネント

* 画面左右パディング: 16pt
* セクション間: 24pt
* コンポーネント内: 12〜16pt
* カード角丸: 37pt（今の丸 pill カード）
* プライマリCTAボタン:

  * 横幅: 画面幅 − 32pt
  * 高さ: 52〜56pt
  * 角丸: 26〜28pt
* フォント（英語UI）:

  * 大タイトル: SF Pro Display Bold 28〜30pt
  * セクションタイトル: 20〜22pt Semibold
  * 本文: 14〜16pt Regular
  * キャプション: 12〜13pt Regular

---

## 1. オンボーディング（7画面）

HTML ファイル:
`01-welcome.html` / `02-ideals.html` / `03-struggles.html` / `04-value.html` / `05-signinwithapple.html` / `06-microphonepermission.html` / `07-notificationpermission.html`

### 01 – Welcome (`01-welcome.html`)

**目的**
Anicca の世界観と価値を一言で伝え、「はじめる」ボタンへ誘導する。

**UI**

* 上: ステータスバーのみ

* 中央:

  * 大きなタイトル: `Anicca`
  * サブコピー（2 行まで）:

    > `Anicca is a voice guide that helps you change your habits and soften your suffering.`

* 下部中央: プライマリボタン

  * ラベル: `Get started`

---

### 02 – Ideal Self (`02-ideals.html`)

**目的**
「どんな自分になりたいか」を Anicca に教える。

**UI**

* タイトル: `Who do you want to become?`

* サブ: `Choose as many as you like.`

* 中央: Ideal chips（複数選択可）

  * 例: `Kind / Honest / Mindful / Confident / Early Riser / Runner / Healthy / Calm / Disciplined / Open / Courageous`
  * pillスタイル。選択時は黒背景＋白テキスト、非選択時は薄いベージュ背景。

* 下: `Skip` / `Next`（2ボタン）

---

### 03 – Current Struggles (`03-struggles.html`)

**目的**
いま抱えている苦しみ・課題を教えてもらう。

**UI**

* タイトル: `What are you struggling with right now?`
* サブ: `Select everything that applies.`
* 中央: Struggle chips

  * 例: `Self-loathing / Rumination / Anxiety / Anger / Jealousy / Loneliness / Night scrolling / Can't wake up / No motivation / Procrastination`
* 下: `Skip` / `Next`

---

### 04 – Value (`04-value.html`)

**目的**
Anicca が「具体的に何をしてくれるか」を 3 つのユースケースで示す。
モバイルオンボーディングのベストプラクティスに従い、短く・ベネフィット中心に。

**UI**

* タイトル: `What Anicca can do for you`

* 3つの縦カード：

  1. 苦しいときのサポート

     * アイコン: 😔＋💬
     * タイトル: `Be there when you’re suffering`
     * サブ: `Press one button when you feel stuck. Anicca speaks first and helps you untangle.`

  2. 生活リズムの見守り & Nudge

     * アイコン: ⏰＋📱
     * サブ: `Anicca quietly watches your sleep, screen time, and movement, and nudges you at the right moments.`

  3. 今日と未来の可視化

     * アイコン: 📅＋➡️
     * サブ: `See how today’s choices shape your future self.`

* 下: `Continue` ボタン 1 つ

---

### 05 – Sign in with Apple (`05-signinwithapple.html`)

**目的**
設定・ログをクラウド同期するための Apple サインイン。

**UI**

* タイトル: `Sign in with Apple`
* サブ: `Sign in to sync your data across devices.`
* 中央: Apple公式スタイルの `Sign in with Apple` ボタン
* 下: `Skip for now`（リンク）

---

### 06 – Microphone Permission (`06-microphonepermission.html`)

**目的**
Talk のコア機能（音声対話）のためにマイク権限を取得する。

**UI**

* タイトル: `Microphone access`
* 本文（2〜3行）:

  > `Anicca listens to you through the microphone so you can talk freely. Your voice is processed securely on your device and servers.`
* 中央: 状態ラベル `Not allowed` / `Allowed`（小さな行）
* 下: `Allow microphone` ボタン → iOS 権限ダイアログをトリガー

---

### 07 – Notification Permission (`07-notificationpermission.html`)

**目的**
自律Nudgeのために通知権限を取得する。

**UI**

* タイトル: `Notifications`
* 本文:

  > `Anicca uses notifications to gently nudge you at the right moments — for waking up, putting your phone down, or taking a break.`
* 下: `Allow notifications` ボタン → iOS 権限ダイアログ

---

## 2. メインタブ（08〜11）＋ Session

### 共通: Tab Bar

* 下部固定タブ: `Talk / Behavior / Profile`
* 各タブのルート画面はラージタイトルを使う（HIG の「タブの第1階層はLarge Title推奨」に従う）。

---

## 2-1. Talk タブ（`08-talk.html`）

**目的**

* 今の感情・悩みに一番近いカードを押して、すぐ Anicca と話し始められる場所。
* フリートークも `Something else` カード経由で開始する。

### レイアウト

* ナビバータイトル（大きな見出し）: `How are you feeling now?`
* その直下: 今日の一言カード（wisdom）

#### A. 今日の一言カード

* 幅いっぱいの丸角カード
* テキストは 1〜2 行
* 実装メモ:

  * 約 30 個の固定メッセージを用意しておき、
    `dayOfYear % quotes.count` などで1日1つを表示するだけでよい（パーソナライズなしでOK）。
  * 例:

    * `Even when you hate yourself, you still deserve gentleness.`
    * `You don’t have to fix your whole life tonight. One honest step is enough.`

#### B. Feeling カード（4枚）

1. Self-Loathing
2. Anxiety & Worry
3. Irritation
4. Something else

* 各カード構造:

  * 左: 絵文字アイコン（😰 / 😨 / 😡 / 💬 など）
  * 右:

    * タイトル（Bold）
    * サブコピー（短い説明）

* カード全体がタップ領域。タップすると、**Session 画面へ push 遷移**。

  * Self-Loathing → Session(topic: self_loathing)
  * Anxiety & Worry → Session(topic: anxiety)
  * Irritation → Session(topic: irritation)
  * Something else → Session(topic: free_conversation)

> 注: 下部の `Talk to Anicca` ボタンは v0.3 では **削除**。
> 話し始めたいときは必ずどれかのカードを押す。

---
スクショ反映版、ここだけちゃんと **仕様として確定** させるね。

やるのは 2 箇所だけ：

1. Behavior タブの「サマリカード」と「Today’s Highlights（芽アイコン＋数字）」の仕様更新
2. Session 画面の青いオーブのアニメーションを、**必須仕様として具体的に**書き直す（AVAudioEngine + RMS）

---

## 1. Behavior タブ（09-behavior.html）更新版

スクショの構成に合わせて書き直す。

### A. 今日の一言サマリカード（自然言語）

**目的**

* その日全体の「意味」を、2〜3 文で端的に伝える。
* 行動変容／自己トラッキング研究だと、
  「メトリクスだけでなく、**短い自然言語で要約されたインサイト**があると
  リフレクションと理解が進む」と報告されているので、
  最初にサマリカードを置くのが良い。

**UI**

* `Today's Insights` タイトル直下に、幅いっぱいの丸角カード。
* テキストは 1〜3 文、最大 220 文字程度。
* 中央揃えでも左揃えでもよいが、現在の実装どおり中央寄せ。

**データソースと生成ロジック**

毎日 1 回（1 日の終わり〜翌朝）に、以下のステップで生成する。

1. **構造化メトリクスを集める**

   * Sleep:

     * 昨夜の睡眠時間（h）、入眠時刻、起床時刻
     * 7 日移動平均との差
   * Screen:

     * 今日の総スクリーンタイム（h）
     * SNS / Scroll カテゴリ割合
     * 昨日および 7 日移動平均との差
   * Activity:

     * 歩数、運動セッションの有無
     * 7 日移動平均との差
   * Mind:

     * 反芻 / Self-loathing ボタン押下回数
     * 今日の Feeling セッション数、EMA（楽になった？）の集計

2. **「変化の大きい項目」を 2〜3 個ピックアップ**

   * 7 日平均からのずれが一番大きいもの
   * 直近数日のトレンドが顕著なもの（改善 or 悪化）
   * 例: 短い睡眠、午後のスクロール急増、反芻減少 など

3. **LLM で短い要約を生成**

   * 上記メトリクスとピックアップ結果を、構造化 JSON として LLM に渡し、
     「**最大 2〜3 文**の英文」で要約させる。
   * プロンプト上の制約：

     * 評価はしてもよいが、道徳的な断罪・医療的診断はしない
     * 「今日は○○が短かった／増えたので、××に気をつけよう」のような
       **中立＋優しいトーン**にする
   * Vital Insight や MindScape のような研究でも、
     LLM に構造化されたログを渡して日次サマリを生成する手法が有効とされている。

例:

> `Your sleep was short today. Phone usage increased in the afternoon. Be mindful of rumination at night.`

---

### C. Today’s Highlights（4カード） – 芽アイコン＋数字版

スクショ通り、Now は「右上に 🌱+ 数字」、下に状態テキスト。

**目的**

* 4つの重要ドメイン（Wake / Screen / Workout / Rumination）について
  **「前進中か／停滞か／要注意か」と「ストリーク（日数）」** をひと目で見せる。

**ドメイン固定**

* Wake – 起床 / 睡眠リズム
* Screen – スクロール / SNS
* Workout – 運動 / 筋トレ
* Rumination – 反芻 / 自己批判

**カード配置**

* `Today's Highlights` の下に 2x2 グリッドで 4 枚。

**各カードの構造**

```text
┌───────────────┐
│ ✓  Wake                 🌱 5 │  ← 行1: 左=状態アイコン＋タイトル, 右=芽＋ストリーク数
│ Moving Forward              │  ← 行2: 状態ラベルテキスト
└───────────────┘
```

* 行1:

  * 左: 状態アイコン（テキストの頭にも同じ記号を使う）

    * ✓ = Moving Forward（改善 or 良好）
    * → = Stable（ほぼ変化なし）
    * ⚠︎ = Needs Attention（悪化傾向 or 目標から大きく外れている）
  * 右上: 小さな pill バッジ

    * アイコン: 🌱（sprout）
    * テキスト: ストリーク日数（例: `5`）
    * 意味: そのドメインで **「目標範囲 or 少なくとも大きく崩していない」状態が続いている日数**

* 行2:

  * 状態ラベルテキスト

    * `Moving Forward` / `Stable` / `Needs Attention`

**数値について**

* このカードには **具体的な時間・回数・％は表示しない**。

  * 細かい数値は内部と詳細ビュー用に保持しておく。
  * ハイライトカードは「評価＋ストリーク」だけを見せるレイヤー。

**ストリーク計算ルール（仕様）**

* 各ドメインごとに、その日の状態を 3値に分類：

  * Wake:

    * Moving Forward = 起床がターゲットウィンドウ内 & 昨日より良い
    * Stable = ウィンドウ内だが改善なし
    * Needs Attention = ウィンドウから外れている / 睡眠不足が続いている
  * Screen:

    * Moving Forward = 「悪いスクロール」時間が自分の許容量の下限を下回る & 昨日より減少
    * Stable = 許容量の±小範囲
    * Needs Attention = 許容量より大幅に上
  * Workout:

    * Moving Forward = その日に予定していた最小運動（例: 10分ウォーク／軽い筋トレ）を実行
    * Stable = 「今日は休みの日」扱いで許容範囲内
    * Needs Attention = 運動不足が続いている
  * Rumination:

    * Moving Forward = 反芻イベントや self-loathing セッションが明らかに減少
    * Stable = ほぼ同水準
    * Needs Attention = 急増 / 一日中押され続けている

* ストリーク `n` は、「Moving Forward or Stable」だった日が続いている長さ。

  * `Needs Attention` の日が入るとストリークはリセット。

* カード右上の `🌱 n` は、そのストリーク日数を表示。


---

## 2-3. Profile タブ（`10-profile.html`）

**目的**

* ユーザーのアカウント情報・Traits・理想・苦しみ・Nudge 設定・データ権限・アカウント操作をまとめる。

### 構成

1. ナビバータイトル: `Profile`（ラージタイトル）
2. A: アカウントカード（Name / Plan / Language）
3. B: Your Traits サマリカード
4. C: Ideal Self チップ
5. D: Current Struggles チップ
6. E: Nudge Strength（Quiet / Normal / Active）
7. F: Sticky Mode
8. G: Data Integration（Screen Time / Sleep / Steps）
9. H: Account Management（Sign Out / Delete Account）
10. I: Legal（Privacy Policy / Terms）

#### A. アカウントカード

* 3 行:

  * Name: `Daisuke`
  * Plan: `Annual Plan`（右端に `>` でプラン管理へ）
  * Language: `English`

Language 行の選択は、そのユーザーの `LANGUAGE_LINE` を決める。  
Talk セッションの音声、Nudge 文言、Today’s Insights、10 Years From Now、Traits の summary など、LLM が生成するすべてのテキストはこの Language 設定（= `LANGUAGE_LINE`）の言語だけで表示される。

#### B. Your Traits（サマリ）

* カード上部に 2〜3 行のサマリ文:

  > `You're highly agreeable and open to new experiences, balancing structure with flexibility. You enjoy both social interaction and alone time.`

* その下に、Key traits を 2 つインラインで表示:

  * 例: `Openness · Agreeableness`

    * pill もしくは薄いタグスタイル（主張しすぎない）

* カード下部に、1 行のリンクrow:

  * 左: `View full trait profile`
  * 右: `>`
  * 行全体がタップ領域で、タップ → Big Five Traits 詳細画面 (`11-traits-detail.html`) へ。

#### C. Ideal Self / D. Current Struggles

* 現在の UI 通り、ふくらんだ pill ボタンで理想と苦しみのチップを編集。
* タップで ON/OFF 切り替え（即時保存）。

#### E. Nudge Strength

* タイトル: `Nudge strength`
* Segmented control `[ Quiet | Normal | Active ]`
* デフォルト: `Normal`

#### F. Sticky Mode

* タイトル: `Sticky Mode`
* トグル `[ ON/OFF ]`
* 説明テキスト（caption）:

  > `When ON, Anicca keeps talking until you respond 5 times.`

#### G. Data Integration

* タイトル: `Data Integration`
* 行ごとにトグル:

  * `Screen Time` [ON/OFF]
  * `Sleep (HealthKit)` [ON/OFF]
  * `Steps (HealthKit)` [ON/OFF]

#### H. Account Management

* タイトル: `Account Management`
* `Sign Out` （赤文字行）
* `Delete Account`（赤文字行、タップで確認モーダル）

#### I. Legal

* 画面最下部に小さく `Privacy Policy · Terms of Service` リンク。

---

## 2-4. Big Five Traits 詳細画面（`11-traits-detail.html`）

**目的**

* Big Five の 5 特性について、バー + 短い説明で全体像を見せる。

### 構成

* タイトル: `Big Five Traits`
* 特性ごとに独立したカード 5 枚（Agreeableness, Openness, Conscientiousness, Emotional Stability, Extraversion）

各カード:

```text
┌───────────────────────────────┐
│ Agreeableness             82/100          │ ← 行1: ラベル＋スコア
│ [████████████████───────]               │ ← 行2: バー（0〜100）
│ Highly cooperative; you value harmony…   │ ← 行3: 説明（最大2行）
└───────────────────────────────┘
```

* バーは既存実装のスタイルを踏襲。
* 説明文は 1〜2 行に収める（長文は切る）。

---

## 3. Session 画面（`session.html`）

**目的**

* 実際の音声セッションの状態を、視覚的に分かりやすく表示し、
  ユーザーがいつでも終了できるようにする。

### 遷移元

1. Talk タブの Feeling カード

   * 各カードから `SessionView` に push
   * パラメータ: `topic`（self_loathing / anxiety / irritation / other）
2. Wake 等の自動介入（AlarmKit / 通知）から

   * 起床ナッジ通知タップ → `SessionView(topic: wake)` など

### UI レイアウト

```text
┌───────────────────────────────┐
│ 11:09                        ● 🔋 │
├───────────────────────────────┤

│ < Back                                   │ ← ナビバー（左Backのみ）
│                                           │
│ [ Talking about self-loathing ]          │ ← 上部の小さなラベル（丸角pill）
│                                           │
│                 (青い丸オーブ)             │
│                                           │
│            Anicca is listening…           │ ← 状態テキスト
│                                           │
│                                           │
│  [ 🎙 ]                             [ ✕ ]  │ ← 左: micトグル, 右: red End
└───────────────────────────────┘
```

* 青い丸オーブは、**常に緩やかに breath アニメ**（scale 0.95〜1.05 くらい）

  * 時間がある場合は、AVAudioEngine の RMS レベルに合わせてスケールを微調整する。
* `Anicca is listening… / Anicca is speaking…` は Realtime API の状態に合わせて更新。
* 右下の赤い丸ボタン（✕）はいつでもセッションを終了できる。

### 挙動

* 画面表示時に Realtime セッションを開始。
* End ボタン or ナビバー Back タップ:

  * Realtime 接続を停止
  * `SessionView` を閉じて Talk タブへ戻る

---

## 2. Session 画面の青いオーブ – 実装必須仕様

ここは「時間があれば」ではなく **必須** として、
マイク入力レベルに追従させる。

### 2-3. オーブのアニメーション仕様

**目的**

* ユーザーが話しているときに、
  **「Anicca が聞いている」ことが視覚的に分かる**ようにする。
* Alexa / Siri / ChatGPT 音声モードと同様、
  マイクレベルに応じてオーブが少し大きく／小さくなるのがベストプラクティス。

### 実装ステップ（仕様レベル）

1. **AVAudioEngine でマイク入力を監視**

   * `AVAudioEngine` の `inputNode` に tap を入れ、
     一定バッファサイズごとに `AVAudioPCMBuffer` を受け取る。

2. **RMS から音量レベルを計算**

   * バッファから RMS (root mean square) を計算して、
     それをデシベル or 0〜1 の正規化値に変換する。

   * 例（デシベル法）:

     ```swift
     func rmsLevel(from buffer: AVAudioPCMBuffer) -> Float {
         guard let channelData = buffer.floatChannelData?[0] else { return 0 }
         let frameLength = Int(buffer.frameLength)
         var rms: Float = 0
         vDSP_rmsqv(channelData, 1, &rms, vDSP_Length(frameLength))
         // 20*log10(rms) で dB にし、[-inf,0] を [0,1] に正規化
         let level = 20 * log10f(rms)
         let minDb: Float = -80
         let clamped = max(level, minDb)
         let normalized = (clamped - minDb) / -minDb   // 0.0〜1.0
         return normalized
     }
     ```

   * マイクの環境ノイズを無視するため、
     一定閾値以下は 0 に丸めてよい。

3. **レベルを SwiftUI で bind する**

   * `SessionViewModel` に `@Published var voiceLevel: CGFloat` を持たせ、
     上の `normalized` 値をメインスレッドで更新する。

   * 例:

     ```swift
     DispatchQueue.main.async {
         self.voiceLevel = CGFloat(normalized)
     }
     ```

4. **オーブの `scaleEffect` に反映**

   * SwiftUI 側では、オーブのベーススケールを 0.9〜1.1 にする：

     ```swift
     Circle()
       .fill(blueGradient)
       .scaleEffect(0.9 + 0.2 * voiceLevel)
       .animation(.easeOut(duration: 0.08), value: voiceLevel)
     ```

   * こうすることで、音量が大きいほど少し大きく膨らみ、小さいときは元のサイズに近づく。

5. **スムージング（推奨）**

   * 急激な揺れを防ぐため、`voiceLevel` を更新する際に
     一次のローパスフィルタで滑らかにする：

     ```swift
     self.voiceLevel = 0.7 * self.voiceLevel + 0.3 * CGFloat(normalized)
     ```

   * これも仕様として「更新ごとに 0.7:0.3 で平滑化する」と明記しておく。

### 状態による色・テキスト切り替え

* `Anicca is listening…` の状態:

  * オーブの色: ブルーグラデーション
  * アニメ: 上記の音量連動

* `Anicca is speaking…` の状態:

  * オーブの色をやや明るくする or 別のリングアニメーションを追加してもよい
  * テキスト: `Anicca is speaking…`
  * voiceLevel はユーザー入力に対してのみ更新（モデル音声に連動させる必要はない）

---

---

## 4. Wake Silent 説明モーダル（Just-in-time）

**目的**

* iOS のサイレントスイッチにより起床アラームが鳴らないリスクについて、
  **最初に Anicca が自律的に起こそうとするタイミングで 1 回だけ** 説明する。

  * モバイルOnboardingの「権限/重要情報は Just-in-time で出すべき」という原則に従う。

### 表示条件

* OS が「サイレントモードでも確実にアラームを鳴らすことを保証していない」デバイス
  （例: iOS 26 未満、AlarmKit 非対応など）
* ユーザーが Ideal / Struggles で `Early Riser` / `Wake up on time` / `Can't wake up` 等を選んでいる
* かつ、Anicca がセンサー・行動ログを基に
  「このユーザーの起床習慣に初めて自律介入する」タイミング
* `hasSeenWakeSilentTip == false` のときのみ表示

### UI（モーダルダイアログ）

```text
Wake alarms & Silent mode

Anicca can gently wake you at the right time,
based on your routines.

To make sure you actually hear the alarm,
please turn Silent mode off before going to sleep
and keep your volume high enough to wake you.

[ OK, got it ]
```

* 中央にシート or アラートとして表示。
* `OK, got it` を押したらフラグを立てる (`hasSeenWakeSilentTip = true`)。
* 以降は、アラームがサイレントに潰された場合にだけ、Behavior 画面や通知で
  エラーメッセージとして再提示する。

---

この仕様書を `ui-spec-v0.3.md` として保存しておけば、

* 01〜11 + session.html の各画面で **何を見せて何ができるのか**
* 画面同士が **どう遷移するのか**
* Wake / Silent 説明が **いつ・どの条件で出るのか**

が一通りカバーされるはず。
ここから先は、この spec を基に実装仕様書（API や state 管理）と突き合わせていけば、そのまま実装フェーズに入れると思う。
