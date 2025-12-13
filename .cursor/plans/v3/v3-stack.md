ここからは「どう実装するか」の技術仕様だけに振り切るね。
DB 設計は一旦忘れて、スタックとサービス構成・データフローに集中する。

> 注: この直後に書かれている Python/FastAPI ベースのアーキテクチャは v0.2 時点の案として残しているものであり、**v0.3 の実装は後半に記載した Node/Express（apps/api）構成を正式採用とする**。

---

## 1. 全体アーキテクチャ概要

レイヤー構成はこう決める。

1. クライアント

   1. iOS アプリ（SwiftUI）
      OpenAI Realtime API（WebRTC）で音声エージェントと接続
      Realtime の tool 呼び出しを受けて、自前バックエンドに HTTP で投げる

2. バックエンドサービス（Python）

   1. Gateway / Tools API（FastAPI）
      iOS からの HTTP を受ける窓口。Realtime の tool を全部ここにマッピング
   2. Memory Service（mem0）([GitHub][1])
      対話・理想・ストラグル・行動要約など「その人の意味記憶」を保持
   3. Nudge Policy Service（contextual bandits）([GitHub][3])
      状態ベクトルから「どの Nudge テンプレートを使うか」を選択
   5. Simulation Service（OpenAI Chat / Realtime）([OpenAI Platform][4])
      今日残り・明日・1/5/10 年後のシミュレーションテキストを生成
   6. Observability / Eval Service（Langfuse + TruLens）([Langfuse][5])
      LLM 呼び出し・tool 呼び出し・Nudge 成功率をトレース＆評価

3. テスト・開発用ツール

   1. Maestro（iOS UI E2E テスト）([GitHub][6])

以降は、この構成に沿って具体的な実装の仕方を書く。

---

## 2. クライアント（iOS）実装

### 2.1 音声エージェント（Talk タブ）

使用技術

1. Swift 5.10
2. SwiftUI で UI
3. AVAudioEngine + WebRTC クライアント
4. OpenAI Realtime API（WebRTC 接続）([OpenAI Platform][4])

フロー

1. セッション開始

   1. アプリ起動時、ユーザーの `user_id` や OS 情報を含むメタデータを生成
   2. OpenAI Realtime API に WebRTC で接続
   3. Realtime の system prompt に「Anicca として話すこと」「使用する tools の JSON schema」を定義して送信

2. 音声送受信

   1. マイク入力を AVAudioEngine で取得し、Opus などにエンコードして Realtime にストリーム
   2. Realtime からの `response.audio.delta` を受けて再生
   3. Realtime からの `response.output_text.delta` も UI で字幕表示

3. tool 呼び出し

   1. Realtime の出力で `tool_call` が来たら、iOS 側でパース
   2. `tool_name` と `arguments` を Gateway API に HTTP POST
   3. Gateway からの JSON レスポンスをそのまま Realtime に `tool_result` として送り返す
   4. LLM がそれを使って次の発話を生成

iOS 側では

1. `ToolInvocation` プロトコルを切って、
   `get_context_snapshot`, `choose_nudge`, `log_nudge`, `get_behavior_summary` などを一元管理
2. すべて URLSession で `https://api.anicca.app/tools/<tool_name>` に POST 頭出し
3. エラー時は Realtime に「一時的なエラーなので別の話題に切り替える」と返すようにする

### 2.2 Behavior/Profile タブ

Talk とは独立して、REST API 経由でバックエンドを叩く。

1. `GET /behavior/summary/today`
   今日の睡眠・歩数・スクリーンタイム・今日の一言サマリ

2. `GET /behavior/trends`
   起床/就寝・SNS 時間・歩数の 7 日/30 日トレンド

3. `GET /behavior/future`
   明日のタイムライン、1・5・10 年後のシナリオ

4. `POST /behavior/profile/edit`
   Big Five / 理想の姿 / Struggle 修正を送信

UI 側はこの API のレスポンスだけをレンダリングする。
中身のロジックはすべて Python 側。

---

## 3. Gateway / Tools API（FastAPI）

言語・フレームワーク

1. Python 3.11
2. FastAPI + Uvicorn
3. Poetry で依存管理
4. Docker コンテナ化

エンドポイント構成（Realtime tool 呼び出しに対応）

1. `POST /tools/get_context_snapshot`
   入力
   ・user_id
   ・現在時刻・OS 情報（あれば）
   処理
   ・Memory Service, Moss, Metrics Service に問い合わせて「今この人に関係するコンテキスト」を JSON で返す

2. `POST /tools/choose_nudge`
   入力
   ・user_id
   ・target_behavior（sleep / sns / exercise / mindfulness / honesty）
   ・context_snapshot
   処理
   ・Nudge Policy Service に渡して、`template_id`, `tone`, `channel`, `priority` を返す

3. `POST /tools/log_nudge`
   入力
   ・user_id
   ・nudge_action
   ・context_snapshot
   処理
   ・ロギング（DB 側）は別サービスに投げるだけ
   ・返り値は ack

4. `POST /tools/get_behavior_summary`
   入力
   ・user_id
   処理
   ・Simulation Service + Metrics から Behavior タブ用の JSON を返す

5. `POST /tools/get_future_projection`
   入力
   ・user_id
   ・horizon（"tomorrow" / "1y" / "5y" / "10y"）
   処理
   ・Simulation Service で生成したテキスト・タイムラインを返す

FastAPI 側では `@router.post("/tools/get_context_snapshot")` のように実装し、
それぞれ専用の service クラスに依存注入する。

Langfuse には FastAPI の middleware でトレースを送信する。([Langfuse][5])

---

## 4. Memory Service（mem0）と Moss の実装

### 4.1 mem0 のセットアップ ([GitHub][1])

1. mem0 サーバのデプロイ

   1. GitHub の `mem0ai/mem0` を Docker で起動
   2. バックエンドから HTTP/REST か Python SDK でアクセス

2. Python サイドのクライアント

   1. `pip install mem0`
   2. FastAPI アプリで `Mem0Client` をシングルトンとして DI

3. メモリのカテゴリ設計

   1. `"profile"`
      理想の姿・Struggle・Big Five・価値観
   2. `"behavior_summary"`
      日次・週次の行動要約（睡眠・歩数・SNS 時間など）
   3. `"interaction"`
      重要な会話・ユーザーの発言・Nudge への主観コメント
   4. `"nudge_meta"`
      どの Nudge が効きやすいか、傾向のメモ

4. API 的な関数

   1. `save_profile_memory(user_id, payload)`
      mem0 に `"profile"` タイプとして upsert

   2. `save_daily_behavior_summary(user_id, summary_text, stats)`
      `"behavior_summary"` に保存

   3. `save_interaction_memory(user_id, transcript_snippet)`

   4. `search_memories(user_id, query, types)`
      Realtime からの tool `get_context_snapshot` 内で使用

### 4.2 mem0 のみでの Memory & Search 設計（Moss なし）

#### なぜ Moss を v0.3 に入れないか

1. **レイテンシの観点で無意味**
   - mem0 の検索レイテンシ（50-200ms）は LLM 応答時間（2-5秒）と比較して誤差レベル
   - Moss の sub-10ms にする意味がない

2. **データ同期の複雑性**
   - Moss を入れると、mem0 と Moss 両方にインデックスを同期する必要がある
   - 整合性管理が面倒になり、バグの温床になる

3. **iOS ネイティブ SDK がない**
   - Moss は主に Web/ブラウザ向け（JavaScript SDK）
   - iOS から使う場合、結局サーバー側で呼ぶことになり、mem0 と変わらない

4. **v0.3 のユーザー規模**
   - 初期ユーザー数は限定的
   - 1 ユーザーあたりのメモリ量は数百〜数千件
   - mem0 のベクトルストア検索で十分対応可能

#### mem0 v2 Search API の機能

mem0 の検索は十分強力：

* **論理演算子**: `AND`, `OR`, `NOT`
* **比較演算子**: `in`, `gte`, `lte`, `gt`, `lt`, `ne`, `icontains`, `contains`
* **rerank**: 検索結果の再ランキング
* **keyword_search**: キーワードベース検索の併用

#### 保存時の metadata 設計

```typescript
// profile
metadata = { category: "profile" }

// behavior_summary
metadata = { category: "behavior_summary", date: "2025-12-06" }

// interaction
metadata = {
  category: "interaction",
  feelings: ["self_loathing"],
  domain: "sleep",
  timestamp: "2025-12-06T21:00:00Z"
}

// nudge_meta
metadata = {
  category: "nudge_meta",
  templateId: 4,
  sentiment: "better"
}
```

#### 検索例

```typescript
// 最近の自己嫌悪関連のエピソードを取得
const results = await memory.search("自己嫌悪 OR self-loathing", {
  userId: user_id,
  filters: {
    AND: [
      { category: "interaction" },
      { feelings: { in: ["self_loathing"] } }
    ]
  },
  top_k: 3
});

// 「最後に夜更かしを後悔していた時」のメモリ
const results = await memory.search("夜更かし 後悔", {
  userId: user_id,
  filters: { category: "interaction", domain: "sleep" },
  top_k: 1
});
```

#### Moss を検討するタイミング（v0.4 以降）

1. アクティブユーザーが 1 万人以上
2. 1 ユーザーあたり 1 万件以上のメモリ
3. オフライン検索が差別化要因になる
4. デバイス上 RAG が必要になる
- v0.3 では mem0 のクラウド版 hosted API を `MEM0_API_KEY` で利用し、自前ホスティング構成は採用しない。
了解。じゃあ一回、**Anicca v0.3 全体の TECH 要件定義書**としてまとめ切るね。
（7/8 ＝オブザーバビリティ / 自動テストは「v0.4 でやるので v0.3 では範囲外」と明示しておく）

そのまま `tech-v0.3.md` にコピペできる形で書きます。

---

# Anicca v0.3 Tech 要件定義書（Persuasion Agent）

リポジトリ: `github.com/Daisuke134/anicca.ai` ([GitHub][1])
対象フォルダ:

* iOS クライアント: `aniccaios/`
* バックエンド API: `apps/api/`（Express + TypeScript）

---

## 0. ゴール & スコープ

### 0.1 v0.3 のゴール

1. **Talk タブ中心の「感情・苦しみサポート」**

   * 画面を開くと、その人の「今の苦しみ」に近い 3 つのボタン（Feeling ボタン）が出る。
   * ボタンを押すだけで Anicca が先に話しかけ、ユーザーはただ答えればよい。
   * 会話・ログから学習し、その人に合った声かけに徐々に変化していく。

2. **行動データベースの構築 + JITAI 型 Nudge**

   * iOS の Screen Time / HealthKit / Motion / 位置情報を使い、
     「夜更かし」「朝のスマホ依存」「SNS 長時間」「座りっぱなし」などを検知。
   * Just-in-Time Adaptive Intervention（JITAI）のベストプラクティスに沿い、
     決まった時間ではなく「その瞬間」に最適な Nudge を送る。([Frontiers][2])
   * 成功 / 失敗のログから少しずつ Nudge のトーン・タイミングをチューニングする。

3. **Behavior タブによる「現在と未来の可視化」**

   * 今日の一言サマリ（例:「今日は自己嫌悪が強かったが、夜に少し軽くできた」）。
   * 今日これからの 1 日シミュレーション（残り時間ブロックのタイムライン）。
   * 1 / 5 / 10 年後、「今の行動が続いた場合」のストーリーをテキストで表示。
   * このシミュレーションを Nudge ポリシーの内部でも使う（介入タイミングの根拠）。

4. **記憶レイヤー**

   * mem0 でユーザーの「理想」「苦しみ」「大事な発言」「行動の要約」を永続化。([docs.mem0.ai][3])
   * v0.3 では mem0 のみを使用（Moss/Exa は v0.4 以降で検討）。

### 0.2 v0.3 に含める機能

* Talk タブ

  * Realtime 音声エージェント（OpenAI Realtime API）
  * 「How are you feeling?」+ 3 つの Feeling ボタン（ユーザーごとに動的）
  * Anicca Quotes（Wisdom Corpus から 1 つ表示）
  * 会話からの重要なメモリ保存（mem0）
* 自動 Nudge

  * Sleep / Morning Phone / SNS / Sedentary / Activity / Mindfulness などのドメインで JITAI 風 Nudge
  * 起床・就寝パターンの自動検知（HealthKit + DeviceActivity）
  * SNS / Video 長時間利用の検知（DeviceActivity / FamilyControls）([Apple Developer][4])
  * 座りっぱなし時間の検知（CoreMotion）
  * Nudge の成功 / 失敗ロギング + 簡易な自律改善ロジック
* Behavior タブ

  * 今日の一言サマリ
  * 今日残りの 1 日シミュレーション（タイムライン）
  * 1 / 5 / 10 年後の未来シナリオ（「今の行動が続いた場合」だけを表示）
  * BIG5 / キャラクター分析（LLM によるテキスト要約）
* 記憶

  * mem0 Node SDK によるメモリ保存 / 検索([docs.mem0.ai][5])
  * v0.3 では mem0 のみ使用（Moss/Exa は v0.4 以降）

### 0.3 v0.3 の非スコープ（v0.4 で実装）

* 7. Observability / Eval（Langfuse, TruLens 等での LLM 評価・トレース）
* 8. テスト自動化（Maestro、Mobile MCP での自動 UI テスト）

  * v0.3 では最小限のログ出力・手動テストのみ。
  * 設計書内では「将来ここに繋ぐ」という前提だけ書き、詳細は書かない。

---

## 1. リポジトリ構成 & コンポーネント

### 1.1 既存構成（現状）

`README.md` より:([GitHub][1])

* `aniccaios/`

  * iOS アプリ（SwiftUI）
  * 現状: Talk / Habits などのタブが存在。OpenAI Realtime API と WebRTC で接続。

* `apps/api/`

  * Node.js / Express バックエンド
  * TypeScript で実装
  * Railway / Fly.io 上にデプロイ

### 1.2 v0.3 の論理コンポーネント

#### クライアント側（iOS）

* **Onboarding モジュール**

  * Apple Sign In
  * 理想の自分 / Struggle の選択（複数）
  * 許可画面（マイク / 通知）
  * Screen Time / HealthKit / Motion は Onboarding では聞かない（Permission Bombing回避）。
    Profile > Data Integration のトグルを ON にした瞬間だけ OS 権限ダイアログを出す。

* **Talk モジュール**

  * メインの音声セッション UI（Talk タブ）
  * Feeling ボタン（3 つ）
  * Anicca Quote 表示

* **Behavior モジュール**

  * 「今日」のサマリ + タイムライン + 未来シナリオ + 特性表示

* **Sensors / Permissions モジュール**

  * DeviceActivity / FamilyControls
  * HealthKit
  * CoreMotion
  * Location

* **Notifications モジュール**

  * ローカル通知（v0.3の通知配信は端末内スケジュールを基本とする）
  * AlarmKit（iOS 18 以降で使用可能であれば起床 Nudge 用に検討）

#### サーバ側（apps/api）

Express アプリ内を以下のレイヤーに分割して整理する（新規ディレクトリを追加してよい）:

* `modules/realtime-tools/`

  * OpenAI Realtime 用 tool エンドポイント（HTTP）
  * `get_context_snapshot`, `choose_nudge`, `log_nudge`, `get_behavior_summary` など

* `modules/memory/`

  * mem0 クライアント（Node SDK）
  * ユーザープロフィール / 行動サマリ / 対話メモリの読み書き

* `modules/nudge/`

  * Nudge ルールエンジン
  * Nudge ポリシー（簡易 contextual bandit + ヒューリスティク）
  * 成功 / 失敗判定ロジック

* `modules/simulation/`

  * OpenAI Chat API を使った「今日残りの 1 日」シミュレーション
  * 1 / 5 / 10 年後のシナリオ生成

* `modules/metrics/`

  * iOS から送られた Screen Time / Sleep / 歩数 / Activity 等を集約
  * Behavior サマリ生成に必要な統計値を計算

---

## 2. iOS クライアント要件

### 2.1 技術スタック

* 言語: Swift 5.x
* UI: SwiftUI
* 音声ストリーム: AVAudioEngine
* Realtime 接続: WebRTC（既存実装を継続）
* フレームワーク:

  * `DeviceActivity` + `FamilyControls`（Screen Time / アプリ使用量）([Apple Developer][4])
  * `HealthKit`（睡眠・歩数など）
  * `CoreMotion`（歩行 / 走行 / 静止）
  * `CoreLocation`（位置情報）

### 2.2 主要画面

#### 2.2.1 Talk タブ

**レイアウト（概略）**

```text
┌───────────────────────────────┐
│  11:09                         ● 🔋  │
├───────────────────────────────┤
│  How are you feeling now?              │
├───────────────────────────────┤
│  Quoteカード（今日の一言）               │
│  （固定ストック30個から1日1つ表示）       │
├───────────────────────────────┤
│  [ 🔶 自己嫌悪 ]                       │
│  [ 🔶 不安 ]                          │
│  [ 🔶 怒り ]                          │
│  [ 💬 Something else ]                │
│   （上3つは動的、4つ目は固定）           │
├───────────────────────────────┤
│  Talk   |   Behavior   |   Profile   │
└───────────────────────────────┘
```

**要件**

* Feeling ボタン（4つのカード、縦並び）:

  * 上3つ: mem0 の Trait/Struggle プロファイル + 最近の感情メモリから動的に選ぶ。
    * 初期は Onboarding で選んだ Struggle から最大 3 つ。
  * 4つ目: 固定「Something else」（上の3つに当てはまらない場合のフォールバック）。
  * タップ時:

    * OpenAI Realtime に「ユーザーは今 ○○ を感じている」というコンテキストを送る。
    * Anicca が「先に」話し始める（ユーザーの発話を待たない）。

* カードタップ → Session画面遷移:

  * Feelingカード（4つのいずれか）をタップ → Session画面へ push 遷移。
  * Session画面は音声セッション専用のフルスクリーン。
  * 遷移時のパラメータ: `topic`（self_loathing / anxiety / irritation / free_conversation）
  * Session画面で OpenAI Realtime セッション開始。
  * セッション開始時、Tool で `get_context_snapshot` を呼ぶ。
  * AVAudioEngine で音声をストリームし、LLM の音声を再生。

* 会話ログ:

  * UI 上にはチャットログを残さない。
  * ただしバックエンドにはテキストトランスクリプト（要約）をメモリとして送る。

#### 2.2.2 Behavior タブ

**レイアウト（概略）**

```text
┌───────────────────────────────┐
│      Today's Insights                         │
├───────────────────────────────┤
│  今日の一言サマリ                              │
│  「Your sleep was short today. Phone usage    │
│   increased in the afternoon.」              │
├───────────────────────────────┤
│  24-Hour Timeline                             │
│   [■■■睡眠■■■][■■集中■■][■スクロール■][活動]   │
│   12am    6am    12pm    6pm    12am         │
│   凡例: Sleep(青) Focus(橙) Scroll(赤) Activity(緑) │
├───────────────────────────────┤
│  Today's Highlights                           │
│   [Wake ✓🌱5]      [Screen →🌱3]             │
│   Moving Forward    Stable                   │
│   [Workout ⚠🌱1]   [Rumination ✓🌱2]         │
│   Needs Attention   Moving Forward           │
├───────────────────────────────┤
│  10 Years From Now                           │
│   テキスト数行（今の行動が続いた場合の未来）    │
├───────────────────────────────┤
│  Talk   |   Behavior   |   Profile           │
└───────────────────────────────┘
```

**API 呼び出し**

* `GET /behavior/summary/today`

  * 今日の一言サマリ + 24-Hour Timeline データを取得。
* `GET /behavior/highlights`

  * Today's Highlights データ（ドメインごとのストリーク + ステータス）を取得。
* `GET /behavior/profile`

  * BIG5 / キャラクタ解析結果を取得。（Profile画面で使用）
* `GET /behavior/future`

  * 10年後のテキストシナリオを取得。

#### 2.2.3 Session 画面

**目的**

* 実際の音声セッションの状態を、視覚的に分かりやすく表示し、
  ユーザーがいつでも終了できるようにする。

**遷移元**

1. Talk タブの Feeling カード
   * 各カードから `SessionView` に push
   * パラメータ: `topic`（self_loathing / anxiety / irritation / free_conversation）
2. Wake 等の自動介入（AlarmKit / 通知）から
   * 起床ナッジ通知タップ → `SessionView(topic: wake)` など

**レイアウト（概略）**

```text
┌───────────────────────────────┐
│ 11:09                        ● 🔋 │
├───────────────────────────────┤
│                                   │
│ [ Talking about self-loathing ]   │ ← 上部の小さなラベル（丸角pill）
│                                   │
│         (青い丸オーブ)              │
│                                   │
│      Anicca is listening…         │ ← 状態テキスト
│                                   │
│  [ 🎙 ]                     [ ✕ ]  │ ← 左: micトグル, 右: red End
└───────────────────────────────┘
```

**要件**

* 青い丸オーブ: 常に緩やかなbreathアニメーション（scale 0.95〜1.05）
  * AVAudioEngine の RMS レベルに合わせてスケールを微調整
* 状態テキスト: `Anicca is listening…` / `Anicca is speaking…`
  * Realtime API の状態に合わせて更新
* 右下の赤い丸ボタン（✕）: いつでもセッションを終了できる

**挙動**

* 画面表示時に Realtime セッションを開始
* End ボタン or ナビバー Back タップ:
  * Realtime 接続を停止
  * `SessionView` を閉じて Talk タブへ戻る

---

### 2.3 データ取得 & アップロード

* DeviceActivity / FamilyControls

  * 事前に FamilyControls entitlement を申請。
  * SNS / Video カテゴリの使用時間閾値（例: 30 分）を設定し、超過時に delegate で通知。([Medium][8])
  * 1 日単位の集計情報（カテゴリ別使用時間）をローカルにまとめ、1 日 1 回バックエンドに送信。

* HealthKit

  * 睡眠（`HKCategoryTypeIdentifierSleepAnalysis`）
  * 歩数（`HKQuantityTypeIdentifierStepCount`）
  * 毎朝 / 毎夜に前日分をまとめてアップロード。

* CoreMotion

  * 長時間静止（2 時間以上座りっぱなし）を検知。
  * しきい値超過時に Nudge トリガをバックエンドに送信。

注：Location（位置情報）はv3では使用しない。

---

## 3. バックエンド API（apps/api）要件

### 3.1 技術スタック

* Node.js 20+
* TypeScript
* Express
* 外部サービス:

  * OpenAI Realtime / Chat API
  * mem0 Node SDK([docs.mem0.ai][5])
* データストア:

  * 既存の DB（Supabase / Prisma 等）を継続利用（詳細スキーマは別途）。

### 3.2 エンドポイント一覧（v0.3）

#### 3.2.1 Talk まわり

* `POST /realtime/tools/get_context_snapshot`

  * Input: `{ userId, domain }`

    * `domain`: `"sleep" | "sns" | "mindfulness" | "general" ...`
  * 処理:

    * mem0 から最近の profile / interaction / behavior_summary を検索。
    * 現在の metrics（今日の睡眠・SNS 時間など）を metrics モジュールから取得。
  * Output:

    ```json
    {
      "profile": { ... },
      "recent_memories": [ { "text": "...", "created_at": "..." } ],
      "today_stats": { "sleep_hours": 6.5, "sns_minutes": 120, ... }
    }
    ```

* `POST /realtime/tools/log_interaction`

  * Talk セッション終了時の要約を保存。
  * Input: `{ userId, summaryText, tags }`
  * 処理: mem0 `"interaction"` に保存。

#### 3.2.2 Nudge まわり

* `POST /nudge/trigger`

  * iOS が「イベント発生」を知らせるエンドポイント。
  * Input 例:

    ```json
    {
      "userId": "u123",
      "eventType": "sns_threshold_exceeded",
      "eventPayload": {
        "category": "social",
        "durationMinutes": 35
      },
      "timestamp": "2025-12-06T10:35:00Z"
    }
    ```
  * 処理:

    1. `NudgeContextBuilder` が `context_snapshot` を組み立てる。
    2. `NudgePolicy` に渡して `templateId` / `tone` / `channel` を決定。
    3. 通知文言を LLM で生成（テンプレ + コンテキスト）。
    4. 通知キューに登録（実配信は別レイヤー）。

* `POST /nudge/feedback`

  * Nudge の成功 / 失敗を記録。
  * Input 例:

    ```json
    {
      "userId": "u123",
      "nudgeId": "n_20251206_001",
      "label": "success" | "failed" | "ignored",
      "signals": {
        "notificationOpened": true,
        "snsClosedWithinMinutes": 3,
        "userSaid": "thanks, that helped"
      }
    }
    ```
  * 処理:

    * `NudgeLog` として DB に保存。
    * mem0 の `"nudge_meta"` に短いテキストとして保存（例:「優しいトーンの SNS 休憩は効きやすい」）。
    * 後述の簡易バンディット更新に使えるようキューに積む。

#### 3.2.3 Behavior / シミュレーション

* `GET /behavior/summary/today?userId=...`

  * metrics + mem0 + Nudge ログから「今日の一言サマリ」と「今日の状態」を返す。
* `GET /behavior/future?userId=...`

  * シミュレーションサービスで生成した 10 年後テキストを返す。
* `GET /behavior/profile?userId=...`

  * mem0 のプロフィールメモリから BIG5 / 特性などを返す。

#### 3.2.4 Onboarding / Profile

* `POST /profile/init`

  * 理想の姿・Struggle を受け取り mem0 `"profile"` に保存。
* `POST /profile/update`

  * Profile画面からの編集を反映。
* `GET /profile`

  * ユーザープロフィール全体を取得（Ideals、Struggles、Nudge強度、Sticky Mode、Data Integration設定）。

**Profile画面の構成：**

* ユーザー名・プラン・言語設定
* Your Traits: Big Fiveサマリ + 「View full trait profile」リンク（Traits Detail画面へ）
* Ideal Self: 選択したIdealsタグ表示
* Current Struggles: 選択したStrugglesタグ表示
* Nudge Strength: スライダー（quiet / normal / active）
* Sticky Mode: トグル
* Data Integration:
  * Steps (HealthKit) - トグル
  * Sleep (HealthKit) - トグル
  * Screen Time - トグル

---

## 4. Memory レイヤー (mem0)

### 4.1 mem0（意味記憶レイヤー）

文献的にも、長期・パーソナルなメモリを LLM から切り離す構造は
長期対話やパーソナライズに有効とされている。([arXiv][9])

**分類**

* `type: "profile"`

  * 理想の姿（タグ / テキスト）
  * Struggle（タグ / テキスト）
  * BIG5 推定
* `type: "behavior_summary"`

  * 日次: 「今日は 3 時間 SNS を見て後悔していた」などの要約 + 数値。
* `type: "interaction"`

  * Talk 中の重要発言・気づき・後悔。
* `type: "nudge_meta"`

  * 「○○系の Nudge は効きやすい / 効きにくい」などのメモ。

**書き込みタイミング**

* Onboarding 完了時 → `"profile"`
* 毎日深夜（またはアプリ起動時に前日分）→ `"behavior_summary"`
* Talk セッション終了時 → `"interaction"`
* Nudge フィードバック更新時 → `"nudge_meta"`

---

## 5. Nudge ポリシー & 自律改善（v0.3）

JITAI 研究では、

* 「決定点（decision point）」ごとに
* コンテキストを見て
* 適切な介入 / 非介入を選ぶ
  というフレームワークが標準。([Frontiers][2])

また、モバイルヘルスでは contextual bandits で介入を選択する手法が実際に使われている。([ambujtewari.com][10])

v0.3 では**「ルールベース + 簡易バンディット」**までをスコープとする。

### 5.1 対象ドメイン（v0.3）

1. Sleep / 夜更かし
2. Morning Phone（起床直後のスマホ）
3. SNS / Video 長時間
4. Sedentary（座りっぱなし）
5. Activity / Exercise（軽い運動・ランニング）
6. Mindfulness（反芻・ストレス・怒り）
7. Priority Habits（ユーザーが明示した「優先習慣」）

   * 瞑想 / 筋トレ / ランニング など

### 5.2 ルールベース JITAI（ドメイン別）

#### 5.2.1 Sleep

* **状態把握**

  * 過去 7 日の平均就寝 / 起床時刻（HealthKit）
  * 睡眠時間の平均
* **ターゲット**

  * 平均就寝が 0:30、睡眠 6h 程度なら、まずは 23:30 や 23:45 に近づける。
* **決定点**

  * 現在時刻が平均就寝時刻の 30〜60 分前。
* **介入ルール**

  * 「睡眠負債が大きく、今もスマホ利用中」なら、

    * トーン: 優しめ
    * Nudge: 「そろそろ寝る準備を始めよう」
* **フォローアップ**

  * Nudge から 30〜60 分後に「就寝検知」できなかった場合、

    * 1 回までフォローアップ Nudge を検討。

#### 5.2.2 Morning Phone

* **状態把握**

  * 起床時刻（HealthKit or DeviceActivity の最初の使用時間）
  * 起床後 60 分のスマホ使用時間（DeviceActivity）
* **決定点**

  * 起床後 30 分・45 分経過時点。
* **介入ルール**

  * 起床後 30 分以上、SNS/Video に張り付きっぱなしなら、

    * 「まずは顔を洗う / 朝の準備を」の Nudge。

#### 5.2.3 SNS / Video

* **状態把握**

  * `DeviceActivityMonitor` で SNS カテゴリの連続使用時間を監視。([Apple Developer][4])
* **決定点**

  * 30 分 / 60 分 継続利用を検知したタイミング。
* **介入ルール**

  * 30 分時点: 軽めの休憩 Nudge。
  * 60 分時点: もう少し強め（「一度閉じて、何か別のことをしない？」）。

#### 5.2.4 Sedentary / Activity

* **状態把握**

  * CoreMotion で 2 時間以上 静止状態が続いたかどうか。
* **決定点**

  * 2 時間継続座り が検知されたタイミング。
* **介入ルール**

  * 「少し立ち上がってストレッチしよう」という短い誘い。
  * ユーザーの理想が「Runner」「Muscular」なら、その文脈でメッセージを書く。

#### 5.2.5 Mindfulness / 感情系

* **決定点**

  * ユーザーが Talk タブで Feeling ボタンを押した瞬間が decision point。
* **介入ルール**

  * そこからは「対話ベース」で Nudge（音声セッション）。
  * v0.3 では self-report EMA（感情評価フォーム）はまだ導入しないが、
    将来の JITAI-EMA の土台として「Talk 終了時の気分」を聞くオプションを検討。([PMC][11])

### 5.3 自律改善（簡易バンディット v0.3）

**目的**: いきなり高度な contextual bandit ではなく、
「同じパターンを繰り返して失敗し続けない」レベルの改善を入れる。

#### 5.3.1 状態ベクトル（例）

```ts
interface NudgeContext {
  localTimeHour: number;     // 0-23
  dayOfWeek: number;         // 0-6
  snsMinutesToday: number;
  sleepDebtHours: number;    // 推定
  stepsToday: number;
  personality: {
    neuroticism: number;
    conscientiousness: number;
    // ...
  };
  struggleTags: string[];    // ["rumination", "sns_addiction"]
}
```

#### 5.3.2 行動 & 報酬

* `action = (templateId, tone, channel)`
* `reward = 1`:

  * 例）SNS Nudge → 5 分以内に SNS アプリを閉じ、10 分以内に再開しなかった。
* `reward = 0`:

  * 通知無視、または行動変化なし。

#### 5.3.3 アルゴリズム v0.3

* 各ドメインごとに 3〜5 種類のテンプレ（優しい / 厳しめ / 事実ベース / 比喩的 など）を定義。
* ドメイン × テンプレごとに以下のカウンタを持つ:

  * `successCount`, `failureCount`
* 「contextual bandit」のフル実装ではなく、

  * 指標:

    * **成功率** = `successCount / (successCount + failureCount)`
    * **疲労度**: 直近 N 回での失敗連続回数
  * ポリシー:

    * 最近成功率が高いテンプレを優先。
    * 疲労度が高いときは「送らない」or「トーンを変える」を選択。
* ロジックは `modules/nudge/policy.ts` の 1 ファイルにまとめる。

> v0.4 以降で、本格的な contextual bandit（Linear UCB 等）に移行する。([ambujtewari.com][10])

---

## 6. シミュレーション & Behavior 生成

### 6.1 今日残りの 1 日シミュレーション

**入力**

* Trait Profile（理想 / Struggle）
* 過去 7〜14 日の行動統計（平均起床 / 就寝 / SNS / 歩数など）
* 今日ここまでの実績（朝〜現在）

**手順**

1. バックエンドで「単純予測」:

   * 過去のパターンから、

     * 残りの SNS 時間
     * 残りの仕事 / 学習時間
     * 就寝時刻
       を rule ベースで推定。
2. OpenAI Chat に以下を渡す:

   * 上記の統計
   * 今の時刻
   * 「残りの時間を 3〜6 ブロック程度に区切って、カテゴリと一言コメントを JSON で返す」というプロンプト。
3. 出力 JSON を Behavior タブに返す。

### 6.2 1 / 5 / 10 年後のシナリオ

**入力**

* 現在の平均行動（睡眠 / 運動 / SNS）
* 理想の姿
* Nudge で改善する余地（`improvement_potential` のような内部スコア）

**出力**

* `current_traj_1y`, `current_traj_5y`, `current_traj_10y`

  * 「今の行動が続いた場合」の1 日と心の状態のテキスト（各 3〜5 行）。
* v0.3 では「改善した場合」のシナリオは Behavior UI には出さない（内部的には使ってもよい）。

---

## 7. Observability / Eval（v0.4 スコープ）

* v0.3 では:

  * アプリ / API ログを最小限に出して、手動で挙動を確認するのみ。
* v0.4 で:

  * Langfuse 等のトレースツール導入。
  * Nudge 文言の品質評価、自動プロンプト改善ループなど。

---

## 8. テスト・開発支援（v0.4 スコープ）

* v0.3 では:

  * 手動テスト + Xcode の Unit/UI テスト最小限。
* v0.4 で:

  * Maestro による iOS UI 自動テスト。
  * Mobile MCP によるエージェントからの操作テスト（将来の目標）。

---

## 9. v0.3 実装の優先度まとめ

1. **必須 (Must)**

   * Talk タブの更新

     * Feeling ボタン
     * Realtime エージェントとの接続仕様
   * Onboarding の理想 / Struggle 選択
   * DeviceActivity / HealthKit / CoreMotion からの最小限のログ取得
   * Nudge ルールエンジン（Sleep / SNS / Sedentary / Morning Phone）
   * Nudge 成功 / 失敗のロギング
   * Behavior タブの

     * 今日の一言サマリ
     * 今日残りのシミュレーション
     * 1 / 5 / 10 年後シナリオ
   * mem0 の基本統合（プロフィール + 最近のメモリ検索）

2. **できれば v0.3 で入れたい (Should)**

   * BIG5 / キャラクター分析表示
   * 簡易な Nudge 自律改善（成功率 / 疲労度に応じたテンプレ切替）

3. **明確に v0.4 以降 (Later)**

   * Moss / Exa の導入
   * Langfuse / TruLens による品質評価
   * Maestro / Mobile MCP での自動テスト

---

## 10. EMA ベースのメンタル bandit（Feeling ボタン用）

### 10.1 目的と設計

* 対象: Talk 画面の Feeling ボタン（自己嫌悪 / 不安 / 怒り など）
* Goal: 「同じ feeling に対して、どのタイプの導き（テンプレ）がその人に一番効くか」をオンラインで学習

v0.3 から LinTS（Thompson Sampling with linear model）を採用。

### 10.2 Decision Point

メンタル bandit の DP:

1. **Feeling ボタン押下（ユーザー起動 JITAI/EMI）**
   * `eventType = "feeling_button_pressed"`
   * `feeling_id = "self_loathing" | "anxiety" | "anger" | ...`

### 10.3 State（特徴量）

```ts
interface MentalState {
  localHour: number;           // 0-23
  dayOfWeek: number;           // 0-6
  feelingId: string;           // "self_loathing" | "anxiety" | etc.
  recentFeelingCount: number;  // 今日その feeling ボタンが押された回数
  recentTalkMinutes: number;   // 今日話した合計時間
  sleepDebtHours: number;      // 過去7日の平均と昨夜の差
  snsMinutesToday: number;
  ruminationProxy: number;     // 0-1（深夜SNS + 反芻発言から計算）
  big5: { O: number; C: number; E: number; A: number; N: number };
  struggles: string[];
}
```

### 10.4 Action（テンプレ群）

Feeling ドメインのテンプレ例:

| ID | テンプレ名 | BCT タグ |
|----|----------|---------|
| A | self_compassion_soft | self_compassion |
| B | cognitive_reframe | reappraisal |
| C | behavioral_activation_micro | behavioral_activation |
| D | metta_like | loving_kindness |
| E | fact_check | cognitive_defusion |

### 10.5 Reward（EMA ベース）

セッション終了時に Anicca が短く聞く:
> 「さっきより少し楽になった？」（はい / いいえ）

* `emaBetter = true` → reward = 1
* `emaBetter = false` → reward = 0

- v0.3 では EMA はこの Feeling EMI のみに導入し、自動 Nudge（Sleep / Morning Phone / SNS / Sedentary / Habit）側では EMA 質問は行わず、パッシブなシグナルのみで reward を計算する。

### 10.6 API フロー

1. iOS から Feeling ボタン押下 → `POST /api/mobile/feeling/start`
2. サーバ: state 構築 → bandit でテンプレ選択 → mem0 検索 → スクリプト生成
3. セッション終了 → `POST /api/mobile/feeling/end` で EMA 回答を送信
4. サーバ: reward を bandit に更新、mem0 に保存

---

## 11. BIG5 / キャラクター分析（アンケート無し）

### 11.1 文献ベースの妥当性

* Peltonen et al. (2020): アプリカテゴリ使用時間から Big Five を高精度で予測可能
* Stachl et al. (2020): 6クラスのスマホ行動データから Big Five を予測（R≈0.37〜0.4）

### 11.2 特徴量設計

14〜30 日分のログから以下を抽出（14 日以上そろった時点で暫定推定を行い、30 日分そろって以降は 30 日ウィンドウを使って週 1 回再推定する）:

* ScreenTime 系: SNS / Entertainment / Productivity minutes per day、Night usage (22:00-03:00)
* 行動リズム: average sleep time、average wake time、weekend vs weekday differences
* アクティビティ: 平均歩数、運動日数/週
* Talk/Text 系: 自己言及頻度、sentiment ratio、抽象語 vs 具体語比率

### 11.3 推定パイプライン

1. 直近 30 日分の集約ログを bullet list にする（初回は 14 日分そろった時点で暫定版を作成し、その後は 30 日ウィンドウで週 1 回更新）
2. OpenAI Chat に渡して Big Five (O, C, E, A, N) を 0.0〜1.0 で推定
3. 結果を `user_traits.big5` と mem0 profile に保存
4. Traits Detail 画面でレーダーチャートと文章で表示
5. ユーザーが修正した場合は override として次回プロンプトに含める

### 11.4 Nudge との接続

* Neuroticism 高 → 強い脅しテンプレを避ける
* Conscientiousness 低 → micro-step / self-compassion 系優先
* Openness 高 → 理論説明を含むテンプレが効きやすい

---

## 12. 環境変数の完全リスト（Railway に設定）

### 12.1 既存（変更なし）

| 変数名 | 用途 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `OPENAI_API_KEY` | OpenAI API（Realtime 含む） |
| `REVENUECAT_PROJECT_ID` | RevenueCat |
| `REVENUECAT_REST_API_KEY` | RevenueCat |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat Webhook 検証 |
| `REVENUECAT_ENTITLEMENT_ID` | RevenueCat エンタイトルメント |
| `REVENUECAT_VC_CODE` | RevenueCat Virtual Currency |
| `FREE_MONTHLY_LIMIT` | 無料ユーザーの月間上限（分） |
| `PRO_MONTHLY_LIMIT` | PRO ユーザーの月間上限（分） |
| `PROXY_GUEST_JWT_SECRET` | JWT 署名用 |

### 12.2 新規追加（v0.3）

| 変数名 | 用途 | 取得元 |
|--------|------|--------|
| `MEM0_API_KEY` | mem0 クラウド API キー | [mem0.ai](https://app.mem0.ai) ダッシュボード |

- MEM0_API_KEY を追加（Railway に設定）。Moss/Exa は v0.4 以降で非使用と明記する。

### 12.3 削除（v0.3 では不要）

- ~~`MOSS_PROJECT_ID`~~ → v0.4 以降
- ~~`MOSS_PROJECT_KEY`~~ → v0.4 以降
- ~~`EXA_API_KEY`~~ → v0.4 以降

---

## 13. 3モダリティの位置づけ

1. **自動 JITAI 通知**: Sleep / SNS / Movement / Priority Habit（行動ログベース reward）
2. **通知タップ → Session 画面**: コンテキスト付き音声導き
3. **Talk Feeling EMI**: ユーザーの Feeling ボタン押下が DP、EMA ベースの reward

v0.3 において 3 モダリティはすべて含める（MUST）。

---

## 14. その他クリアにすべき点

### 14.1 bandit 実装場所

* v0.3 は Node/TS 内で LinTS を自前実装
* オフライン解析用に Python 版は別レポ or サイドカーサービスとして持つ

### 14.2 ログの取り方

* すべての Nudge / Feeling セッションに対して `(state, action, reward, bct_tags)` を残す
* これは後の「人類一般のパターン分析」のための必須データ

### 14.3 プライバシ / セキュリティ

* mem0 に入れるテキストからは名前/住所など個人特定情報を LLM で redact して保存

### 14.4 タイムゾーンと日付計算

* 全ての `daily_metrics` と Behavior 表示はユーザーのタイムゾーンベースで日付を切る
* Nudge DP 判定も同様

### 14.5 失敗時の fallback UX

* センサーが許可されていない時は「今は詳しい行動データは見えていません」と明示
* それでも Feeling ボタンと Talk だけで「メンタル側の導き」は提供可能

---

この要件定義書をベースに、

* `apps/api` 側では

  * `modules/` 以下に **memory / nudge / simulation / metrics** の各モジュールを切る。
* `aniccaios` 側では

  * Talk / Behavior / Onboarding / Sensors / Notifications の各レイヤーをはっきり分ける。

……という形で進めれば、そのまま Cursor に貼っても迷わず実装に入れるはず。

次のステップとしては、

* `apps/api` の具体的なエンドポイント仕様（型定義）
* `aniccaios` の ViewModel / State 構造

を細かく落としていけば OK。

[1]: https://github.com/Daisuke134/anicca.ai "GitHub - Daisuke134/anicca.ai: Voice leading you to nirvana."
[2]: https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1460167/full?utm_source=chatgpt.com "Beyond the current state of just-in-time adaptive ..."
[3]: https://docs.mem0.ai/cookbooks/overview?utm_source=chatgpt.com "Overview"
[4]: https://developer.apple.com/documentation/screentimeapidocumentation?utm_source=chatgpt.com "Screen Time Technology Frameworks"
[5]: https://docs.mem0.ai/open-source/node-quickstart?utm_source=chatgpt.com "Node SDK Quickstart"
[6]: https://www.usemoss.dev/?utm_source=chatgpt.com "Moss"
[7]: https://docs.exa.ai/reference/search?utm_source=chatgpt.com "Search"
[8]: https://medium.com/%40expertappdevs/exploring-screen-time-api-in-swift-146eeda5ad02?utm_source=chatgpt.com "Exploring Screen Time API in Swift | by Expert App Devs"
[9]: https://arxiv.org/abs/2504.19413?utm_source=chatgpt.com "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"
[10]: https://www.ambujtewari.com/research/tewari17ads.pdf?utm_source=chatgpt.com "From Ads to Interventions: Contextual Bandits in Mobile ..."
[11]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10450096/?utm_source=chatgpt.com "Just-in-time adaptive ecological momentary assessment ..."
