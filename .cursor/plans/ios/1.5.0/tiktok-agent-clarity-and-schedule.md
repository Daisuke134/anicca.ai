# TikTok Agent: 現状分析 + スケジュール投稿 + 統合ロードマップ

> 作成日: 2026-01-28
> 目的: エージェントが何を受け取り、何を決定し、何を出力するのかを明確にする。嘘なし。

---

## 1. エージェントの現状（As-Is）— 正直な分析

### 1.1 エージェントが受け取るコンテキスト（INPUT）

| 情報源 | 内容 | タイミング |
|--------|------|-----------|
| System Prompt | ペルソナ定義（25-35歳、6-7年習慣失敗）、7ステップワークフロー、コンテンツルール、4トーン | 起動時に固定 |
| User Message | 「今日のTikTok投稿プロセスを実行しろ」（1文のみ） | 起動時に固定 |

**エージェントが起動時に持っている情報はこれだけ。** 昨日の成績も、hookリストも、トレンドも持っていない。全てツール呼び出しで取得する。

### 1.2 エージェントが各ステップで取得するデータ（GROUNDED DATA）

| Step | Tool | 取得データ | フィールド |
|------|------|-----------|-----------|
| 1 | `get_yesterday_performance` | 昨日の投稿成績 | `posts[]`（like_rate, share_rate等） |
| 2 | `get_hook_candidates` | Thompson Sampling選択hook | `selected.id`, `selected.text`, `selected.tone`, `selected.target_problem_types` |
| 3 | `search_trends` | Exa APIトレンド | `results[]`（title, url, snippet × 5件） |
| 5 | `evaluate_image` | GPT-4o画像評価 | `quality_score`(1-10), `issues[]`, `recommendation`("post"/"regenerate"/"skip") |

### 1.3 エージェントが自分で決定すること（DECISIONS）

| 決定事項 | 現状 | あるべき姿（1.5.0） |
|---------|------|---------------------|
| **Hook選択** | Thompson Samplingから自動選択 | ✅ 実装済み |
| **トレンド検索クエリ** | エージェントが自由に決定 | ✅ 実装済み |
| **画像プロンプト** | エージェントが作成 | ✅ 実装済み |
| **キャプション** | エージェントが作成 | ✅ 実装済み |
| **ハッシュタグ** | エージェントが選択 | ✅ 実装済み |
| **Agent Reasoning** | エージェントが2-3文で説明 | ✅ 実装済み |
| **投稿時刻** | ❌ 即時投稿（エージェントは決定していない） | ⚠️ **未実装 — 1.5.0で追加必須** |

### 1.4 エージェントの出力（OUTPUT）

現在、エージェントが最終的に出力する（ツール経由で外部に送信する）もの:

| 出力先 | 内容 | ツール |
|--------|------|--------|
| Fal.ai | 画像プロンプト + モデル選択 | `generate_image` |
| Blotato → TikTok | キャプション + 画像URL + ハッシュタグ | `post_to_tiktok` |
| Railway DB | blotato_post_id, caption, hook_candidate_id, agent_reasoning | `save_post_record` |

**足りないもの: `scheduledTime`（投稿時刻）がBlotato APIに送信されていない。**

---

## 2. 修正内容（To-Be）— スケジュール投稿対応

### 2.1 Blotato APIスケジュール機能

Blotato API `/v2/posts` は以下のスケジュールオプションをサポート:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `scheduledTime` | ISO 8601 string | 指定時刻に投稿（最優先） |
| `useNextFreeSlot` | boolean | 次の空きスロットに自動配置 |
| なし | — | 即時投稿（現在の動作） |

Source: [Blotato Publish Post API](https://help.blotato.com/api/api-reference/publish-post)

### 2.2 TikTok最適投稿時刻データ

複数の大規模調査データ（2025-2026年）:

| 曜日 | 最適時間帯 | ソース |
|------|-----------|--------|
| 月曜 | 6:00, 10:00, 13:00, 22:00 | Shopify, SocialPilot |
| 火曜 | 9:00, 22:00 | RecurPost (2M posts) |
| 水曜 | 14:00-17:00 | SocialPilot |
| 木曜 | 7:00-11:00, 23:00 | Sprout Social (2.7B engagements) |
| 金曜 | 20:00 | RecurPost |
| 土曜 | 17:00, 20:00 | Multiple sources |
| 日曜 | 20:00 | Gudsho |

**Key insight**: 投稿後30-90分の初期エンゲージメントがアルゴリズム推薦に最も影響する。

Sources:
- [Buffer - Best Time to Post on TikTok](https://buffer.com/resources/best-time-to-post-on-tiktok/)
- [Sprout Social - Best Times to Post](https://sproutsocial.com/insights/best-times-to-post-on-tiktok/)
- [SocialPilot - 700K TikTok Insights](https://www.socialpilot.co/blog/best-time-to-post-on-tiktok)
- [Shopify - Best Time to Post](https://www.shopify.com/blog/best-time-to-post-on-tikok)

### 2.3 実装変更

#### A. `post_to_tiktok` ツールに `scheduled_time` パラメータ追加

```python
# tools.py — TOOL_DEFINITIONS
{
    "name": "post_to_tiktok",
    "parameters": {
        "properties": {
            "image_url": {"type": "string"},
            "caption": {"type": "string"},
            "hashtags": {"type": "array", "items": {"type": "string"}},
            "scheduled_time": {
                "type": "string",
                "description": "ISO 8601 datetime for scheduled posting (e.g., '2026-01-29T08:00:00+09:00'). If omitted, posts immediately."
            },
        },
        "required": ["image_url", "caption"],
    },
}
```

```python
# tools.py — post_to_tiktok 実装
def post_to_tiktok(**kwargs):
    ...
    payload = {"post": { ... }}

    # スケジュール投稿対応
    scheduled_time = kwargs.get("scheduled_time")
    if scheduled_time:
        payload["scheduledTime"] = scheduled_time

    resp = requests.post(f"{BLOTATO_BASE_URL}/posts", ...)
```

#### B. System Promptにタイミング決定の指示を追加

```
### STEP 3.5: Decide Posting Time (NEW)
Based on the selected hook's target_problem_type and today's day of week,
decide the optimal posting time (JST).

Use these evidence-based guidelines:
- Monday: 10:00 or 22:00 JST
- Tuesday: 9:00 or 22:00 JST
- Wednesday: 14:00-17:00 JST
- Thursday: 7:00-11:00 JST
- Friday: 20:00 JST
- Saturday: 17:00 or 20:00 JST
- Sunday: 20:00 JST

Consider the target persona (25-35歳): evening hours (19:00-23:00) tend to
have higher engagement for self-improvement content.

Pass the decided time as scheduled_time in ISO 8601 format to post_to_tiktok.
```

#### C. `save_post_record` に `scheduled_time` フィールド追加

```python
# save_post_record ツール定義
"scheduled_time": {
    "type": "string",
    "description": "The scheduled posting time (ISO 8601)"
}
```

---

## 3. エージェントの完全な INPUT → OUTPUT フロー（1.5.0修正後）

```
INPUT（固定）:
├── System Prompt: ペルソナ、ワークフロー、コンテンツルール、投稿時刻ガイドライン
└── User Message: 「今日のTikTok投稿を実行しろ」

STEP 1: get_yesterday_performance
├── INPUT: なし
└── OUTPUT: 昨日の投稿成績（posts[], metrics）

STEP 2: get_hook_candidates(strategy="thompson")
├── INPUT: strategy="thompson"
└── OUTPUT: selected hook（id, text, tone, target_problem_types）

STEP 3: search_trends(query=エージェントが決定)
├── INPUT: hookテーマに基づくクエリ
└── OUTPUT: トレンド5件（title, url, snippet）

STEP 3.5: 【エージェントが内部で決定】投稿時刻
├── INPUT: 曜日 + ガイドライン + ペルソナ
└── OUTPUT: scheduled_time（ISO 8601）

STEP 4: generate_image(prompt=エージェントが作成, model="nano_banana")
├── INPUT: 画像プロンプト + モデル
└── OUTPUT: image_url

STEP 5: evaluate_image(image_url, intended_hook)
├── INPUT: 画像URL + hook文
└── OUTPUT: quality_score, issues[], recommendation
├── score >= 6 → STEP 6
├── score < 6 → STEP 4に戻る（max 2回）
└── 2回失敗 → 一番良い画像でSTEP 6

STEP 6: post_to_tiktok(image_url, caption, hashtags, scheduled_time) ← NEW
├── INPUT: 画像URL + キャプション + ハッシュタグ + 投稿予定時刻
└── OUTPUT: blotato_post_id

STEP 7: save_post_record(blotato_post_id, caption, hook_candidate_id, agent_reasoning, scheduled_time) ← NEW
├── INPUT: 投稿記録の全フィールド
└── OUTPUT: record_id
```

**エージェントが決定する6つのこと（1.5.0）:**

| # | 決定事項 | 根拠データ |
|---|---------|-----------|
| 1 | **Hook選択** | Thompson Sampling（成績データベース） |
| 2 | **トレンド検索クエリ** | 選択されたhookのテーマ |
| 3 | **画像プロンプト** | hook + トレンド + ペルソナ |
| 4 | **キャプション** | hook + トレンド + ハッシュタグ |
| 5 | **投稿時刻** ← NEW | 曜日 + エンゲージメントデータ + ペルソナ |
| 6 | **Agent Reasoning** | 全ステップの判断根拠 |

---

## 4. GHA vs Railway: なぜ分離されているか + 統合ロードマップ

### 4.1 現状の分離理由

| 項目 | App Nudge（Railway） | TikTok Agent（GHA） |
|------|---------------------|---------------------|
| 言語 | Node.js (TypeScript) | Python |
| DB接続 | 直接（Prisma ORM） | HTTP API経由（AdminAPIClient） |
| 実行時間 | ~30秒 | ~3-5分（画像生成） |
| なぜこの言語 | APIサーバーと同じ環境 | OpenAI Function Calling SDKがPython先行だった |

**しかし、OpenAI SDK for TypeScript/Node.js も Function Calling を完全サポートしている。** Python を選んだ理由は当時の判断であり、技術的制約ではなくなった。

### 4.2 統合の判断

**Decision: V3（将来）でNode.jsに統合し、Railway上で実行する。**

| 観点 | GHAに統合 | Railwayに統合 |
|------|----------|--------------|
| DB接続 | HTTP API経由（遅い） | **直接Prisma（速い）** |
| 言語統一 | Python（API側と別） | **Node.js（API側と同じ）** |
| ログ・監視 | GHA logs | **Railway logs（既存監視と統合）** |
| コスト | 無料 | CPU課金（~$1-2/日） |
| 実行時間 | 6時間まで | タイムアウト設定可能 |
| スケジュール | cron（5-20分ズレ）| cron（正確）|

**Railwayに統合する理由:**
1. DB直接アクセス（HTTP API経由より高速・信頼性高い）
2. Node.js統一（メンテコスト削減）
3. 既存の監視・ログ基盤と統合
4. App NudgeとTikTok Agentが同じDB・同じコードベースで学習を共有
5. 将来の「1エージェント、複数チャネル」に向けた基盤

**GHAを選ばない理由:**
- DB接続がHTTP API経由になり遅い
- Python/Node.js混在のまま
- スケジュール精度が低い（5-20分ズレ）

### 4.3 統合ロードマップ

| Phase | 内容 | タイミング |
|-------|------|-----------|
| **V1（今）** | Python + GHA。スケジュール投稿追加。 | **1.5.0** |
| **V2** | Node.js書き換え + Railway cron移行 | 1.6.0 |
| **V3** | App Nudge + TikTok Agent統合。1つのエージェントが全チャネル担当 | 1.7.0+ |
| **V4** | 24/7常時稼働エージェント。リアルタイム判断 | 2.0.0 |

**V1（1.5.0）でやること:**
- スケジュール投稿をBlotato `scheduledTime` で実装
- エージェントがWHENを決定できるようにする
- Python + GHAのまま（リファクタは次バージョン）

---

## 5. テスト計画

### 5.1 スケジュール投稿テスト

エージェントを実行し、`scheduledTime` を現在時刻+3分に設定。3分後にTikTokに投稿が出現することを確認。

```bash
# 1. エージェント実行
python3 anicca_tiktok_agent.py

# 2. Blotato APIレスポンスで scheduledTime を確認
# 3. 指定時刻にTikTok投稿が出現することを確認
```

### 5.2 GHA CLIテスト

```bash
# mainマージ後にCLIから実行
gh workflow run anicca-daily-post.yml
gh run list --workflow=anicca-daily-post.yml
gh run watch <run-id>
gh run view <run-id> --log
```

GUI操作は不要。全てターミナルから実行・監視可能。

---

## 6. App Store リリースまでのタスク一覧

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 1 | スケジュール投稿実装 | `post_to_tiktok` に `scheduled_time` 追加 + System Prompt改修 | 未着手 |
| 2 | `save_post_record` に `scheduled_time` 追加 | DB記録にも投稿予定時刻を保存 | 未着手 |
| 3 | スケジュール投稿テスト | 3分後投稿でBlotato動作確認 | 未着手 |
| 4 | コードレビュー（サブエージェント） | マージ前の最終チェック | 未着手 |
| 5 | dev → main マージ | Backend Production デプロイ | 未着手 |
| 6 | GHA CLIテスト | `gh workflow run` で動作確認 | 未着手 |
| 7 | release/1.5.0 作成 | mainから切る | 未着手 |
| 8 | App Store ビルド＆提出 | fastlane release | 未着手 |
