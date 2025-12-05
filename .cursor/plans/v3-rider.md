いいところまで設計きたので、
ここでは

1. Moss を入れると「具体的にどんな体験」が作れるか
2. Exa を加えて「search about problems and notify solutions」をどう実現するか
3. あなたがリストした機能が、今の計画のどこまでカバーされていて、何をどう足すか

この3つに分けて整理するね。

---

## 1. Moss で何ができるか（何のために入れるのか）

まず整理すると：

Moss は
「自分でインデックスしたデータに対して、
サブ 10ms で意味検索できるランタイム」
であって、Web 検索エンジンではない。([usemoss.dev][1])

つまり

・Anicca が覚えたこと（mem0 の記憶＋日次サマリ）
・ユーザーの過去の行動ログを要約した文章
・Anicca 独自の「教え」（quotes や原理）

を Moss に流し込んでおくと、
「その場で一瞬で一番関係ありそうなものを引いてこれる」ようになる。

### 1-1. Moss のツールとしての位置づけ

Anicca が使えるツールとしては、
ざっくりこうなる。

1. mem0
   長期記憶（意味・エピソード）を書く／読む

2. Moss
   その長期記憶＋行動サマリを
   「今の話題」に一番近い順で高速に引き当てる

Realtime 的には

・`tool: get_context_snapshot` の中で
内部的に `mem0` ではなく `moss.search` を叩く
・`tool: search_my_past` みたいなユーザー向け機能を追加

という感じ。

### 1-2. Moss で追加できるユーザー体験

1. Talk タブで「本当に覚えてる感」を出す

例：

ユーザー
「また夜更かししちゃった…」

Anicca（内部）
Moss にクエリ
「このユーザーの過去の夜更かし後悔エピソードと、うまくいった日を出して」

Moss
mem0 に保存された
・「先週 3 日連続で 23:00 に寝られてうれしかった」
・「2 週間前、YouTube 見すぎて翌朝死んだ発言」
などを即座に返す。

Anicca（音声）
「先週 3 日連続で 23 時に寝て、『朝が楽だった』って話していましたよね。
　2 週間前の YouTube 徹夜はかなりつらそうでした。
　今日はどっちの自分に近づきたいですか？」

こういう「過去の具体的な自分の言葉を引用してくる」体験は、
Moss みたいな高速 semantic search があるとかなり自然にできる。

2. Behavior/Profile タブで「自分史検索」

Behavior タブに「検索バー」をつけておく。

例：

・「いつから早起きが続いているか」
・「最後に ‘自分を誇らしく感じた日’」
・「Anicca に ‘もうやめたい’ と言ったのはいつか」

などを入力すると、
Moss が mem0 ＋サマリから該当エピソードを返し、
タイムライン上にハイライト表示できる。

3. シミュレーションの文脈強化

未来予測を書くときに

・「うまくいっていた週」
・「地獄だった週」

の記憶を Moss から引いて、
それをベースに 1年後・5年後のストーリーを書く。

例：
「あなたが一番安定していた週は、
　23:00 就寝・7:00 起き・SNS 2 時間・歩数 8000 の週でした。」
→ これを元に「改善された 1 年後」の一日を書かせる。

4. 「Anicca quotes」や教えの検索

Anicca 独自の quotes / 智慧集みたいな文書（教本）を作るとき、
それも Moss インデックスに入れておけば、

・「今の文脈に合う Anicca quote」を 1 ミリ秒で引く
・Talk タブの上に “今日の言葉” を出す

みたいな使い方もできる。

この辺はまさに Moss の「conversational AI 向け real-time retrieval」というポジションと噛み合っている。([ycombinator.com][2])

---

## 2. Exa を入れて「search about problems and notify solutions」をどうやるか

Moss は「自分の世界」での検索。
Exa は「Web 全体」での検索。

Exa は LLM 向けに最適化された Web 検索・クロール API で、
SERP API・Answer API・Deep Research API などがある。([Exa][3])

### 2-1. どういう体験にするか

あなたが言っている

search about problems and notify solutions

を、そのまま UX にするとこんな感じになる。

1. オンボーディングで「悩み」を選ぶ

・夜更かし
・SNS 依存
・ギャンブル依存
・ポルノ依存
・筋トレが続かない
・怒りっぽい
・不安が強い
・誠実でいられない気がする

などの選択肢をタップしてもらう。

2. バックグラウンドで Exa が勝手に調べまくる

例えば「夜更かし」を選ばれたら、

・Exa Answer / Deep Research に対して
`"evidence-based behavioral interventions to reduce bedtime procrastination, for young adults, high smartphone usage"`
を投げる。([youtube.com][4])

Exa は

・関連論文
・専門家のブログ
・行動科学ベースの CBT / JITAI 施策
などをまとめて返してくれるので、
LLM 側で

・Anicca 用「夜更かし対策プレイブック」
(例：ベッド前のルール、夜スマホ制限の方法、翌朝フィードバックのやり方)

に変換する。

これを「そのユーザー専用の”対策パック”」として mem0 に保存。

3. 「問題について調べた上での通知」

たとえば夜更かし問題なら、
以下のような通知ができる。

・オンボーディング直後の “Starter Pack” 通知
「あなたの ‘夜更かし’ について、科学的な解決策をいくつか調べてみました。
その中から、今週やってみると良さそうな 3 つを選びました。」

・日々の micro-教育通知
「寝る 1 時間前にスマホを手放すのが難しいのは、Willpower だけの問題ではありません。
今日は ‘環境を変える’ 方法を 1 つだけ試してみませんか？」

・Behavior タブの「対策カード」
「あなたの ‘夜更かし’ 問題のために、
Anicca はこの 3 パターンの対策を用意しています。」
（Exa + LLM で事前に生成）

4. 長期的な「問題別ニュースレター」

Exa は Websets API で、
特定テーマについて新しい情報が出た時に毎日更新できる。([Exa][5])

例えば

・「スマホ依存の行動介入に関する新しい RCT 論文」
・「筋トレ継続のための最新研究」

などを自動監視して、
Anicca がたまに

「あなたの ‘SNS 依存’ に関連する新しい研究が出ました。
それを踏まえると、nudge の仕方をこう変えていきたいです。」

とアップデートしていくこともできる。

### 2-2. 実装的な接続

Exa 用に Backend に

・`ProblemResearchService`（Python）

1. `enqueue_problem(user_id, problem_tag)`
2. `run_research_job()` バッチで Exa API を呼ぶ
3. 結果をまとめて mem0 に保存（`"problem_guide"` カテゴリ）

・Realtime tool
`tool: get_problem_insights(problem_tag)`
→ mem0 からそのユーザー向けの「整理された知見」を返す
→ LLM がこれを元に通知文・対話を組み立てる

この構造にしておけば、
Moss + mem0 は「このユーザー内部の世界」
Exa は「外の世界の知識」
という役割分担でキレイに分かれる。

---

## 3. あの機能リストはどこまで計画に入っているか

リストを一つずつ見て、

1. 今の仕様に既に含まれているか
2. どう実装するか（Moss / Exa を含めて）
   を簡潔に整理する。

### 3-1. すでに計画に入っているもの

1. current activity logs
   → Long-term Rhythms / Momentary State で設計済み。
   実装的には
   ・iOS の DeviceActivity / HealthKit / CoreMotion
   ・Backend の Metrics 集約
   で実現。

2. future prediction of user
   → 明日の 1 日シミュレーション、1・5・10 年シナリオとして仕様済み。
   実装は Simulation Service（OpenAI Chat）でやる。

3. prediction of today + tomorrow
   → 「今日残りの 1 日」と「明日 1 日」のタイムラインとして Behavior タブに表示。
   ここに Moss を絡めると
   「過去の ‘良い日’ パターン」と比較したコメントが書ける。

4. iterate nudge from user feedback
   → Nudge Response History ＋ bandit で学習。
   ユーザーの「良かった／うざい」フィードバックも mem0 に保存。
   Moss で「過去の成功・失敗 nudge を引っ張ってきて、説明に使う」こともできる。

5. BIG5, character analysis
   → Trait Profile で仕様済み。
   実装としては
   ・Onboarding 質問
   ・対話ログ＋SNS を LLM に与えて推定
   ・結果を mem0 に保存。

6. search about problems and notify solutions
   → 今回 Exa で明確に入れた。
   Onboarding で選ばれた problem_tag ごとに、
   ProblemResearchService + Exa でプレイブックを作り、
   Behavior タブや通知で出す。

7. memorize what user said
   → mem0 ＋ Moss でガチの実装になる部分。
   Realtime 会話から重要発話を摘出して mem0 に入れ、
   Moss で検索して再利用。

8. iterate features on the user’s simulation
   → 今は「Simulation Service のプロンプト・ロジックをログ＋評価から改善する」という形で設計。
   将来的には Langfuse + TruLens でシミュレーションの「説得力」を評価して自動改善もできる。

### 3-2. まだ明示的に書いていなかったが、簡単に組み込めるもの

1. Anicca quotes on talk tab
   実装案
   ・Anicca のオリジナル quotes を 100 個くらい用意して mem0 に保存
   ・Moss で「今の話題に近い quote」を検索
   ・Talk タブ上部や Behavior タブに「今日の Anicca quote」として表示
   → Moss を入れると「コンテキストに合う名言」を一瞬で引けるので相性抜群。

2. affirmation, preaching, struggle as max 3 buttons
   （例: “I’m mad” → tailored guidance）
   実装案
   ・Talk タブの下に 3 つ程度のボタンを常設
   「Affirmation」「Preaching」「今の struggle」など
   ・押されたら Realtime に対応する `tool_call` を送る
   例：`tool: handle_affirmation(mode="mad")`
   ・Backend で
   ・mem0 + Moss から「怒りに関する過去の記憶」
   ・Exa から「怒り・情動制御に関する CBT / 仏教的教え」
   を引いて、合わせ技で tailored guidance を返す

3. prompt followup when failed
   実装案
   ・ある nudge を送った後、行動変化が無かった（reward 0）場合
   → 30〜60 分後に「フォローアップ nudge」を自動生成
   ・Policy Service 側で
   「失敗した nudge の followup テンプレ」を持つ
   ・mem0 に「失敗ログ」も保存して、後の学習にも使う

4. link data to account habit streaks
   実装案
   ・Backend で「早起きストリーク」「筋トレストリーク」「夜スマホ自制ストリーク」を算出
   ・Talk の中や Behavior タブで
   「起床ストリーク 5 日目」などを自然な形で言及
   ・Nudge 自体がストリークを励ますように変わっていく（bandit の reward に「ストリーク維持成功」を入れる）

5. multiple voices
   実装案
   ・OpenAI Realtime のマルチボイス（male/female/neutral/師匠風 etc.）を、
   Trait Profile の「好み」またはトグルから選べるようにする
   ・voice 選択は mem0 に保存
   ・将来「厳しめモード」「やさしめモード」で声を切り替えることもできる

6. sticky mode on main tab
   実装案
   ・Talk タブの UI 改修
   「常時 Anicca が待機していて、すぐ喋り始められる状態」
   ・技術的には Realtime セッションを長めに維持、
   バックグラウンドへの移行と復帰に注意

7. better paywall
   実装案
   ・これは主に UI/UX + RevenueCat 側の設計
   ・技術スタック的には今のものを改善（プラン説明 / 年間プラン etc.）で完結。
   → Persuasion Agent のコアとは独立だが、Behavior タブや未来シミュレーションを「Pro 機能」として出し分ける、などの設計はあり。

8. take survey -> show simulation accuracy + update persona
   実装案
   ・Behavior タブで「シミュレーションの当たり具合」を 1〜5 で評価するミニサーベイ
   ・「あなたに対する理解をアップデートしていい？」みたいな対話
   ・その回答を mem0 に保存し、Trait Profile とシミュレーションロジックを調整

### 3-3. まだ設計していなかったもの

ほぼ全部どこかに入っているので、「完全に未カバー」はあまりない。
強いて言えば

・sticky mode の細かい UX
・multiple voices の声の人格・プロンプト設計

くらいで、
これは v0.3.1 / 0.4 で一段レイヤー上に乗せていくイメージ。

---

## 4. まとめ：Moss + Exa を入れたときの全体像

ざっくりまとめると

1. Moss
   ・Anicca の「内側の世界」（mem0 ＋行動サマリ）を高速に検索
   ・過去の自分の言葉・成功体験・後悔を、その場で引っ張ってきて nudge に使う
   ・Behavior タブで「自分の歴史を検索する」UIも実現できる

2. Exa
   ・外の世界の知識を、ユーザーの「悩み」ごとに自律的に収集
   ・オンボーディングで選んだ問題に対して、
   長期的にアップデートされる「対策プレイブック」を生成
   ・search about problems and notify solutions を
   「Starter Pack」「日々の micro-教育」「問題別ニュースレター」として体験化

3. それ以外の機能は
   今の設計＋ Moss / Exa を横に添えるだけでほぼ全部カバーできる。

この前までの仕様書は「何を覚えるか」「どんなコンテキストを持つか」だったので、
今回の話で

・Moss：内側の検索
・Exa：外側の検索

という役割がハッキリ決まったと思う。

次にやるなら、

・Exa Research の具体プロンプトセット（問題カテゴリごとの検索クエリと、まとめ方）
・Moss に流し込むテキストの構造（mem0 のどのメモをどう normalize するか）

を一緒に詰めていけば、そのままコードに落とせるはず。

[1]: https://www.usemoss.dev/?utm_source=chatgpt.com "Moss"
[2]: https://www.ycombinator.com/companies/moss?utm_source=chatgpt.com "Moss: Real-time semantic search for Conversational AI"
[3]: https://exa.ai/?utm_source=chatgpt.com "Exa | Web Search API, AI Search Engine, & Website Crawler"
[4]: https://www.youtube.com/watch?v=uQu7Dp5x3KM&utm_source=chatgpt.com "Building Search for AI Agents with Exa"
[5]: https://exa.ai/demos?utm_source=chatgpt.com "LLM + Web Search API Demos and Tutorials"

了解。
ここからは **あなたが今計画書に貼っているコンテキストを“さらに正しく・ブッダ的・能動的エージェントとして完成させるための追加仕様”** を、
あなたが求める哲学・体験設計・技術スタックすべて踏まえて **超具体的に整理していく**。

---

# **0. まず最初に：あなたの追加ポイントの意図を正しく解釈した結論**

1. **Moss** は「ユーザーの内的宇宙を瞬時に参照するための“記憶検索エンジン”」。
   → *悟りの種（過去の気づき・後悔・発見）を瞬時に引き出して今のコンテキストと結びつける。*

2. **Exa** は「外の世界を調べ、智慧を増やすための“外界検索エンジン”」。
   → *ユーザーが抱える問題について Anicca が主体的に調べ、導きの原理（Dharma）をエージェント自身が都度アップデートする。*

3. **Anicca quotes / Buddhist Wisdom（ダンマパダ等）** は「エージェントの核となる哲学的“智慧スタック”」。
   → *Moss に入れて、会話中の適切な瞬間に自然に引用してくれるようにする。
   ダンマパダはパブリックドメイン。(©が切れているため使用可能)*
   → **可。**

4. **提案ではなく導く**
   → あなたが言うように、
   **Anicca は“assistant”ではなく“guide（導師）”になるべき。**
   → 選択肢や「どうですか？」は完全に排除する。
   Instead: **「今は〇〇をする時だよ」「さぁ、起きよう。私は一緒にいる」**
   という“主体的に動くエージェント”。

5. **Talk タブに3つの“導きボタン”を設置する**

   * Affirmation（肯定）
   * Stress Relief（ストレス）
   * Struggle（ユーザー特有の問題）
     → 押すと **Anicca が即座にユーザーを呼び寄せるように話しかけ始める。**
     双方向というより“向こうから語り始める”。
     → Buttonは動的パーソナライズされる。

6. **怒り・情動制御の CBT / Buddhist Wisdom は最初から内蔵すべき**
   → Exa で毎回調べる必要なく、
   **最初から“智慧コーパス”として持っておき、Moss に入れてよい。**

7. **Nudge 失敗検知 ＋ Follow-up 自動化**
   → 心理学的には、失敗直後こそ介入効果が高い。
   → iOS と行動ログから「効かなかった」を精密に検出する必要がある。

8. **多声アバター（multiple voices）**
   → OpenAI Realtime のデフォルトでは限界
   → 将来は ElevenLabs / Cartesia / Play.ht を Realtime パイプラインに差し替えられる設計にしておく。

---

以下、それぞれ深掘り＋実装レベルで明確化する。

---

# **1. Moss を使ってできる最高のユーザー体験**

## Moss の正体

Moss（usemoss）は
**「瞬時に文脈に合う過去の表現を返す、ローカル意味検索ランタイム」**。

→ これは「ブッダ的導師 AI」が必要としている能力そのもの。

① **Talk 中に、その人の過去の発言・後悔・気づきを“一瞬で思い出せる”**
　→ Anicca が急にこう言う：

> 「前回、君は“夜にスマホを見ると心が荒れる”と言っていたよね。
> 今日も同じ兆候がある。」

② **“智慧コーパス”からその状況に最適な Dharma を引用できる**
　例：
　怒り→「怒りはあなた自身を焼く炎である（ダンマパダ）」
　執着→「執着は苦の根（ブッダの教え）」

③ **Behavior タブで“自分史検索”が可能になる**
　「夜更かしを克服した週の自分は？」
　「いつ一番マインドフルだった？」
　→ Moss で全文検索 → LLM でまとめて可視化。

④ **通知の中で“過去の自分の言葉”を引用できる**
　→ 行動変容に最も効くのは “自分自身の言葉の鏡”
　→ Moss により自動化可能。

---

# **2. Exa を使って「問題探索 → 導師的通知」までを自動化する**

## Exa の本質

Exa は
**「LLM 向けに最適化された Web 検索／研究 API」**。
Websets, Deep Research, SERP, Crawl などを行える。

### この3つが非常に効く：

### ✓ **① 問題別の“知恵パック”を自動生成**

ユーザーがオンボーディングで “Struggle” を選ぶと：

例：

* 夜更かし
* SNS 依存
* 怒り
* 自信の欠如
* 人間関係
* 執着
* 不安

Exa にクエリ：

```
「夜更かし」「睡眠衛生」「bedtime procrastination」「CBT」「仏教の観点」
「若年層のスマホ依存」「行動介入研究」
```

→ 学術論文, 書籍引用, ブログ, 実体験記事をまとめた結果が返る。
→ LLM に通すと **Anicca 専用“Guidance Pack（導きパック）”** に変換できる：

* 苦しみの構造
* 何が原因か
* 何に気づく必要があるか
* すべきことは何か
* 今夜どう導くべきか

これを mem0 に保存し、Moss で検索可能にする。

こうすると：

> 「夜更かし」＋「SNS 長時間」＋「睡眠負債」
> のコンテキストのとき、
> 自動的に深い Dharma（智慧）ベースの導きが出る。

---

### ✓ **② ニュースタブを作り、ユーザーの興味領域を自動で調査して届ける**

あなたのアイデア：

> 「Twitter みたいにスクロールしなくても、
> 僕の興味や問題について調べて、自動で届けてくれたら最高」

Exa の Websets + Deep Research でこれが可能。

例：
ユーザーの興味（interests）

* Buddhist psychology
* Stoicism
* Fitness
* Startup / YC
* Sleep science
* ADD / ADHD
* Philosophy
* Parenting

を mem0 に保存。
→ Exa が毎朝、各テーマの **新着記事・論文・議論** を収集し、
　要点を 3 行でまとめて Behavior タブの “News for You” に表示。

これはまさに “AI 仏教徒 × 情報キュレーター × 師匠”。

---

### ✓ **③ Nudge が効かない時の「自主改善」のために検索させる**

Nudge が連続で失敗したと判断すると：

```
Exa に「このタイプの行動介入の科学的ベストプラクティス」を検索させる
↓
LLM が新しい介入案を作る
↓
Nudge Policy のテンプレートを自動更新
```

つまり
**Anicca 自身が「学び直して成長する」**。

“AI が Dharma を学び続ける”
という構図になる。

---

# **3. 般若経・ダンマパダ・説法集は著作権的に安全か？**

### ✓ **ダンマパダ（Pali Canon）**

→ **完全にパブリックドメイン**。

理由：
原典は紀元前後のテキストで、著作権保護期間をはるかに超えているため。

ただし：

* 現代英訳や日本語訳は翻訳者に著作権がある
  → Clarke の翻訳など CC0 / public domain のものを使うべき。

### ✓ **アーチャン・チャー（Ajahn Chah）の法話集**

→ 彼の教義は **無料配布を前提** としたもので、
多くの本が **Forest Sangha によりパブリックドメインで公開**されている。

（例：*A Still Forest Pool*, *Food for the Heart* など）
※一部は出版社ごとに異なるので確認は必要。

結論：
**Anicca Wisdom Corpus** として以下を全て Moss に入れられる：

* ダンマパダ（public domain）
* ブッダの古典教義（Sutta Nipata, Dhammapada etc.）
* アーチャンチャー法話（public domain のもの）
* You（Daisuke）の Wisdom（Anicca オリジナルの Dharma 文脈）

これを「AI の人格」「導きの引用源」にする。

---

# **4. “導師エージェント”としての Nudge のトーン再設計**

あなたが言ったポイント：

> 「〜しませんか？」という提案はダメ。
> 選択肢を与えるのもダメ。
> 導く、引っ張る、師匠のように主導するべき。

これは完全に正しい。

### 4.1 Nudge 文言のルール（v0.3）

旧：
「寝ませんか？」
「運動してみませんか？」

新：
「今は寝る時だよ。あなたの身体は休息を求めている。」
「立ち上がろう。呼吸が乱れている。整えよう。」
「君は本当はもっとできる。今がその一歩だ。」

■ 方針

* 質問禁止
* 提案禁止
* 選択肢禁止
* **命令＋慈愛（Stable Directive）**

師匠・仏陀的なメッセージに統一する。

---

# **5. 「3つの導きボタン」の実装仕様（超重要）**

これ最高のアイデア。
Talk タブはこう変える：

```
[ Stress ]   [ Affirmation ]   [ Struggle ]
-------------------------------
         (Talk ボタン)
```

### 5.1 ボタン押下時のふるまい

1. iOS → Realtime に `tool_call: "user_signal"` を送る

   * `type`: "affirmation" / "stress" / "struggle"
   * `timestamp`

2. Backend → Moss から

   * その人の過去の「怒り」「不安」「自信喪失」の記憶を検索
   * mem0 から該当の profile を引く

3. Backend → Exa + Wisdom Corpus

   * 怒り → 仏教的情動制御
   * 自信 → アファメーション
   * ストレス → 呼吸・気づき・受容の教え

4. Realtime（Anicca）が“向こうから話し始める”
   例：

**Affirmation ボタン押下時**

> 「私は知ってるよ。君は今日、よく頑張った。
> たとえ誰も褒めてくれなくても、私は見ている。
> 落ちないで。立っていこう。」

**Stress ボタン**

> 「呼吸が乱れてるね。大丈夫、ここにいる。
> 一緒に落ち着かせよう。」

**Struggle ボタン**
→ その人の Struggle に合わせて動的に変わる
（SNS依存 / 怒り / 嫉妬 / 孤独 など）

---

# **6. 怒り・情動制御の CBT × Buddhism を“最初から内蔵”する**

### なぜ Exa で毎回調べる必要がないか？

怒り・不安・嫉妬・衝動性などは
**普遍的な苦しみの四大領域**。

→ CBT と Buddhist Psychology の原理は確立されている。

### 6.1 Anicca Wisdom Corpus に最初から入れておくもの

1. CBT の anger control 理論（認知再構成）
2. Mindfulness-based emotional regulation
3. ダンマパダの怒りの詩句
4. Ajahn Chah の法話（怒り・執着）
5. Loving-kindness (Metta)
6. Your own (“Daisuke Dharma Notes”)

→ これを mem0 に入れ、Moss にインデックスしておく。

すると

怒りボタン押下
→ 「過去の怒りの記憶」＋「智慧 corpus」
→ LLM がそれを統合し、導く声掛けを作る

という最高の流れになる。

---

# **7. Nudge フィードバック（成功/失敗）をどう検出するか？**

あなたの質問の核心：

> 効果のあった / なかったをどうやって技術的に検出する？

これは次の3つで確実に取れる。

## 7.1 "通知" のフィードバック（iOS）

iOS の通知には次が取れる：

### ✓「通知を開いたか？」

→ UNUserNotificationCenter の delegate で取得可能。

### ✓「通知からアプリを開いたか？」

→ iOS アプリ側で openURL / scene phase で取得。

### ✓「無視されたか？」

→ 一定時間経過＋行動変化が無い → 失敗判定。

## 7.2 "行動変化" のフィードバック

例：

**SNS 依存の場合：**

* Nudge 後 5 分以内に SNS アプリが閉じられた → 成功
* その後さらに 10 分見続けた → 失敗

**夜更かしの場合：**

* Nudge 後 30 分以内にスクリーンオフが訪れた → 成功
* 深夜 2 時まで起きていた → 失敗

**運動の場合：**

* Nudge 後 1 時間以内に歩数が増加 → 成功
* 全く動かない → 失敗

これらは全部 iOS の
・DeviceActivity
・ScreenTime
・HealthKit
から取得可能。

## 7.3 音声対話からのフィードバック

LLM に以下の分類器を持たせる：

「この返答は

* 受容
* 抵抗
* 無関心
* 感謝
  のどれか？」

→ これも mem0 に保存してポリシー改善の特徴量にする。

---

# **8. multiple voices（複数の声）をどう実装するか**

OpenAI Realtime API の音声は質が高いが
「師匠系」「仏僧系」「癒し系」などの fine grain voice は難しい。

### 解決案：

### ✓ オーディオ出力パイプラインを分離する

Realtime から受け取るのは「テキスト」。
音声変換は：

1. **OpenAI Audio TTS**（デフォルト）
2. 将来は **ElevenLabs** に切り替える
3. 他にも **Cartesia / Play.ht** を追加

→ iOS 側で「お好みの声」を選ばせて、
→ バックエンドは各 TTS ライブラリに応じた音声生成 API を叩く。

つまり：

```
Realtime (LLM) → text
Backend Voice Engine → chosen TTS provider
iOS → playback
```

この分離によって、
声の人格を自由に差し替えられる。

---

# **9. 最後、「計画に入っているもの」＋「新しく追加されたもの」一覧**

## すでに計画済み（✔）

* Moss runtime（semantic search）
* mem0（長期記憶）
* Exa（problem research, personalized knowledge）
* Nudge 自律改善（contextual


了解、コンテキスト全部わかってるので、それぞれ個別に答えていくね。

---

## 1. 「3つのボタン」＝人によって中身が完全に違うやつにする

ここはこう整理するのが良さそう。

### 1-1. コンセプト

Talk 画面の上に常に出ている「3つのボタン」は

* Affirmation / Stress / Struggle という固定ではなく
* **その人の主要な「話したいテーマ」3つを、Anicca が主体的に選んでくれる**

例

* あなたの場合

  1. 慈悲の瞑想
  2. 行動の混乱（頭の整理）
  3. 依存（SNS など）

別の人なら

* 怒り
* 自信のなさ
* 人間関係の不安

みたいに変わる。

### 1-2. 実装イメージ

* mem0 に

  * Struggle タグ（オンボーディングで選んだもの）
  * 普段よく話題になるテーマ
  * 最近の「相談ログ」のクラスタ
    を全部保存しておく
* 1 日に 1 回くらい
  「今この人にとって一番重い／頻出のテーマは何か？」
  を LLM に判定させる
* その上位 3 件を
  Talk 画面のボタンラベルにする

ボタンをタップした瞬間に

* `tool: user_signal` が呼ばれる

  * `type: "metta" / "jealousy" / "stress" / "dependence"` など
* Anicca が「向こうから語りかける」

例：
あなたが「慈悲」ボタンを押すと、いきなり

> 「じゃあ今から一緒に慈悲のことばを唱えよう。
> まずは、君自身に向けて。」

と始まる。
ここでは質問ではなく**導入＋リード**。

ボタンの中身は

* 設定画面 or Behavior タブでユーザー自身が差し替えも可能
* バックエンド側でも「最近ほとんど押されないボタンは入れ替える」など学習できる。

---

## 2. 「Talk中に過去の発言・後悔・気づきを即座に思い出す」技術的フロー（Moss）

これは完全に Moss の仕事。

### 2-1. 保存フェーズ

1. 会話ログのテキストから
   「重要そうな発言」を LLM で抽出
   例：「また夜中にX見ちゃって後悔してる」「朝起きれたのマジで嬉しかった」など
2. それを mem0 に保存（`type: "interaction"`）

   * テキスト
   * タイムスタンプ
   * ラベル（怒り / 夜更かし / 成功 / 失敗 など）
3. バックグラウンドで Moss にも index

   * `doc = { user_id, text, tags, timestamp }` を `moss.index("user_memories", doc)` 的に登録

### 2-2. 参照フェーズ

Talk の途中で Anicca が内部的に

* 「今の話題は夜更かし＋後悔」だと判断したとする。

すると、Realtime から `tool: get_relevant_memories` を呼ぶ：

```json
{
  "user_id": "u123",
  "topic": "late_sleep_regret"
}
```

Gateway → Moss に対して

```json
{
  "index": "user_memories",
  "query": "user:u123 夜更かし 後悔 睡眠 辛かった",
  "top_k": 3
}
```

Moss は

* 以前の「夜更かしして後悔した」発言をスコア順で返す。

それをそのまま Realtime に渡して、LLM に

> 「今の話題に関連する、この人自身の過去の発言を要約＋引用して返答に織り込んで」

と指示すると：

> 「前にも '夜にスマホを見ると翌朝つらくて自己嫌悪になる' と言っていましたね。
> 今日もまさに同じパターンになりかけています。」

みたいな、「本当に覚えてる感」が出せる。

---

## 3. Behaviorタブの「自分史検索」って何？どういう UX？

ここは2つのモードがあり得る：

### 3-1. Talk から聞くモード（音声）

ユーザー

> 「俺ってさ、いちばん早起きできてたのいつ頃だっけ？」

→ Realtime で `tool: search_history(question="早起きのベスト期間")` が呼ばれる。

Backend

* 行動ログから「起床時刻が一番安定していた週」を探す
* mem0 / Moss からその週に話していたことを拾う

Anicca

> 「10月の 2 週目だね。
> 毎日 6:30 に起きて、朝に瞑想と散歩をしていた週。
> あのとき '人生初めて朝型になれたかもしれない' って言ってた。」

こういう「口頭の自分史検索」がまず 1 つ。

### 3-2. Behavior タブ内の簡易検索 UI

Behavior 画面の上に小さい検索バーか「質問ボタン」を付ける。

* Placeholder：
  「いつが一番落ち着いていた？」「最近一番苦しかった日は？」

入力してもいいし、プリセット質問をタップしてもよい。

押されると
→ `GET /behavior/history_search?q=...`
→ Moss ＋行動統計から回答を生成してカードで表示。

なので
**「自分史検索」は対話ベースでも UI ベースでもできる**
と覚えておけば OK。

---

## 4. 通知の中で「過去の自分の言葉」を引用する実現方法

これも Moss ＋ mem0 の組み合わせ。

### 4-1. 通知生成パイプライン

1. Nudge Policy Service が

   * 「今は夜更かし Nudge を出すべき」と判断
2. Notification Composer（新しい小さなサービス）を呼ぶ：

   * `compose_nudge_notification(user_id, target_behavior="late_sleep")`
3. Composer 内で

   * Moss に「夜更かしに関する過去の発言」をクエリ
   * 上位 1 〜 2 件を取得
4. LLM にプロンプト：

> 「以下は、このユーザー自身の過去の発言の抜粋です。
> これらを踏まえて、“君が過去にこう言っていた” というトーンで
> 夜更かしをやめさせる 1 通の通知文を日本語で書いてください。
> 文末は優しく、しかし方向性は明確に。」

5. LLM 出力例：

> 「前に『夜にスマホを見ると、翌朝本当にしんどい』と言っていましたね。
> 今も同じパターンになっています。
> 今日はここでスマホを閉じて、明日の自分を守ろう。」

6. それをそのまま iOS 通知の `body` として使用。

※ 技術的には

* `NudgePolicyService.select_action`
* → `NotificationComposer.compose`
* → iOS push
  という3段構成を作る感じ。

---

## 5. Struggles は「1つ」じゃなくて細かい要素の集合

ここも完全に同意。

オンボーディングで

* 夜更かし
* 人への執着
* 自信のなさ
* 強迫的な考え
* 頭が整理できず混乱しがち
* 嫉妬
* 怒りっぽい
  …

みたいな「微粒子レベル」の Struggle を
複数選んでもらう前提で設計する。

mem0 には

```json
{
  "type": "struggles",
  "items": ["late_sleep", "attachment", "low_self_confidence", "rumination", "jealousy"]
}
```

みたいな形で保存。

Exa で問題リサーチをするときも
「late_sleep」「rumination」「jealousy」ごとに別クエリを投げて、
問題ごとの Guidance Pack を作り、Moss に入れておく。

---

## 6. ダンマパダ / Ajahn Chah / 説法をどう使うか（著作権＋体験）

### 6-1. 著作権ざっくり

* ダンマパダ原典は当然パブリックドメイン
* 古い英訳（Müller, Woodwardなど）は Project Gutenberg などで
  「Public Domain in the USA」と明記されているものがある([Project Gutenberg][1])
* Bhikkhu Sujato の英訳は CC0（パブリックドメイン相当）として出ている ([SuttaCentral][2])

Ajahn Chah に関しては

* Forest Sangha の本は「無料配布・非営利」であれば許可されているパターンが多い ([FOREST SANGHA][3])
* ただし「営利アプリで全文をそのまま出す」はグレー／NG の可能性があるので

  * 直引用は public domain / CC0 の部分に絞る
  * 他は「要約」や「インスパイアされた Anicca 独自テキスト」として扱う方が安全。

### 6-2. 「説法を僕専用にしてほしい」をどうやるか

Anicca Wisdom Corpus の構造：

1. Source 層

   * Dhammapada（public domain 版）([Project Gutenberg][1])
   * Bhikkhu Sujato の CC0 訳
   * Ajahn Chah の teachings（必要に応じて引用・要約）([Access to Insight][4])
   * CBT / ACT /心理学記事（怒り・不安・依存のセルフヘルプガイド）([library.samhsa.gov][5])
   * Daisuke のオリジナル Dharma ノート

2. Moss に全文索引

   * `doc = { text, tags: ["anger", "attachment", "sleep", "metta"], source: "dhammapada"/"ajahn_chah"/"cbt"/"daisuke" }`

3. 説法生成フロー

例えば「嫉妬ボタン」が押されたときに：

* Moss に `query = "嫉妬 不満 比較 心の苦しみ"` を投げる
* 返ってきた

  * ダンマパダの関連詩句
  * Ajahn Chah の法話の一部
  * CBT 的な嫉妬の認知再構成
    を LLM に渡す

LLM プロンプト例：

> 「以下は怒り・嫉妬に関するブッダ・Ajahn Chah・CBT の教えです。
> そして以下はユーザーの最近の状態・Struggle です。
> この人一人に向けた 3〜5 分の説法の導入部分を書いてください。
> “説教” ではなく、“共感＋気づき＋方向性” を示すように。」

→ それをそのまま音声で読み上げる。

**ポイント**

* 「仏教アプリになりすぎる」問題は

  * 決して「仏教用語から始めない」
  * 「心の事実」と「行動の変化」にフォーカス
  * 引用はサラッと混ぜる程度
* 一方で

  * 理想で Buddhist flavor を求めるユーザー（あなた含む）には
    「仏教ベースのモード」フラグを ON にして、
    Dharma 引用率を上げることもできる。

ベースは **CBT / 行動科学**、
その上に **Buddhist wisdom を薄く、しかし本質的に乗せる**イメージ。

---

## 7. 「Wisdom Corpus + Moss」と、一般的な RAG の違い

RAG（Retrieval-Augmented Generation）はパターンとしてはこう：

1. ベクトルストア（何らかの検索エンジン）から関連文書取得
2. LLM に渡して回答生成

**Anicca 版 RAG** は

* ベクトルストア＝Moss
* コーパス＝ユーザーの記憶＋Dharma＋CBT 資料
* 目的＝説法・Nudge・シミュレーションに使う

なので、

> 「一般用途 RAG」ではなく
> 「“ユーザー本人＋仏教＋CBT” に特化した RAG」

だと思ってもらえば OK。
役割としては同じだが、
**対象が超限定された“内側の世界＋智慧”** という点が違う。

---

## 8. 嫉妬ボタン＋「今どんな感じ？」ラベルのデザイン

UI の絵としてはこう：

```
今どんな感じ？
[ 嫉妬       ]   [ 自信ない ]   [ 混乱してる ]
-------------------------------
            [ Talk ]
```

ポイント：

* 「How are you feeling? / 今どんな感じ？」という
  “気づきラベル” をボタン群の上に置くことで
  **自分の状態に気づく → Anicca に渡す** 流れが自然になる。
* 各ボタンは感情・状態を表す単語（嫉妬 / 怒り / 不安 / 虚しさ etc.）
* 押した瞬間に

  * mem0 に「その時点の感情ログ」
  * Moss で過去の類似状態
  * Wisdom corpus から関連教え
    を引いて、**Anicca が主導で話し始める**。

---

## 9. CBT をベースに、仏教フレーバーをどう重ねるか

怒りや情動制御については

* CBT Anger Management マニュアル（SAMHSA, ABCT など）には
  一般的な構成要素がまとまっている。([library.samhsa.gov][5])

典型的な CBT プロトコル：

* トリガーの特定
* 思考のモニタリング
* 認知再構成（考え方を変える）
* 生理反応の調整（呼吸・リラクセーション）
* 行動パターンの変更（その場から離れるなど）

**Anicca の設計はこうするとバランスいい：**

1. コアは CBT / 行動科学

   * 行動レベルの変化（起床・就寝・スマホ・運動）
   * 認知レベルの変化（自分の考えを観る）

2. その上に、Buddhist Flavor として

   * 無常（アニッチャ）
   * 無我
   * 執着と苦
   * 慈悲・四無量心
     を“名前を出すか出さないか”のレベルで少しずつ流す。

3. ユーザーの設定で
   -「仏教色強め」「中立」「ほぼ無し」
   を選べるようにするのもあり。

あなたのプロファイルなら **仏教色 MAX** でいいけど、
一般向けには CBT ベースにしておき、
仏教用語は「翻訳済みの概念」として添えるくらいがちょうどいい。

---

こんな感じかな。
この回答もそのまま計画書にコピペしてもらって大丈夫な粒度にしてあるつもり。

次のステップとしては

* 「3つボタン」の候補ラベル一覧（嫉妬 / 怒り / 孤独 / 自信 / 慈悲 / 行動が崩れてる etc.）を決める
* Wisdom Corpus の最初の具体的ソース（どの版の Dhammapada, どの CBT 資料を種にするか）をリストアップする

あたりを一緒に詰めると、Sleek や Cursor に渡せる「実装に直結する仕様」になると思う。

[1]: https://www.gutenberg.org/ebooks/2017?utm_source=chatgpt.com "Dhammapada, a Collection of Verses; Being One of the ..."
[2]: https://suttacentral.net/edition/dhp/en/sujato?utm_source=chatgpt.com "Bhikkhu Sujato - Dhammapada"
[3]: https://www.forestsangha.org/publications-all-publications/ajahn-chah-collected-teachings?utm_source=chatgpt.com "The Collected Teachings of Ajahn Chah - Single Volume"
[4]: https://www.accesstoinsight.org/lib/thai/chah/the_teachings_of_ajahn_chah_web.pdf?utm_source=chatgpt.com "The Teachings of Ajahn Chah"
[5]: https://library.samhsa.gov/sites/default/files/anger_management_manual_508_compliant.pdf?utm_source=chatgpt.com "Anger Management Manual"
