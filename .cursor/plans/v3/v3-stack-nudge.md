了解。
ここからは **TECH.md の「Nudge＋記憶レイヤー」パートそのままになる想定**で書くね。
実装エージェントが迷わないように、できるだけ構造・フロー・データ・インターフェースまで落としておく。

※コードは「こんな感じ」というサンプルだけ軽く載せる（mem0 / bandit 部分は実際のAPI・論文ベースで書く）。([docs.mem0.ai][1])

---

# Anicca v3 TECH – Nudge & Memory Layer 要件定義

## 0. スコープ

この章で定義するのは：

1. **Nudgeポリシー**

   * どのドメインで
   * いつ（Decision Point）
   * どのような文言・チャネルで Nudge を出すか
   * どう成功/失敗を判定するか
   * どう自律改善（contextual bandit）するか([PMC][2])

2. **記憶レイヤー**

   * mem0 を使って何を保存するか（プロフィール・エピソード・サマリ等）([GitHub][3])
   * それを Nudge/Behavior/Feeling の各場面でどう使うか
   * Nudge 自律改善とメモリの関係

Nudge のモダリティ（種類）は v3 時点で次の 3 つ：

1. 自動JITAI通知
2. 通知タップ → Open App → Aniccaの声掛け
3. Talk画面の Feelingボタンからのユーザー起動 EMI（Ecological Momentary Intervention）

---

## 1. Nudge 力学ドメイン

### 1.1 ドメインの定義

文献上、モバイルJITAIは主に「生活リズム・スクリーンタイム・身体活動・メンタルヘルス」をターゲットにしている。([Frontiers][4])

Anicca v3 では、Nudge の “力学ドメイン” を次の 4 つに定義する：

1. **リズム / 睡眠**

   * 起床・就寝・睡眠時間
   * 夜更かし・bedtime procrastination([docs.mem0.ai][1])

2. **スクリーン / 依存**

   * SNS / Video / Game の連続利用
   * 特に深夜の使用([PyPI][5])

3. **身体活動**

   * 座りっぱなし時間
   * 歩数・ランニング・筋トレ([Zenn][6])

4. **メンタル / 感情・認知**

   * 自己嫌悪・怒り・不安・嫉妬・反芻 etc.
   * 主に Feelingボタンで扱う（JITAI/EMI）([SpringerLink][7])

### 1.2 Onboarding → ドメイン有効化

Onboarding でユーザーが選ぶのは：

* 理想タグ（例：早起き、マインドフル、自律、Runner, Muscular, 誠実 etc.）
* Struggleタグ（例：夜更かし、スマホ依存、自己嫌悪、反芻、怒り、不安 etc.）

これを各ドメインにマッピングする。

例：

* リズム

  * 理想：「早起き」「朝型」
  * Struggle：「夜更かし」「寝不足」「起きられない」
* スクリーン

  * Struggle：「SNS依存」「YouTube見過ぎ」「スマホ依存」
* 身体活動

  * 理想：「体力がある」「Runner」「Muscular」
  * Struggle：「運動不足」「座りっぱなし」
* メンタル

  * 理想：「マインドフル」「冷静」「ストレス少ない」
  * Struggle：「自己嫌悪」「怒り」「嫉妬」「反芻」「混乱」「不安」

**仕様**：

* 各ドメインは Onboarding の結果から
  `enabled_domains = {rhythm, screen, body, mental}` を決定
* 別途、ユーザーが Habit 設定画面で
  「優先習慣（起床/瞑想/筋トレ/ランニング etc.）」を選ぶと
  Habit-followup ドメインも有効化

UX的に余計なトグルは増やさず、
**Onboarding を通してドメイン有効化まで済ませる**。

---

## 2. 記憶レイヤー（mem0）設計

### 2.1 mem0 の利用方針

mem0 は LLM/エージェント向けの長期記憶レイヤーで、
Python SDK を使って `add()`, `search()` で手軽に記憶を出し入れできる。([GitHub][3])

サーバ側（Python）では OSS版 mem0 を利用し、
行動ログなどの構造化データは Postgres に持ちながら、
「LLMに渡したい文脈」だけを mem0 に載せる設計とする。

### 2.2 メモリの種類

mem0 で扱うメモリ種別：

1. **Profile Memory**（ユーザーの性質）

   * 理想タグ
   * Struggles
   * Big Five / 性格推定
   * 好み（Nudge 強度、声の好み etc.）

2. **Interaction Memory**（対話・Feelingセッション）

   * 自己嫌悪セッションの要約
   * 怒り・不安などの重い相談
   * ユーザーの「決意」「価値観」に関する発話

3. **Behavior Summary Memory**（日・週の行動要約）

   * 「この週は眠りが安定していた」
   * 「最近夜更かしが増えている」
   * 「3日連続で早起きに成功した」

4. （v4以降）Nudge Meta Memory

   * 「この人には◯◯タイプの起床Nudgeが効きやすい」
   * Banditから得られたメタ情報を自然言語で保存する時に使う

### 2.3 mem0 の使い方（サンプル）

mem0クラウドSDKの例（MemoryClient）([docs.mem0.ai][1])

```python
from mem0 import Memory  # OSS版
memory = Memory()

# プロフィールの保存
profile_text = "User ideals: ['early_riser', 'mindful']; struggles: ['late_sleep', 'self_loathing']"
memory.add(profile_text, user_id="user_123", metadata={"type": "profile"})

# 対話の重要エピソード保存
session_summary = "2025-12-06: ユーザーは研究での失敗から強い自己嫌悪を感じたが、夜に整理して少し軽くなった。"
memory.add(session_summary, user_id="user_123", metadata={"type": "interaction", "feeling": "self_loathing"})

# 検索
results = memory.search(query="最近の自己嫌悪", user_id="user_123", limit=3)
for m in results["results"]:
    print(m["memory"])
```

TECH要件：

* mem0 は **「LLMに渡すテキスト文脈だけ」** を持つ
* 行動ログ（起床時刻・SNS時間 etc.）は Postgres で管理する
* mem0 の `metadata` に `{"type": "profile"|"interaction"|"summary", "tags": [...]}` を入れ、filter しやすくする([docs.mem0.ai][8])

---

## 3. Nudge ポリシー – 全体の流れ

### 3.1 イベント種別

Nudge イベントの発生パターン：

1. **自動JITAI通知**

   * ドメインごとの Decision Point をルールで検知
   * bandit で「送る／送らない＋テンプレID」を決定
   * 通知を Push

2. **通知 → Open App → Anicca声掛け**

   * 1 の通知をタップ → Talk画面に遷移
   * 直後に Anicca が音声で語り始める（テンプレ＋mem0コンテキスト）

3. **Talk画面 Feelingボタン EMI**

   * ユーザーが [自己嫌悪] / [不安] 等のボタンを押す
   * サーバ側でその feeling を受け取り、
     mem0 から関連エピソードを検索し、
     導入スクリプト＋声掛けを生成して再生

### 3.2 ログ（NudgeEvent）の定義

**NudgeEvent テーブル（Postgres）：**

* `id` (uuid)
* `user_id`
* `timestamp`
* `domain` ("rhythm"|"screen"|"body"|"mental"|"habit_followup")
* `subtype` (例："wake", "night_sns", "sedentary", "self_loathing" etc.)
* `decision_point_type` ("wake_window", "sns_30min", "sedentary_90min"...)
* `state_vector`（JSON）
* `action`

  * `sent: bool`
  * `template_id: int | null`
  * `channel: "notification"|"notification+voice"|"talk_feeling"`
* `short_term_outcome`（JSON：起きた/アプリ閉じた/立ち上がった etc.）
* `reward` (float, 基本0 or 1)
* `ema_score` (optional, v3.5〜)

このデータは bandit 学習用・オフライン解析用に使う。

---

## 4. 自動JITAI通知（例：起床・SNS・座位・習慣フォロー）

### 4.1 Decision Point ルール（例）

#### 起床（rhythm）

* `target_wake = avg_wake_7d - 15min` を anchor とする（CBT-I の時間窓調整に倣ったステップサイズ）。([docs.mem0.ai][1])
* Decision Point：

  * `now` が `target_wake` ± 5 minutes
  * HealthKit Sleep 的にまだ起床していない
  * 「今日は静かにして」モードでない

#### SNS（screen）

* DeviceActivity API（Screen Time Framework）で

  * FamilyActivityPicker で選ばれた SNS/Video アプリの使用開始・使用時間を監視。([Apple Developer][9])
* Decision Point：

  * 平日9–23時に SNS/Video連続利用 >= 25分
  * その日既にSNS Nudgeを3回以上出していない

#### 座位（body）

* CoreMotion / HealthKit で `stationary` が 90分以上継続。([Zenn][6])
* ただし夜23時以降や、理想/Strugglesに運動が含まれていない人には出さない。

#### 習慣フォロー（habit_followup）

* 一日の終わり（21〜23時）に

  * その日やるべき「優先習慣」が未達成
  * かつ著しくメンタルが落ちていない（自己嫌悪が過剰な日は skip）
* → フォローアップNudge候補を立てる

**v3での学習方式**: ルールベース（固定テンプレ選択）＋ログ収集のみ
- 理由: 成功/失敗の判定に24時間かかるため、即時学習が困難
- v3.1で遅延報酬対応LinTSを導入予定（surrogate reward / discount factor の検討）

---

### 4.2 state ベクトル構築

`State` は domain-specific な構造体だが、共通コンポーネントを持つ。

例：WakeState

* `time_of_day` (float sin, cos)
* `weekday` (0–6 one-hot)
* `avg_wake_7d` (hour)
* `sleep_debt` (hour, 過去7日平均との差)
* `wake_success_rate_7d` (0–1)
* `big5_C`, `big5_N`
* `has_struggle_late_sleep` (bool)
* `nudge_intensity` ("quiet"|"normal"|"active")
* `recent_feelings_self_loathing` (count today)

実装例（Python pseudo）：

```python
@dataclass
class WakeState:
    time_sin: float
    time_cos: float
    weekday_onehot: list[int]
    avg_wake_7d: float
    sleep_debt: float
    wake_success_rate_7d: float
    big5_C: float
    big5_N: float
    has_struggle_late_sleep: bool
    nudge_intensity: str
    recent_self_loathing_count: int
```

`features.build_wake_state(user_id, now)` でこれを埋める。

---

### 4.3 bandit による Action 選択

論文的には、

* 線形コンテキスト付きbandit（LinUCB / Action-centered bandit）が
  mHealth用途でよく使われており、解釈性が高い。([arXiv][10])

v3 仕様：

* ドメインごとに 1 モデル（WakeBandit, ScreenBandit 等）
* Action セット（Wake例）：

  | id | 説明                         |
  | -- | -------------------------- |
  | 0  | do_nothing                 |
  | 1  | gentle_template            |
  | 2  | direct_template            |
  | 3  | future_simulation_template |

擬似コード：

```python
wake_bandit = WakeBanditPolicy(...)  # LinUCB or TS

def decide_and_maybe_send_wake_nudge(user_id, now):
    if not in_wake_decision_window(user_id, now):
        return

    state = features.build_wake_state(user_id, now)
    action = wake_bandit.select_action(state)

    if action == 0:
        log_nudge_event(user_id, state, action, sent=False)
        return

    template = wake_templates.get(action)
    context_texts = interaction_store.search_feeling_history(
        user_id, feeling_id="late_sleep", limit=3
    )

    message = llm_render_wake_message(template, state, context_texts)
    send_push_notification(user_id, message)

    log_nudge_event(user_id, state, action, sent=True)
```

---

### 4.4 成功/失敗判定と bandit 更新

文献ベースでは、
「Nudge後1時間のステップ数」「Nudge後の反芻スコア変化」などを
proximal outcome として扱い、bandit / RL の報酬とするケースが多い。([PMC][2])

Anicca v3 の例：

#### 起床

* Reward 判定：

  * Nudge後 30〜60 分以内に

    * HealthKit の起床時刻が `target_wake + 60min` 以内
    * かつ DeviceActivity の使用継続（ベッドから出た可能性が高い）

* `reward = 1 if success else 0`

bandit 更新：

```python
def update_wake_nudge(nudge_event_id):
    event = fetch_nudge_event(nudge_event_id)
    state = event.state
    action = event.action
    reward = compute_wake_reward(event, logs)
    wake_bandit.update(state, action, reward)
    update_nudge_event_reward(nudge_event_id, reward)
```

#### SNS / 座位は前述の成功条件（アプリ閉じた／立ち上がった）で同様に判定。

---

## 5. 通知 → Open App → 声掛けのフロー

1. 自動Nudgeで通知送信（上記）

2. ユーザーが通知をタップ

3. iOS が Talk画面へ遷移し、`nudge_id` をクエリ or deep link で渡す（例：`anicca://wake?nudge_id=...`）

4. Talk画面ViewModelが `GET /nudge/{nudge_id}/context` を叩く

5. サーバ側：

   * `nudge_event = load_nudge_event(nudge_id)`
   * `profile = profile_store.load_profile(user_id)`（mem0）
   * `episodes = interaction_store.search_feeling_history(user_id, relevant_feeling, limit=3)`（mem0）
   * テンプレ＋state＋プロフィール＋過去エピソードを LLMに渡し、
     **音声スクリプト（Aniccaの導入＋数ターン）** を生成

6. iOSは音声合成（OpenAI Realtime / TTS）で再生

**ポイント**：

* 文言生成時にも mem0 検索結果をプロンプトに含めることで、
  「前にもこういうことがあったよね」といった “覚えている感じ” を出す。([Zenn][6])

---

## 6. Talk画面 Feelingボタン（ユーザー起動 EMI）

### 6.1 overview

* 4つのカード（縦並び）：
  - 上3つ: 動的に選択（Strugglesから）
    例: [ 自己嫌悪 ] [ 不安 ] [ 怒り ]
  - 4つ目: 固定「Something else」（フォールバック）

* 押した瞬間に

  * `POST /feeling_trigger` がサーバへ
  * Anicca がその feeling に対応した導入を"一方的に"話し始める

### 6.2 TECHフロー

1. iOS → `POST /feeling_trigger`

```json
{
  "user_id": "user_123",
  "feeling_id": "self_loathing",
  "timestamp": "2025-12-06T21:03:00Z"
}
```

2. `domain/mental.py`:

```python
def start_feeling_session(user_id: str, feeling_id: str):
    state = build_mental_state(user_id, feeling_id)
    past_episodes = interaction_store.search_feeling_history(
        user_id, feeling_id, limit=3
    )
    template = mental_templates.get(feeling_id)  # v3では固定

    script = llm_render_feeling_intro(template, state, past_episodes)
    # script: list of {role, content} for first turns

    interaction_store.save_feeling_session_start(
        user_id, feeling_id, script_summary_short(script)
    )
    return script
```

3. Talk画面は `script` を受け取り、
   OpenAI Realtime経由で音声で再生し始める。

4. セッション終了時（ユーザーが終わらせる or 一定時間）に
   `save_feeling_session_end(user_id, feeling_id, full_summary)` で mem0 に要約保存。

### 6.3 EMA（感情 self-report）について

* 文献的には、
  「JITAI-MRFCBT（反芻を対象としたJITAI）では、反芻の強さをEMAで測定し、それを proximal outcomeにした」と報告されている。([Frontiers][4])

* v3.0では
  – Feeling セッション後の EMA は必須ではなく、
  – まずはログとセッション要約だけで運用

* v3.5以降の拡張として：

  * Endingで「さっきより少し楽になった？」（はい/いいえ）
    or 「今の気持ち（1〜5）」を聞く
  * これを `ema_score` フィールドに保存し、
    v4で Feelingドメイン用 bandit の reward として使う

---

## 7. 自律改善（オンライン＋オフライン）

### 7.1 オンライン（v3）

* ドメインごとに contextual bandit（線形モデル）を持ち、
  Decision Pointごとに action を選び、
  短期行動の成功/失敗で更新する。([arXiv][10])

**v3 で LinTS 学習 ON のドメイン:**

| ドメイン | 成功判定時間 | v3 学習 | 備考 |
| --- | --- | --- | --- |
| Wake | 30–60分 | ✅ ON | HealthKit起床 + DeviceActivity使用継続 |
| Bedtime | 90分 | ✅ ON | HealthKit sleep start + SNS<15分 |
| Morning Phone | 5–30分 | ✅ ON | SNS/Videoクローズ + 再開なし |
| Screen | 5–30分 | ✅ ON | 対象アプリクローズ + 再開なし |
| Movement | 30分 | ✅ ON | 歩数+300〜500 or 歩行イベント検出 |
| Mental | 即時（EMA） | ✅ ON | 「楽になった？」Yes/No |
| **Habit** | **24時間** | ❌ OFF | v3.1で対応（ルールベース＋ログ収集のみ） |

**自律改善サイクル（LinTS ON ドメイン）:**
1. Cold Start（mu=0）: 最初はランダムに近い選択
2. データ収集: nudge_events, nudge_outcomes に記録
3. 成功/失敗判定: 5分〜90分後に確定
4. LinTS.update(): モデルが賢くなる
5. 次のNudgeが最適化される（自律改善）

* これにより、
  「この人＋この状況にはどのテンプレが効きやすいか」が少しずつ学習される。

### 7.2 オフライン（v3後半〜）

* NudgeEvent + BCTタグ + state特徴をまとめて
  BigQuery / DuckDB などで分析：

  * 「どのBCTの組み合わせがどのタイプに効くか」([Microsoft for Developers][11])
  * 「どういう行動原型（セグメント）が存在するか」([PMC][12])

* 将来的には hierarchical bandit / RoME / IntelligentPooling 等で
  エージェントレベルの「メタポリシー」を推定する（v4以降）。([GitHub][3])

---

この TECH セクションをベースにすれば、

* 何をいつ Nudge するか（JITAIルール）
* どう state を作り、どう bandit に渡すか
* 成功/失敗をどう判定し、どう学習するか
* mem0 に何を保存し、どこで検索して LLMに渡すか
* 通知 / Open App / Feelingボタンの3パターンそれぞれのフロー

が、実装エージェントにとってかなりクリアになるはず。

ここから先は、
各ドメインごとに「Stateフィールド一覧」「成功条件」「テンプレ案」を1枚ずつ書けば、
そのまま Cursor や別モデルに「この仕様通りに実装して」で投げられるレベルになると思う。

[1]: https://docs.mem0.ai/api-reference/memory/add-memories?utm_source=chatgpt.com "Add Memories"
[2]: https://pmc.ncbi.nlm.nih.gov/articles/PMC8439432/?utm_source=chatgpt.com "Personalized HeartSteps: A Reinforcement Learning ..."
[3]: https://github.com/mem0ai/mem0?utm_source=chatgpt.com "mem0ai/mem0: Universal memory layer for AI Agents"
[4]: https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1460167/pdf?utm_source=chatgpt.com "Beyond the current state of just-in-time adaptive ..."
[5]: https://pypi.org/project/mem0ai/0.1.13/?utm_source=chatgpt.com "mem0ai 0.1.13"
[6]: https://zenn.dev/kun432/scraps/b5660b7479fa73?utm_source=chatgpt.com "LLMアプリにメモリレイヤーを追加する「mem0」を試す（セルフ ..."
[7]: https://bmcpsychology.biomedcentral.com/articles/10.1186/s40359-023-01249-5?utm_source=chatgpt.com "Investigating two mobile just-in-time adaptive interventions to ..."
[8]: https://docs.mem0.ai/api-reference/memory/search-memories?utm_source=chatgpt.com "Search Memories"
[9]: https://developer.apple.com/documentation/screentimeapidocumentation?utm_source=chatgpt.com "Screen Time Technology Frameworks"
[10]: https://arxiv.org/pdf/1706.09090?utm_source=chatgpt.com "An Actor-Critic Contextual Bandit Algorithm for ..."
[11]: https://devblogs.microsoft.com/foundry/azure-ai-mem0-integration/?utm_source=chatgpt.com "Building AI Applications with Memory: Mem0 and Azure AI ..."
[12]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12421209/?utm_source=chatgpt.com "A Social Support Just-in-Time Adaptive Intervention for ..."

Feelingボタン（ユーザー起動 EMI）の TECH 仕様（v3）

ここは JITAI というより「エコロジカルモーメンタリ介入（EMI）」に近い。
感情ベースのJITAI研究では、

ストレスや感情の EMA（その瞬間の自己報告）をベースに短いCBT/マインドフルネス介入を出すパターンが多い。

v3では：

ユーザーが Feelingボタンを押した瞬間が「self-EMA」とみなせる

まだスコア (1〜5) までは聞かない

介入内容は暫定的にルールベース＋テンプレ固定

反応（その後の行動・Talk内容）は mem0 に保存しておき、v4で bandit / EMA に活かす

4-1. フロー

iOS: [自己嫌悪] ボタン押下 → POST /feeling_trigger to api → nudge-service に転送

nudge-service:

state_features を軽量に作成（時刻・最近のログ・Personalityなど）

ProfileMemory を mem0から検索

InteractionMemory から最近の自己嫌悪関連メモリを検索

テンプレ固定（v3）：

自己嫌悪用のテンプレセット

導入：共感＋「前にもこういうことがあった」

中盤：CBT的整理＋self-compassion

終わり：明日へ返す一言

LLMに context＋テンプレを渡し、パーソナライズされた音声テキストを生成

トーク開始（アプリ内音声）

セッション終了後、InteractionMemory に「今日のセッション要約」を保存

v4以降：

セッション後に1問だけ「今、少し楽になった？」（はい/いいえ or 1〜5）を聞いて
それを reward として Feeling系 bandit を導入できる

文献的にも、EMA（感情評価）をproximal outcomeに使うのはメンタルJITAIで標準的。