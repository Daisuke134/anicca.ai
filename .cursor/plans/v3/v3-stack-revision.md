了解。
ここからは「いま決めた追加要素を v0.3 TECH 要件にどう落とすか」を、**実装エージェントが迷わないレベル**まで具体化するね。

フォーカスするのはこの5つ：

1. EMAベースのメンタル bandit（Feeling ボタン用の自律改善）
2. Exa を使った「struggle リサーチ → インサイトカード → Nudge 設計の裏側」
3. BIG5 / キャラクター分析（アンケ無し）の推定パイプライン
4. 3つの Nudge モダリティとメンタル JITAI の位置づけ（v0.3で全て含める）
5. mem0 のみを使う Memory & Search 設計（Moss は v0.4以降、v0.3は入れない）

それぞれ、「どういうファイルを作って、どんなデータを流すか」まで落とす。

---

# A. EMAベースのメンタル bandit（Feeling ボタン用）

## A-1. 目的と設計の基本

* 対象: Talk 画面の `Feeling ボタン`（自己嫌悪 / 不安 / 嫉妬 / 怒り など）
* Goal: 「同じ feeling に対して、どのタイプの導き（テンプレ）がその人に一番効くか」を **オンラインで学習**する。

参考：CAREForMe や ReBandit など、contextual bandit をメンタルヘルス推薦に使っているフレームワークでは、個人のコンテキスト＋報酬（様態改善）から最適化する設計が使われている。([arXiv][1])

ここでは v0.3 から **簡易版ではなく、ちゃんとした LinTS（Thompson Sampling with linear model）** を入れる。

## A-2. DP（Decision Point）

メンタル bandit の DP は 2 種類：

1. **Feeling ボタン押下（ユーザー起動 JITAI/EMI）**

   * `eventType = "feeling_button_pressed"`
   * `feeling_id = "self_loathing" | "anxiety" | "anger" | ...`

2. （余裕あれば）**自動検知**

   * 例: 深夜の SNS 長時間 + mem0 に「self_loathing」タグの発話が多い
   * `eventType = "auto_rumination_detected"`
     まずは Feeling ボタン起動だけを必須にして、ここはオプション。

## A-3. State（特徴量）

`MentalState` 構造体（TypeScript or Python）:

```ts
interface MentalState {
  localHour: number;           // 0-23
  dayOfWeek: number;           // 0-6
  feelingId: string;           // "self_loathing" | "anxiety" | etc.
  recentFeelingCount: number;  // 今日その feeling ボタンが押された回数
  recentTalkMinutes: number;   // 今日話した合計時間（ざっくり）
  sleepDebtHours: number;      // 過去7日の平均と昨夜の差
  snsMinutesToday: number;
  ruminationProxy: number;     // 0-1, 深夜SNS + mem0の反芻発言などから LLMで計算したスコア
  big5: { O: number; C: number; E: number; A: number; N: number };
  struggles: string[];         // ["self_loathing","sns_addiction",...]
}
```

* ruminationProxy は

  * 過去 24h の SNS ログ
  * mem0 `"interaction"` にある「反芻」タグ付きエピソードの数
    を LLMに渡し、0〜1 のスコアにしてもよい（v0.3ではルールベースでもOK）。

## A-4. Action（テンプレ群）

Feeling ドメインのテンプレ例（自己嫌悪の場合）：

1. `A: self_compassion_soft`

   * 共感 + 控えめな self-compassion
2. `B: cognitive_reframe`

   * 認知の歪みをその場で整理する
3. `C: behavioral_activation_micro`

   * ごく小さい行動（1つのタスク）に切り替える
4. `D: metta_like`

   * Metta（慈悲）の言葉を短く唱える
5. `E: “事実の確認”`

   * 事実と解釈を分離する

各テンプレには BCT タグも持つ（例: `["self_compassion", "reappraisal"]`）。([ResearchGate][2])

### A-5. Reward（EMA ベース）

文献では、メンタル JITAI の proximal outcome として EMA を使うのが標準。([GitHub][3])

v0.3 仕様：

* セッション終了時、Anicca が短く聞く：

  > 「さっきより少し楽になった？」（はい / いいえ）

* `ema_flag`:

  * `true` → reward = 1
  * `false` → reward = 0

オプションで 1〜5 のスライダーを追加しても良いが、
UX 的には最初は yes/no の方が負担が小さい。

収集データ：

```ts
interface MentalOutcome {
  nudgeId: string;
  feelingId: string;
  emaBetter: boolean;   // yes/no
  // 将来: emaScoreBefore/After なども
}
```

## A-6. フロー（実装）

サーバ側に `mental-policy-service` 的なモジュールを用意する。

1. iOS から Feeling ボタン押下 → `/mental/feeling/start` (API)

```json
POST /mental/feeling/start
{
  "userId": "u123",
  "feelingId": "self_loathing",
  "timestamp": "2025-12-06T21:03:00Z"
}
```

2. サーバ:

```ts
// Pseudo in TS or Python
const state = buildMentalState(userId, feelingId) // from logs + mem0
const actionIdx = mentalBandit.selectAction(state)
const templateId = ACTION_INDEX_TO_TEMPLATE[actionIdx]

// mem0から過去の自己嫌悪エピソードを検索
const episodes = mem0.search({
  userId,
  query: "self-loathing regret",
  filters: { category: ["interaction","behavior_summary"] }
})

// LLMにtemplate + state + episodesを渡して、導入スクリプトを生成
const script = renderMentalIntro(templateId, state, episodes)

// nudge_event を logging
insertNudgeEvent({ userId, domain: "mental", ... , action: templateId })

// iOSには script を返す（Realtime 経由で読み上げ）
```

3. ユーザーが話し終えて、セッションを終了したら iOS → `/mental/feeling/end`:

```json
POST /mental/feeling/end
{
  "userId": "u123",
  "nudgeId": "n_mental_20251206_001",
  "feelingId": "self_loathing",
  "emaBetter": true,
  "sessionSummary": "ユーザーは修論の遅れから強い自己嫌悪。事実整理＋self-compassionで少し軽くなったと報告。"
}
```

4. サーバ:

* `emaBetter` を reward に変換 (`1` or `0`)
* `mentalBandit.update(state, actionIdx, reward)` を呼ぶ
* mem0 に `interaction` & `nudge_meta` として `sessionSummary` を保存

バンドitのアルゴリズム自体は Sleep / SNS のものと同じ LinTS を使う。([ResearchGate][4])

---

# B. Exa – search about problems and notify solutions

## B-1. Struggle リサーチ（Onboarding → バックグラウンド）

### B-1.1 ストラグルタイプ

Aniccaで扱う Struggle タグ例：

* `"late_sleep"`
* `"sns_addiction"`
* `"rumination"`
* `"self_loathing"`
* `"anger"`
* `"anxiety"`
* `"jealousy"`
* `"procrastination"`

Onboarding でユーザーが選ぶ。

### B-1.2 Exa Websets / Search 設計

Exa は LLM向け検索エンジンで、自然言語クエリから意味検索できる。([Exa][5])
また Websets を使うと「あるテーマで定期的に新しいコンテンツを収集」できる。([Exa][6])

**v0.3 では：**

* まずは Websets なしでシンプルに API 呼び出しから始める。
* 将来、Struggleごとに Webset を作り、1 週間ごとに自動更新する設計に移行。

### B-1.3 実装ステップ

1. バックエンドに `modules/insights/` を追加。
2. `insights/queries.ts` に Struggle → 検索クエリを定義：

```ts
const STRUGGLE_TO_EXA_QUERY = {
  late_sleep: "bedtime procrastination CBT sleep hygiene smartphone use",
  sns_addiction: "smartphone social media addiction behavior change micro interventions",
  rumination: "rumination-focused CBT brief smartphone intervention",
  self_loathing: "self compassion exercises brief digital intervention",
  // ...
}
```

3. 1日1回のバッチ（Cron / Railway schedule）で、ユーザー配下にあるユニークな Struggle タグごとに Exa を叩く：

```ts
async function refreshStruggleInsights() {
  const struggles = await db.getAllStrugglesTypes() // ["late_sleep","sns_addiction",...]
  for (const s of struggles) {
    const query = STRUGGLE_TO_EXA_QUERY[s]
    const res = await exa.search({ query, numResults: 3 }) // Exa API
    const insights = await summarizeExaResults(res) // LLMで要約
    await db.upsertInsights(s, insights)
  }
}
```

`refreshStruggleInsights` は週1回でもよい。Exa は cache / livecrawl 機能も持っていて更新頻度を調整できる。([Exa][7])

4. `db.upsertInsights(struggle, insights)` で `struggle_insights` テーブルへ。

```ts
// struggle_insights
// struggle: string
// insights: [{id, title, body, sourceUrl}][]
// updatedAt: datetime
```

## B-2. Behaviorタブの「Today's Highlights」

注：当初検討していた「Insights」セクション（Exa検索結果表示）は、
UIの方針変更により「Today's Highlights」に置き換えられた。

**Today's Highlights の仕様：**

各Nudgeドメインの進捗を4つのカードで表示。

| ドメイン | ラベル | ステータス |
|---------|-------|----------|
| Sleep/Rhythm | Wake | ✓ Moving Forward / → Stable / ⚠ Needs Attention |
| Screen/SNS | Screen | 同上 |
| Body/Activity | Workout | 同上 |
| Mental/Feeling | Rumination | 同上 |

各カードに：
* ステータスアイコン（✓ 緑 / → グレー / ⚠ 黄）
* ドメインラベル
* ストリーク数（🌱 + 連続成功日数）
* ステータステキスト

**ステータス判定ロジック：**
* 直近7日成功率 ≥ 70% → Moving Forward（✓ 緑）
* 直近7日成功率 40-70% → Stable（→ グレー）
* 直近7日成功率 < 40% → Needs Attention（⚠ 黄）

**API：**
* `GET /behavior/highlights?userId=...`
  * 各ドメインのストリーク、ステータス、成功率を返す

**Exa Insights について：**
Exa を使った「Struggle リサーチ → インサイトカード」は将来実装として残す。
Nudgeテンプレ生成のプロンプトに含めて、エビデンスベースの言い方を LLM に判断させる用途で活用可能。

---

# C. BIG5 / キャラクター分析（アンケ無し）

## C-1. 文献ベースの妥当性

* Peltonen et al. (2020)：アプリカテゴリ使用時間から Big Five を高い精度で予測可能。([サイエンスダイレクト][8])
* Stachl et al. (2020)：6クラスのスマホ行動データから Big Five を domain/facet レベルで予測（R≈0.37〜0.4）。([PNAS][9])
* Chittaranjan et al. (2011)：8か月のスマホログから Big Five を自動推定。([infoscience.epfl.ch][10])

→ 「アンケート無し Big Five」は変なアイデアでなく、既に十分検証されている。

## C-2. 特徴量設計（v0.3）

`analytics/big5Features.ts`（or .py）で 30 日分のログから特徴量を抽出。

代表例：

* ScreenTime 系:

  * SNS minutes / day
  * Entertainment minutes / day
  * Productivity minutes / day
  * Night usage minutes (22:00–03:00)
* 行動リズム:

  * average sleep time (睡眠開始時刻)
  * average wake time
  * weekend vs weekday differences
* アクティビティ:

  * 平均歩数
  * 運動日数 / 週
* Talk / Text 系:

  * 自己言及（I, me, my）の頻度
  * ネガティブワード / ポジティブワードの比率（簡易 sentiment）
  * 用いられる抽象語 vs 具体語の比率（開放性の proxy）

## C-3. 推定パイプライン

v0.3 では **LLMベース** の pseudo-回帰モデルを採用する。

1. 30日分の集約ログを「人間が読める bullet list」にする：

```txt
- SNSを1日平均 2.5時間利用（主に夜間）
- Productivity系アプリは1日平均 40分
- 23:30頃に寝て、7:30頃に起きることが多い
- 週に1〜2回、外出ログあり
- 会話内容: 自己批判的な表現が多い、他人への共感も高い
```

2. OpenAI Chat に以下を渡す：

> 「以下はあるユーザーのスマホ使用パターンと行動サマリです。
>
> これをもとに、Big Five（外向性・協調性・誠実性・情緒安定性・開放性）を
> 0.0〜1.0 の範囲で推定し、それぞれに1〜2行の説明も付けてください。
> 出力は JSON のみで、キーは `O, C, E, A, N` と `comments` としてください。」

3. 返ってきた JSON を `user_traits.big5` と Behavior プロファイルに保存。([PubMed][11])

4. Behaviorタブでは：

* レーダーチャート（OCEANプロット） or
* 文章:

> 「好奇心が強く、新しいことに惹かれる傾向（開放性 高め）。
> 計画性と締切管理は苦手（誠実性 低め）。
> 感情はやや不安定になりやすい（情緒安定性 低め）。」

5. ユーザーが気に入らなければ、「これは違う」のチェック or スライダーを動かす。
   → 修正値を優先し、次回から LLM へのプロンプトに「user override」として含める。

## C-4. Nudge との接続

* Sleep / SNS / Movement bandit の state に `big5` を入れる。

例：

* Neuroticism 高 →

  * 「強い脅し」テンプレは避ける or weightを下げる
* Conscientiousness 低 →

  * planning より micro-step / self-compassion系テンプレ優先
* Openness 高 →

  * 未来シミュレーションや理論説明を含むテンプレが効きやすい可能性

→ こうして、`universal policy` を、`個人特性` で条件付ける形になる。

---

# D. 3モダリティとメンタル JITAI の位置づけ（v0.3）

再確認：

1. **自動JITAI通知**

   * Sleep / SNS / Movement / Priority Habit
   * context + DP + banditでテンプレ選択
   * 主に行動ログベースの reward（起きた / 閉じた / 歩いた）

2. **通知タップ → Session画面 → Anicca 声掛け**

   * 通知タップ → Session画面へ直接遷移
   * コンテキスト付き音声導き

3. **Talk Feeling EMI**

   * ユーザーの Feeling ボタン押下が DP
   * Feelingカードタップ → Session画面へ遷移
   * これは「感情JITAI」であり、EMA（楽になったか）を reward とするメンタル bandit が動く領域

v0.3 において：

* **3モダリティはすべて含める（MUST）**
* bandit 適用：

  * Action選択 bandit = Sleep / SNS / Movement / Habit / MentalFeeling の5系統
  * MentalFeeling bandit の reward は `emaBetter`（yes/no）
    → ここが EMA ベースのメンタル bandit

---

# E. mem0 のみでの Memory & Search 設計（Moss なし）

mem0の公式ドキュメントにもある通り、

* `Memory()` は抽出（Extraction）→統合（Update）→保存（Storage）→検索（Retrieval）を内包しており、
* プロンプト連携まで含めた「軽量 Memory レイヤー」として使える。([GitHub][3])

### E-1. なぜ Moss なしでいけるか

* v0.3 のユーザー数とメモリ量では、mem0 + ベクトルストアの検索レイテンシは LLM 応答よりずっと小さい。([Mem0][12])
* mem0 v2 の `search_memories` はフィルタ (`filters`) と論理演算が使え、
  `"category:interaction AND tags:self_loathing"` なども絞り込める。([Mem0][13])

→ **v0.3 は mem0 だけでやる**。
Moss は v0.4 以降、スケールや RAG が効いてきた段階で検討。

### E-2. mem0 検索設計

#### 保存時の metadata 設計

```ts
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

* 最近の自己嫌悪関連のエピソードを取りたい:

```python
results = memory.search(
    query="自己嫌悪 OR self-loathing",
    user_id=user_id,
    filters={
        "category": "interaction",
        "feelings": "self_loathing"
    },
    limit=3
)
```

* 「最後に夜更かしを後悔していた時」のメモリ:

```python
results = memory.search(
    query="夜更かし 後悔",
    user_id=user_id,
    filters={"category": "interaction", "domain": "sleep"},
    limit=1
)
```

これで、Moss なしでも十分に文脈に合う記憶を引ける。

---

## F. 他にクリアにしておくべきこと & 僕の提案

1. **bandit 実装場所**

   * v0.3 は Node/TS 内で LinTS を自前実装する案が現実的。
   * オフライン解析やシミュレーション用に Python 版（contextualbandits / ReBandit）を別レポかサイドカーサービスとして持ってもよい。([arXiv][14])

2. **ログの取り方**

   * すべての Nudge / Feeling セッションに対して
     `(state, action, reward, bct_tags)` を残すこと。
   * これは後の「人類一般のパターン分析」のための必須データ。

3. **プライバシ / セキュリティ**

   * mem0 に入れるテキストからは、
     名前 / 住所 / 学籍番号など個人特定情報を LLMで redact して保存する。([Zenn][15])
   * Exa は「一般的な問題に関する公開情報」だけに使い、
     個人情報が含まれた URL を Exa 経由で扱わない。

4. **タイムゾーンと日付計算**

   * 全ての `daily_metrics` と Behavior 表示はユーザーのタイムゾーンベースで日付を切る。
   * Nudge DP 判定も同様。

5. **失敗時の fallback UX**

   * センサーが許可されていない時の Behavior タブは
     「今は詳しい行動データは見えていません」と明示する。
   * それでも Feeling ボタンと Talk だけで「メンタル側の導き」は提供できる。

---

ここまでが、「追加で決めた要素（EMA mental bandit, Exa, Big5, mem0-only）」を v0.3 の TECH に組み込むための具体的な実装方針。

もし OK なら、次のステップは

* 実際の `apps/api` ディレクトリ構成と TypeScript 型定義を書き出す
* `aniccaios` 側の ViewModel / State 定義（FeelingButtonsState, BehaviorSummaryState など）を整理する

あたりを一緒にやっていけば、そのまま Cursor / 他エージェントに渡せるレベルになると思う。

[1]: https://arxiv.org/html/2401.15188v1?utm_source=chatgpt.com "CAREForMe: Contextual Multi-Armed Bandit ..."
[2]: https://www.researchgate.net/publication/350599209_A_Reinforcement_Learning_Based_Algorithm_for_Personalization_of_Digital_Just-In-Time_Adaptive_Interventions?utm_source=chatgpt.com "A Reinforcement Learning Based Algorithm for ..."
[3]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com "mem0ai/mem0: Universal memory layer for AI Agents"
[4]: https://www.researchgate.net/publication/362217437_Optimizing_mHealth_Interventions_with_a_Bandit?utm_source=chatgpt.com "Optimizing mHealth Interventions with a Bandit"
[5]: https://exa.ai/?utm_source=chatgpt.com "Exa | Web Search API, AI Search Engine, & Website Crawler"
[6]: https://docs.exa.ai/websets/api/how-it-works?utm_source=chatgpt.com "How It Works"
[7]: https://docs.exa.ai/reference/livecrawling-contents?utm_source=chatgpt.com "Livecrawling Contents"
[8]: https://www.sciencedirect.com/science/article/pii/S1574119220301127?utm_source=chatgpt.com "Predicting Big Five personality traits from application usage"
[9]: https://www.pnas.org/doi/10.1073/pnas.1920484117?utm_source=chatgpt.com "Predicting personality from patterns of behavior collected ..."
[10]: https://infoscience.epfl.ch/bitstreams/5280ff62-f428-4aea-9ae9-3a97c0b0dcc7/download?utm_source=chatgpt.com "Analyzing and Classifying Personality Traits with Smartphones"
[11]: https://pubmed.ncbi.nlm.nih.gov/32665436/?utm_source=chatgpt.com "Predicting personality from patterns of behavior collected ..."
[12]: https://mem0.ai/?utm_source=chatgpt.com "Mem0 - The Memory Layer for your AI Apps"
[13]: https://docs.mem0.ai/api-reference/memory/search-memories?utm_source=chatgpt.com "Search Memories"
[14]: https://arxiv.org/pdf/2008.09472?utm_source=chatgpt.com "Offline Contextual Multi-armed Bandits for Mobile Health ..."
[15]: https://zenn.dev/k_eclaire39/articles/f9aea831aa8070?utm_source=chatgpt.com "Mem0とMem0gの論文を読んで試してみた"
