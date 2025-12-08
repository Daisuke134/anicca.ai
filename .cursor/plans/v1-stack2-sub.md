了解、方向性だいぶクリアになった 👍
ここからは **「iOS の音声エージェント Anicca 0.３を本気で作るとしたら、どのスタックにするか」** を、遠回りなしで決め切るね。

---

## 0. 結論：Anicca 0.4 の最終スタック

まず全体像だけまとめると、こうするのが一番きれいだと思う：

1. **オンラインの「脳」**

   * そのまま **OpenAI Realtime API（WebRTC）** を使う
   * Realtime の **tool calling** でバックエンドのツール群を叩く
   * 別フレームワーク（LiveKit / VideoSDK / Vapi / Dedalus など）は **入れない**

2. **記憶レイヤー**

   * サーバ側に **mem0 を自前ホスト** して「長期記憶エンジン」として使う ([GitHub][1])
   * 会話ログ・理想の姿・ストラグル・行動分析の要約・パーソナリティ（Big5 など）を全部ここに集約

3. **行動ログ & 可視化**

   * DeviceActivity / HealthKit / CoreMotion / アプリ内イベントを **TimescaleDB 付き Postgres** みたいな時系列 DB に保存
   * Behavior タブは、この DB + mem0 + シミュレーション結果を読むだけのビュー

4. **Nudge 自律改善エンジン**

   * Python サービスとして

     * 初期はルールベース
     * すぐに **コンテキスト付きバンディット（`contextualbandits` ライブラリ）** に移行 ([GitHub][2])
   * 「状態（ユーザー状況）」→「どの Nudge テンプレートを送るか」→「成功/失敗から学習」のループ

5. **シミュレーション / 未来予測**

   * Expected Parrot / EDSL は **採用しない**（後述） ([GitHub][3])
   * 代わりに

     * mem0 にあるペルソナ + 行動統計 から「デジタルツイン」を LLM で生成
     * それを使って

       * 今日残り / 明日の 1 日シミュレーション
       * 1・5・10 年後の「人物像テキスト」
       * 「今のまま」「改善された場合」の 2 パターン比較

6. **観測 / 評価 / 自動改善の基盤**

   * LLM / エージェントのトレース・メトリクス → **Langfuse** で一元管理（OSS・自前ホスト可） ([Langfuse][4])
   * 出力品質や安全性の自動評価 → **TruLens** を評価ライブラリとして採用 ([TruLens][5])
   * Langfuse のログ + TruLens スコアを使って「プロンプト改善ジョブ」を回す

7. **アプリ / エージェントのテスト**

   * UI 回帰テスト → **Maestro**（現時点で一番実績あるモバイル E2E）
   * 「AI から iOS を自動操作してテスト」したい部分 → **Mobile MCP（mobile-next/mobile-mcp）** を採用して MCP 経由で自動化 ([GitHub][6])

8. **Dedalus / LiveKit / Moss / Hyperspell / Sanctum**

   * 0.4 の本番スタックには **入れない**
   * どこが刺さるかは後でまとめて理由を書く

ここから、箇条書きで聞いてくれたポイントごとに具体的に説明するね。

---

## 1. Realtime API で作るか、LiveKit / Dedalus などを使うか

### 1-1. 候補にしたもの

* **LiveKit Agents / Realtime**

  * WebRTC / SFU / マルチユーザー通話・空間オーディオなどのためのリアルタイム基盤 ＋ Agents フレームワーク ([LiveKit docs][7])
* **VideoSDK の Voice Agent Framework**

  * オープンソースの音声エージェント枠組み（STT/TTS・VAD・LLM オーケストレーション込み） ([Retell.ai][8])
* **Vapi / Retell**

  * 音声ボット SaaS（主に電話や外部通話向け） ([LiveKit docs][9])
* **Dedalus Labs**

  * MCP / 複数 LLM / ツールをつなぐ「Agent 用 Vercel」。非線形エージェントワークフロー向けインフラ ([Y Combinator][10])

全部見た上で、**Anicca 0.4 では使わない方がいい**と判断した。

### 1-2. なぜ「今の Realtime 直結」で行くか

1. **ユースケースが「1:1 iOS アプリ内の対話」だけ**

   * LiveKit や VideoSDK が本領発揮するのは、

     * 複数人通話
     * ボイスチャットルーム
     * マルチエージェント会話
       など。
   * Anicca は **1 ユーザー : 1 エージェント** のペアだけなので、SFU / ルーム管理のレイヤーが完全にオーバースペック。

2. **今すでに Realtime WebRTC が動いている**

   * ここに LiveKit を挟むと、

     * signaling・トークン周りを全部載せ替え
     * Realtime API のバージョン追従 ＋ LiveKit のアップデート
       の二重保守になる。
   * 一方で、今の Realtime セッションに **tool_call を足すだけ**なら、追加はすべてバックエンド側で完結する。

3. **Dedalus のようなエージェント基盤は「MCP＋複数モデル＋複雑なワークフロー」向け**

   * Dedalus は MCP サーバ群のホスティング・モデル乗り換え・ストリーミング handoff など「巨大エージェントのためのクラウド」 ([Dedalus Labs][11])
   * Anicca は

     * モデルはほぼ OpenAI 固定
     * ツールも自前 API いくつか
       なので、Dedalus を挟むメリットに対してロックインと複雑さが大きすぎる。

4. **音声レイテンシと制御のシンプルさ**

   * Realtime API 直結だと「LLM のストリーム → そのままアプリで再生」という最短パスが作れる。
   * LiveKit / VideoSDK を噛ませると、内部でさらに LLM コールをラップする形になるのでチューニングの自由度が下がる。

### 1-3. だからこう実装する

* iOS（Swift）側

  * 今の WebRTC クライアントをそのまま継続
  * Realtime に `input_audio_buffer.append` / `response.audio.delta` を流す今の形を維持
  * 新しくやるのは「セッション開始時に `user_id` などメタデータを送る」「tool_call を処理できるようにする」くらい

* サーバ側

  * Realtime の **tool** として

    * `get_user_summary`（mem0 + 行動ログから「今のあなた」）
    * `get_future_projection`（シミュレーション）
    * `choose_nudge`（RL/Bandit ポリシー）
    * `log_event`（学習用ログ）
  * を FastAPI などで実装しておく
  * Realtime の system prompt に「これらの tool を適切に呼んで対話・通知文を生成する」という役割を規定

→ これで **「今の Realtime モデルのまま」** 完全な音声エージェントに拡張できる。

---

## 2. 記憶レイヤー：mem0 を採用する理由と使い方

### 2-1. 要件整理（何を覚えていてほしいか）

Anicca が覚えるべきもの：

1. **エピソード記憶（会話・イベント）**

   * 「昨日こんな話をした」「2 週間前から早起きが続いている」など

2. **意味記憶（ユーザーの性質）**

   * Big Five 推定
   * 理想の姿 UI で選んだタグ（優しい / 誠実 など）
   * 苦しみ・ストラグルの種類

3. **行動統計の要約**

   * 起床・就寝の分布
   * SNS 使用時間
   * 歩数・運動量
   * 「こういう Nudge が効きやすい」というメタ情報

4. **Nudge ポリシーに関係するフラグ**

   * 「叱咤より励ましが効く」
   * 「朝は声ではなく通知の方が好き」など

### 2-2. mem0 を選んだ理由

**mem0** は「自己改善する長期記憶レイヤー」を目指した OSS で、

* 構造化メタデータ＋ベクトルのハイブリッドストア
* 自動的な重複排除・重要度スコア付け
* API で「書く」と「検索」がシンプル
* AWS 公式ブログでも「エージェント用メモリ」として紹介されている ([GitHub][1])

このユースケースにそのままハマる。

対して：

* **supermemory**

  * 「全アプリ横断のユニバーサルメモリ」として設計されていて、マルチクライアント前提 ([Mem0][12])
  * 今回は *Anicca 専用* の記憶でよいので、わざわざそこまでの汎用性は不要。

* **Moss / Hyperspell / Sanctum 系**

  * Moss：リアルタイム semantic search のためのインフラ（Supabase for AI Agents 的）
  * Hyperspell：Slack / Gmail / Notion / Drive など外部ツールをまとめて index する「ワークスペース用メモリ」
  * Sanctum（YC の方）：セッション録画から AI ユーザーモデルを作ってテストに使う B2B SaaS
    → どれも **外部 SaaS に強い** のが売りで、
    今回みたいに「iOS のローカル行動ログ＋アプリ内会話」がメインなケースにはオーバーキル。

### 2-3. mem0 の具体的な使い方

mem0 の中身をざっくり 3 レイヤーに分ける：

1. **Profile Memories（意味記憶）**

   * 例:

     * `{"type": "ideal_self", "traits": ["誠実", "マインドフル", ...]}`
     * `{"type": "personality", "big5": {...}, "mbti": "INTP"}`
     * `{"type": "struggles", "items": ["夜更かし", "SNS 依存"]}`
   * Onboarding / 設定画面・行動分析の結果から書き込む

2. **Behavioral Summaries（行動要約）**

   * 一日・一週間ごとにバッチで

     * 「平均就寝 0:30 / 起床 7:20 / SNS 3h / 歩数 4,000」などを LLM で要約して 1 レコードにする
   * Nudge ポリシーやシミュレーションの特徴量としても利用

3. **Interaction Memories（会話＆Nudge 履歴）**

   * 重要そうな発話だけをフィルタして保存
   * 「この言い方は嫌い」「こう呼んでほしい」などトーンの好み
   * 各 Nudge について「どんな文言をいつ送ったか」「成功したか」を保存して、次の文言生成に使う

Realtime からはツールとして：

* `search_memories(query, filters)`
* `upsert_memory(payload)`

だけを expose しておけば、プロンプト側から柔軟に使える。

---

## 3. EDSL / Expected Parrot をどう扱うか

### 3-1. 結論：Anicca 0.4 では **採用しない**

EDSL は

* 「大量の AI エージェントにアンケートや実験を投げてデータセットを作る」ための DSL
* サーベイ設計・条件分岐・人間＋AI 混在の調査に最適化されている

ので、

* リアルタイムで 1 ユーザーを継続的にシミュレーションし続ける
* その結果をオンライン RL に食わせる

といった **継続的な行動介入プロダクト** とは設計思想が違う。

> 「研究用としてユーザーのクローンを大量に作って遊ぶ」
> という文脈では超便利だけど、
> **本番の Nudge ポリシーをここに丸投げするのはやり過ぎ** だと思う。

### 3-2. 代わりにどうするか（シミュレーション）

シミュレーションは、もっとシンプルに：

1. **ユーザーペルソナの生成**

   * mem0 の profile＋行動統計から
   * 「30 代男性 / 夜更かし傾向 / 運動少なめ / SNS 依存高め / 目指したい姿：誠実＋マインドフル」
     みたいなペルソナテキストを毎日1回 LLM で再生成して保存

2. **「今日残り〜明日」の 1 日シミュレーション**

   * 入力：

     * その日の実績（朝〜今まで）
     * 明日の予定（カレンダー接続したければ）
     * ペルソナ
   * 出力：

     * 24h タイムライン（起床・仕事・SNS・運動・就寝）
     * 主要な行動を 10〜15 ステップに要約
   * 内部実装：

     * 数式ベースの簡単モデル＋LLM による補完
       （例：就寝が遅いと翌朝起床が遅れ、SNS 時間が増える…）

3. **1・5・10 年後の長期シナリオ**
   -「今の行動がこのまま続く場合」と
   「Anicca が提案する改善プランを 70% 実行した場合」
   の 2 パターンを LLM に書かせる

   * 数値スコア（健康 / 経験 / 人間関係 / 精神状態など）＋ナラティブ

4. **Nudge との接続**

   * Nudge エンジン側で

     * 「今の傾向が続いた場合の 1 年後の状態」
       を短いテキストに圧縮し、通知や音声の中で引用

この構成なら **EDSL に依存せず**、
普通に Python + OpenAI SDK だけで実装できる。

---

## 4. Nudge の自律改善：JITAI × コンテキスト付きバンディット

### 4-1. まずは何をログるか

Nudge を 1 イベントとして扱う：

* `user_id`
* `timestamp`
* `state_vector`

  * 時刻・曜日・最後の睡眠・直近のスマホ使用量・場所・活動状態 etc.
* `persona_features`

  * mem0 から引いた Big5 や理想の姿タグ、過去の反応傾向
* `action`

  * どの Nudge テンプレートを使ったか（ID）
  * チャネル（通知 / 音声 / 両方）
  * トーン（優しい / 厳しめ / 質問型 など）
* `reward`

  * 行動が変わったら 1, 変わらなければ 0
    （例：SNS 30分見てた → 5分以内にアプリ閉じたら成功）

これを **すべてサーバの `nudge_events` テーブルに貯める**。

### 4-2. アルゴリズム構成

1. **初期フェーズ（データほぼ無し）**

   * 行動科学の定番パターン + 自分の直感で

     * 優しい励まし
     * 現実を突きつけるリマインド
     * 具体的行動指示
       など 3〜5 種類のテンプレートを用意
   * パーソナライズはせず、確率的にローテーション

2. **コンテキスト付きバンディットに移行**

   * Python ライブラリ **`contextualbandits`** を採用

     * 論文ベースの LinUCB / Thompson Sampling など実装済み
   * `state_vector + persona_features` を特徴量として
   * `action`（テンプレート ID）を選び、`reward` から学習する
   * 実装イメージ：

     * 毎晩バッチで前日分を学習 → パラメータ更新
     * 推論用モデルを `nudge-policy-service` に hot reload

3. **JITAI（Just-In-Time Adaptive Intervention）の考え方を取り入れる**

   * 既存の JITAI 研究用環境（StepCountJITAI など）では、歩数データに対して RL で介入を学習している
   * それらの

     * 状態設計（時間帯・最近の行動・文脈）
     * 報酬設計（歩数増加など）
       を参考にしつつ、Anicca 用の環境を自作
   * ただし本番では「フル RL」よりも、
     **コンテキスト付きバンディット＋ルール少し**くらいが一番安定するはず。

4. **個人レベルへのフィット**

   * ある程度データが溜まったら

     * グローバルモデル + user id embedding 的な特徴量
       で「個人差」も拾う
   * mem0 から

     * 「この人は優しい言い方の方が行動する確率が高い」
       みたいな洞察を抽出し、特徴量として入れる

### 4-3. 実際に Nudge をどう決めるか

**Nudge Policy API**（Python）：

```text
POST /nudge/choose
body: {
  user_id,
  context_snapshot: {...},  // 今の時刻・行動・場所など
  target_behavior: "sleep", // "sleep" / "sns_usage" / "steps" ... 
}
→
{
  nudge_template_id,
  channel: "notification" | "voice" | "both",
  tone: "gentle" | "firm" | "coach",
  message_skeleton: "最近0:30頃に寝ていますね。もう寝る時間です。寝ましょう。"
}
```

* Realtime の tool からこの API を叩く
* 帰ってきたテンプレートをベースに、LLM がその人向けに微調整した文言を生成
* 送信後、一定時間後に reward を計算してまた `nudge_events` に書き込む

---

## 5. Behaviorタブ / 未来予測の具体イメージ

タブ構成は

* **Talk**
* **Habits**
* **Behavior（または Profile）**

の 3 つにする前提で。

### Behavior タブの中身

1. **「今のあなた」ヘッダー**

   * 一言サマリ（LLM が生成）
     例：

     > 「夜型から朝型に少しずつシフト中。SNS はまだ多めです。」

   * サブテキストで 2〜3 行

     * 平均就寝 / 起床
     * 週間歩数
     * 今週の SNS 時間

2. **今日 1 日のタイムライン**

   * 起床〜今までの主なイベントを縦タイムラインで
   * 「Anicca がどこを見ているか」がわかるようにする

3. **明日の予測**

   * 24 時間のタイムラインをシンプルなチャートで表示

     * 色分け：睡眠・仕事 / 学習・スマホ・運動・余暇
   * 下に一言コメント：

     * 「このままだと、明日の就寝は 0:40 になりそうです。」

4. **1・5・10 年後のシナリオ**

   * カード 2 枚 × 3 期間（現状維持 / 改善後）
   * 例：

     * 1 年後（現状維持）：

       > 「睡眠不足と運動不足が続き、朝のだるさが当たり前になっている」
     * 1 年後（改善後）：

       > 「23時就寝・7時起床が習慣化し、朝に瞑想と軽い運動をしてからスマホを見るようになっている」

5. **自己修正インタフェース**

   * Behavior タブのどこかに

     * 「これは自分とは違う」ボタン
     * 「性格」「目標」「生活スタイル」を修正する小さな編集 UI
   * 押されたら mem0 の該当メモを更新

---

## 6. Nudge 自律改善を支える「自己改善ツール」

### 6-1. いわゆる「自律改善エージェント」用フレームワーク

「self-improving agent」系は色々あるけど、本番で使えるレベルで **Anicca にそのまま刺さる OSS** はまだ少ない。

* Kayba の **Agentic Context Engine (ACE)** みたいに「自己改善コンテキストエンジン」を謳うものもあるが

  * まずは mem0 + Bandit + ログさえあれば、似たことは自作できる
  * いきなりフルスタック採用すると、デバッグが難しくなる

なので 0.4 の段階では、

1. **Nudge ポリシー自体の改善** → バンディット / RL（前述）
2. **プロンプト / トーンの改善** → 評価ツール＋LLM による自動チューニング
3. **行動モデルの改善** → シミュレーション（デジタルツイン）側で LLM プロンプトを更新

という 3 レイヤーを

* mem0
* Langfuse
* TruLens
* contextualbandits

の組み合わせで作るのが、一番現実的で強いと思う。

---

## 7. 観測・評価・プロンプト自動改善

### 7-1. 観測基盤：Langfuse

**Langfuse** は

* LLM アプリ向けの OSS オブザーバビリティ
* トレース・メトリクス・ユーザーフィードバックを集約して可視化
* OpenAI Agents SDK との連携も公式にサポート

なので、ここを中心に据える。

Anicca では：

* Realtime 側のツール呼び出しを全部 Langfuse にトレース
* `nudge_events` テーブルの `reward` を Langfuse の observation と紐づけ
* Behavior タブの生成も全部トレースしておく

### 7-2. 自動評価：TruLens

**TruLens** は

* LLM アプリのための評価・計測ライブラリで、LLM そのものを評価器として使える
* 「事実性」「関連性」「スタイル」などのフィードバック関数を組み合わせてスコアを出せる

Anicca では特に：

* Nudge メッセージについて

  * 「優しさ」「非攻撃性」「明確な行動提案が含まれているか」などの指標を作る
* シミュレーションの長期シナリオについて

  * 過剰に不安を煽っていないか
  * 論理的に一貫しているか

を毎晩バッチで評価し、Langfuse のトレースにスコアを紐づける。

### 7-3. プロンプト自動改善ループ

1. Langfuse 上で

   * `reward` が低い Nudge / シミュレーション出力のクラスターを抽出
2. TruLens で

   * そのクラスターの品質指標（優しさ、行動明確性など）をスコアリング
3. 改善ジョブ（Python）

   * 「こういうパターンではスコアが悪い」という例をまとめて LLM に渡し、
   * 新しい system prompt / スタイルガイド案を自動生成させる
4. 最終的な採用は人間（Daisuke）がレビューして反映

これで「勝手に暴走する完全自動化」ではなく、
**Anicca の声を守りながら継続的に改善**できる。

---

## 8. Voice Agent のエラー検知・安定運用

Langfuse だけだと

* 「トレースは残るけど、エージェントが変なことした瞬間にアラート」は弱い

ので、

* Realtime の tool 実装側で

  * タイムアウト
  * 連続リトライ
  * 異常なトークン長（無限ループっぽい）
* Nudge ポリシー側で

  * 一定時間内の Nudge 回数の上限
  * 同じ Nudge テンプレート連打の禁止

などの **ルールベースガードレール** を用意しておくのが現実的。

AgentSpec みたいな「DSL でエージェントの安全ルールを書く研究」も出てきているけど
0.4 ではそこまで入れず、
**シンプルなルール＋ログ監視＋アラート** で十分だと思う。

---

## 9. テスト自動化：Maestro + Mobile MCP

### 9-1. Maestro

* モバイル用 E2E テストツールとしては、今も Maestro が一番モダンで使いやすいポジション。
* スクリプトも YAML ベースで書きやすく、
  CI で iOS シミュレータに対して繰り返し流せる。

Anicca 用には：

* オンボーディングフロー（理想の姿・ストラグル選択）
* Habit 作成 / 編集
* Talk セッション開始〜終了
* Behavior タブの基本表示

などを全部 Maestro でレコーディングしておく。

### 9-2. Mobile MCP（mobile-next/mobile-mcp）

**mobile-mcp** は

* MCP サーバとして iOS / Android のシミュレータや実機を操作できる OSS
* アクセシビリティツリーを中心に扱うので、LLM からでも安定して操作できるよう設計されている

これを使うと：

* 「AI エージェントに Anicca を実際に触らせて E2E 自動テスト」
  が将来的にできる
* 例：

  * デジタルツインエージェントに行動させて Behavior タブを開かせる
  * Push 通知から Talk 画面への遷移を自動テスト

0.4 の段階では

* **回帰テスト → Maestro**
* **AI がアプリを触る自己テスト → Mobile MCP（余裕が出たら）**

という役割分担で考えるといいと思う。

---

## 10. ここまでで採用しないと決めたもの＆理由まとめ

* **Llama-3.1-Centaur / 研究向けシミュレータ系**

  * 研究としては面白いけど、スマホアプリの 0.4 本番には計算コストと実装コストが高すぎる。

* **Expected Parrot / EDSL**

  * 大規模サーベイ・マーケットリサーチには最適だが、
    Anicca の「1 人を長期に追いかけて変える」という用途には過剰。
  * 研究用に外部で試す価値はあるが、本番のコアには置かない。

* **LiveKit / VideoSDK / Vapi / Retell**

  * 通話・マルチユーザー向けなので、
    1:1 iOS アプリ内の対話には Realtime 直使用の方がシンプル。

* **Moss / Hyperspell / Sanctum（メモリ系 SaaS）**

  * 外部 SaaS やワークスペース連携に強いが、
    Anicca は iOS ログ＋自前バックエンドがメイン。
  * mem0 を自前ホストした方がコントロールしやすく、長期的にも自由度が高い。

* **Dedalus Labs**

  * MCP とマルチモデルを束ねるインフラとしては強力だが、
    今は「OpenAI＋自前ツール」だけで十分。
  * ここに乗るとインフラの自由度が下がるので、時期尚早。

---

## 11. 今後の進め方（ざっくりロードマップ）

1. **バックエンド基盤整備**

   * 行動ログ DB（Postgres + Timescale）
   * mem0 自前ホスト
   * `nudge-events` テーブルと logging

2. **Realtime Tools 実装**

   * `get_user_summary`
   * `get_future_projection`
   * `choose_nudge`
   * `log_event`

3. **Behavior タブ UI の仕様書化**

   * どの API から何を取ってきてどう見せるか
   * これは Sleek に投げる前提でコンポーネント定義まで書く

4. **Bandit ベースの Nudge エンジン**

   * `contextualbandits` を使ってオフラインで学習 → オンライン推論組込み

5. **Langfuse + TruLens 導入**

   * まずはログだけ
   * 次に評価ルール（優しさ・行動明確性など）の実装

6. **Maestro / Mobile MCP セットアップ**

---

ここまで決め切ると、

* 「どのライブラリで迷うか」
* 「どのレイヤーに何を置くか」

はかなりクリアになったはず。

次のステップとしては、

* 「Behavior タブの API 契約と画面構成を文章で決める」か
* 「Nudge エンジンの state / action / reward をもう少し数学的に定義する」

あたりを一緒に詰めていくのが良さそう。
どこから具体化したいか教えてくれたら、その部分をさらに数式レベルまで落としていこう。

[1]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com "mem0ai/mem0: Universal memory layer for AI Agents"
[2]: https://github.com/david-cortes/contextualbandits?utm_source=chatgpt.com "Python implementations of contextual bandits algorithms"
[3]: https://github.com/expectedparrot/edsl?utm_source=chatgpt.com "expectedparrot/edsl"
[4]: https://langfuse.com/docs/observability/overview?utm_source=chatgpt.com "LLM Observability & Application Tracing (open source)"
[5]: https://www.trulens.org/component_guides/evaluation/?utm_source=chatgpt.com "Evaluation using Feedback Functions"
[6]: https://github.com/mobile-next/mobile-mcp?utm_source=chatgpt.com "mobile-next/mobile-mcp: Model Context Protocol Server for ..."
[7]: https://docs.livekit.io/agents/?utm_source=chatgpt.com "LiveKit Agents"
[8]: https://www.retellai.com/?utm_source=chatgpt.com "AI Voice Agent Platform for Phone Call Automation"
[9]: https://docs.livekit.io/agents/start/voice-ai/?utm_source=chatgpt.com "Voice AI quickstart"
[10]: https://www.ycombinator.com/companies/dedalus-labs?utm_source=chatgpt.com "Dedalus Labs: Connect any LLM to any MCP tools and ..."
[11]: https://www.dedaluslabs.ai/blog/dedalus-seed-round?utm_source=chatgpt.com "We raised $11M to redefine how developers build AI agents"
[12]: https://mem0.ai/?utm_source=chatgpt.com "Mem0 - The Memory Layer for your AI Apps"
