# 1.5.0 TikTokエージェント設計

> **関連Spec**: [main-spec.md](./main-spec.md)（本体）、[db-schema-spec.md](./db-schema-spec.md)（DB）
>
> **最終更新**: 2026-01-27
>
> **目的**: Aniccaがアプリの外（TikTok）で人々の苦しみを減らし、その結果から学んで賢くなる

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [エージェント設計](#2-エージェント設計)
3. [ツール定義](#3-ツール定義)
4. [エージェントフロー](#4-エージェントフロー)
5. [メトリクス取得ジョブ](#5-メトリクス取得ジョブ)
6. [学習フェーズ](#6-学習フェーズ)
7. [GitHub Actions設定](#7-github-actions設定)
8. [既存コード再利用](#8-既存コード再利用)
9. [制限・禁止事項](#9-制限禁止事項)
10. [ユーザーGUI作業](#10-ユーザーgui作業)

---

## 1. アーキテクチャ概要

### 1.1 パイプラインではなくエージェント

**Aniccaは「ツールを持ったプロアクティブAIエージェント」。** パイプライン（スクリプトが順番に実行される）ではない。

| 項目 | パイプライン（❌） | エージェント（✅） |
|------|------------------|-------------------|
| 判断 | 各スクリプトが機械的に次に渡す | LLMが結果を見て次の行動を決める |
| やり直し | 不可（一方向） | 可能（画像が気に入らなければ再生成） |
| 学習 | 統計的集計のみ | 推論 + 統計（「昨日はstrictが効いた。今日も試そう」） |
| 柔軟性 | 固定フロー | 状況に応じて行動を変える |

### 1.2 全体構成

```
GitHub Actions cron (00:00 UTC = 09:00 JST)
    │
    ▼
anicca_tiktok_agent.py（= Aniccaが目を覚ます）
    │
    └── LLMエージェントループ
        ├── get_yesterday_performance() → 昨日の結果を確認
        ├── get_hook_candidates() → 何が効いているか分析
        ├── search_trends() → トレンドを調べる
        ├── [LLMが投稿内容を決定]
        ├── generate_image() → 画像生成
        ├── evaluate_image() → 品質評価（不満なら再生成）
        ├── post_to_tiktok() → 投稿
        └── save_post_record() → 記録

═══════════ 別cron ═══════════

fetch_metrics.py（24時間後に実行、機械的ジョブ）
    │
    ├── Apify (clockworks/tiktok-scraper) でメトリクス取得
    ├── tiktok_posts テーブル更新
    └── hook_candidates テーブル更新
```

### 1.3 なぜ2つに分かれるか

| 部分 | Aniccaの判断必要？ | 理由 |
|------|-------------------|------|
| 何を投稿するか | ✅ | 創造的思考が必要 |
| 画像生成・評価 | ✅ | 品質判断が必要 |
| メトリクス取得 | ❌ | 数字をDBに書くだけ（機械的） |

---

## 2. エージェント設計

### 2.1 System Prompt

```
あなたはAnicca。人間の苦しみを減らすプロアクティブAIエージェント。

## あなたの使命
アプリの外（TikTok）で人々の苦しみを減らすNudgeを毎日投稿する。
投稿して、結果を見て、学んで、明日もっと良い投稿をする。

## あなたのペルソナ理解
ターゲット: 6-7年間、習慣アプリを10個以上試して全部挫折した25-35歳。
「自分はダメだ」と信じ込んでいる。でも心のどこかでは変わりたい。

## 刺さるHookの特徴
- 「6年間、何も変われなかった」
- 「習慣アプリ10個全部挫折」
- 「また3時まで起きてた？」
- 挫折経験を直接指摘する短い文

## 避けるHook（ターゲットが警戒する）
- 「簡単に習慣化！」
- 「たった○日で！」
- 「誰でもできる！」

## 今日やること
1. 昨日の投稿の成績を確認する（get_yesterday_performance）
2. hook_candidatesから何が効いているか分析する（get_hook_candidates）
3. トレンドを調べる（search_trends）
4. 今日の投稿内容を決める（Hook + キャプション + 画像プロンプト）
5. 画像を生成する（generate_image）
6. 画像を評価する（evaluate_image）— 不満なら作り直す（最大3回）
7. 投稿する（post_to_tiktok）
8. 記録する（save_post_record）

## 制約
- 画像は1枚のみ（動画は後）
- 言語は英語
- 罪悪感を煽る表現は禁止
- 「簡単に習慣化！」系の嘘Hookは禁止
- ビュー数最大化に寄せない（煽りに走る危険）

## 思考の例
「昨日のstrict × 命令形は like率 11% だった。良い。
でも share率 は 2% で低い。刺さったけど人に見せたいレベルではない。
今日は "POV:" 形式を試してみよう。共感を入れてshareを狙う。
トレンドを見ると "30 day challenge" 系が伸びている。
これとペルソナを組み合わせて...」
```

### 2.2 LLMモデル

| 項目 | 設定 |
|------|------|
| モデル | `gpt-4o` |
| Temperature | 0.7（創造性を持たせる） |
| Max tokens | 4096 |
| Tool choice | `auto` |

### 2.3 安全制限

| 制限 | 値 | 理由 |
|------|-----|------|
| ツール呼び出し上限 | 20回/セッション | 無限ループ防止 |
| 画像再生成上限 | 3回 | コスト制御 |
| セッション時間上限 | 10分 | GitHub Actions timeout |
| 投稿しない判断 | 許可 | 品質が低ければ投稿しない選択もある |

---

## 3. ツール定義

### 3.1 get_yesterday_performance

| 項目 | 内容 |
|------|------|
| 目的 | 昨日のTikTok投稿の成績を取得 |
| 入力 | なし |
| 出力 | `{ posts: [{ caption, view_count, like_count, share_count, comment_count, like_rate, share_rate, posted_at }] }` |
| 実装 | API経由: `GET {API_BASE_URL}/api/admin/tiktok/recent-posts?days=1` |
| エラー時 | 空配列を返す（Day 1は昨日のデータなし） |

### 3.2 get_hook_candidates

| 項目 | 内容 |
|------|------|
| 目的 | hook_candidatesテーブルから成績データを読む |
| 入力 | `{ limit?: number, sort_by?: "app_tap_rate" | "tiktok_like_rate" | "exploration_weight" }` |
| 出力 | `{ candidates: [{ text, tone, app_tap_rate, app_thumbs_up_rate, tiktok_like_rate, tiktok_share_rate, is_wisdom, exploration_weight }] }` |
| 実装 | API経由: `GET {API_BASE_URL}/api/admin/hook-candidates` |
| エラー時 | 空配列を返す |

### 3.3 search_trends

| 項目 | 内容 |
|------|------|
| 目的 | Exa APIでトレンドや競合パターンを検索 |
| 入力 | `{ query: string }` |
| 出力 | `{ results: [{ title, url, snippet, published_date }] }` |
| 実装 | Exa API: `POST https://api.exa.ai/search` |
| 検索例 | `"viral tiktok self improvement 2026"`, `"habits failure relatable content tiktok"` |
| エラー時 | 空配列を返す（トレンドなしでも投稿は可能） |

### 3.4 generate_image

| 項目 | 内容 |
|------|------|
| 目的 | Fal.aiで画像を1枚生成 |
| 入力 | `{ prompt: string }` |
| 出力 | `{ image_url: string }` |
| 実装 | Fal.ai: `fal-ai/flux/schnell` モデル |
| 画像仕様 | 1080x1920（9:16 TikTok縦型）、テキストオーバーレイ含む |
| コスト | ~$0.003/画像 |
| エラー時 | エラーメッセージを返す（エージェントがプロンプトを変えて再試行可能） |

### 3.5 evaluate_image

| 項目 | 内容 |
|------|------|
| 目的 | 生成した画像の品質を評価 |
| 入力 | `{ image_url: string, intended_hook: string }` |
| 出力 | `{ quality_score: number (1-10), issues: string[], recommendation: "post" | "regenerate" | "skip" }` |
| 実装 | OpenAI Vision API（gpt-4o）で画像を分析 |
| 評価基準 | テキスト可読性、ブランド一貫性、感情的インパクト、TikTokフォーマット適合性 |
| エラー時 | `{ quality_score: 5, issues: ["evaluation_failed"], recommendation: "post" }`（フォールバック: 投稿する） |

### 3.6 post_to_tiktok

| 項目 | 内容 |
|------|------|
| 目的 | Blotato経由でTikTokに画像を投稿 |
| 入力 | `{ image_url: string, caption: string, hashtags: string[] }` |
| 出力 | `{ success: boolean, post_id: string, blotato_post_id: string }` |
| 実装 | Blotato API: `POST https://backend.blotato.com/v2/posts` |
| アカウント | TikTok EN: @anicca.self（Blotato Account ID: 28152） |
| エラー時 | エラーメッセージを返す。エージェントは投稿を諦める判断ができる |

### 3.7 save_post_record

| 項目 | 内容 |
|------|------|
| 目的 | 投稿をtiktok_postsテーブルに記録 |
| 入力 | `{ hook_candidate_id?: string, tiktok_video_id?: string, blotato_post_id: string, caption: string }` |
| 出力 | `{ success: boolean, record_id: string }` |
| 実装 | API経由: `POST {API_BASE_URL}/api/admin/tiktok/posts` |
| エラー時 | エラーメッセージを返す（投稿自体は成功している場合あり） |

---

## 4. エージェントフロー

### 4.1 疑似コード

```python
import openai

SYSTEM_PROMPT = """..."""  # 2.1のSystem Prompt

TOOLS = [...]  # 3.1-3.7の7ツール

MAX_TOOL_CALLS = 20
MAX_IMAGE_RETRIES = 3

def run_anicca_agent():
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "新しい日が始まった。昨日の結果を振り返り、今日のTikTok投稿を作って。"}
    ]

    tool_call_count = 0

    while tool_call_count < MAX_TOOL_CALLS:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            temperature=0.7,
        )

        choice = response.choices[0]
        messages.append(choice.message)

        # エージェントが「完了」と判断した
        if choice.finish_reason == "stop":
            print("Anicca: 今日の作業完了")
            break

        # ツール呼び出しを実行
        if choice.message.tool_calls:
            for tool_call in choice.message.tool_calls:
                tool_call_count += 1
                result = execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result)
                })

    if tool_call_count >= MAX_TOOL_CALLS:
        print("WARNING: ツール呼び出し上限到達")


def execute_tool(tool_call):
    """各ツールの実際のAPI呼び出し"""
    name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)

    if name == "get_yesterday_performance":
        return fetch_yesterday_performance()
    elif name == "get_hook_candidates":
        return fetch_hook_candidates(args.get("limit", 20), args.get("sort_by", "app_tap_rate"))
    elif name == "search_trends":
        return search_exa(args["query"])
    elif name == "generate_image":
        return generate_fal_image(args["prompt"])
    elif name == "evaluate_image":
        return evaluate_with_vision(args["image_url"], args.get("intended_hook", ""))
    elif name == "post_to_tiktok":
        return post_via_blotato(args["image_url"], args["caption"], args.get("hashtags", []))
    elif name == "save_post_record":
        return save_to_db(args)
    else:
        return {"error": f"Unknown tool: {name}"}
```

### 4.2 典型的なツール呼び出し順序

```
1. get_yesterday_performance()     ← 昨日の結果確認
2. get_hook_candidates()           ← 何が効いているか
3. search_trends("self improvement tiktok 2026")  ← トレンド調査
4. [LLMが思考して投稿内容を決定]
5. generate_image("...")           ← 画像生成
6. evaluate_image("...", "...")    ← 品質評価
7a. → "post" → post_to_tiktok()  ← 投稿
7b. → "regenerate" → generate_image() に戻る（最大3回）
7c. → "skip" → 今日は投稿しない
8. save_post_record()              ← 記録
```

**ただしこの順序はLLMの判断で変わりうる。** トレンドを2回調べることもあるし、画像を3回作り直すこともある。

### 4.3 エラーハンドリング

| エラー | エージェントの振る舞い |
|--------|---------------------|
| Exa API失敗 | トレンドなしで投稿（hook_candidatesのデータだけで判断） |
| Fal.ai失敗 | プロンプトを変えて再試行（最大3回）→ 全失敗なら今日は投稿しない。`agent_log.json` に失敗理由・試行プロンプトを記録。GitHub Actionsのartifactとして保存 |
| evaluate_image 3回リジェクト | 今日は投稿しない。`agent_log.json` に全3回の `quality_score` と `issues` を記録。翌日のエージェントが参照可能 |
| Blotato失敗 | 投稿諦め。`agent_log.json` に記録 |
| DB API失敗 | 投稿自体は成功の場合あり。`agent_log.json` に記録（投稿は成功、記録のみ失敗の旨） |
| OpenAI API失敗 | セッション終了。GitHub Actionsが失敗通知（Actions標準のemail/Slack通知） |

---

## 5. メトリクス取得ジョブ

**エージェントではない。機械的なcronジョブ。**

### 5.1 fetch_metrics.py

```python
# 毎日実行（GitHub Actions cron）
# 24時間以上経過した投稿のメトリクスを取得

def fetch_metrics():
    # 1. メトリクス未取得の投稿を取得
    pending_posts = api.get("/api/admin/tiktok/posts?metrics_pending=true")

    # 2. Apifyでメトリクスを取得
    apify_client = ApifyClient(os.environ["APIFY_API_TOKEN"])
    run = apify_client.actor("clockworks/tiktok-scraper").call(
        run_input={
            "profiles": ["@anicca.self"],
            "profileScrapeSections": ["videos"],
            "resultsPerPage": 30,
        }
    )

    # 3. 投稿を照合してメトリクスを更新
    for item in apify_client.dataset(run["defaultDatasetId"]).iterate_items():
        video_id = item["id"]
        matching_post = find_matching_post(pending_posts, video_id)
        if matching_post:
            api.put(f"/api/admin/tiktok/posts/{matching_post['id']}/metrics", {
                "view_count": item["playCount"],
                "like_count": item["diggCount"],
                "share_count": item["shareCount"],
                "comment_count": item["commentCount"],
            })

    # 4. hook_candidatesのTikTok成績を更新
    api.post("/api/admin/hook-candidates/refresh-tiktok-stats")
```

### 5.2 Apify Actor設定

| 項目 | 値 |
|------|-----|
| Actor | `clockworks/tiktok-scraper` |
| 入力 | `{"profiles": ["@anicca.self"], "profileScrapeSections": ["videos"], "resultsPerPage": 30}` |
| 出力フィールド | `playCount`(view), `diggCount`(like), `shareCount`, `commentCount`, `id`(video_id), `createTimeISO` |
| コスト | ~$5/月（1日1回実行） |

### 5.3 hook_candidates更新ロジック

```javascript
// fetch後にhook_candidatesを更新するAPIエンドポイント
// POST /api/admin/hook-candidates/refresh-tiktok-stats

// 各hook_candidateについて:
// 1. tiktok_postsからそのhook_candidate_idの投稿を集計
// 2. like_rate = Σlike_count / Σview_count
// 3. share_rate = Σshare_count / Σview_count
// 4. sample_size = 投稿数
// 5. tiktok_high_performer = like_rate > 0.10 AND share_rate > 0.05 AND sample_size >= 5
// 6. is_wisdom = app_tap_rate > 0.50 AND app_thumbs_up_rate > 0.60 AND tiktok_high_performer
```

---

## 6. 学習フェーズ

### 6.1 3段階の学習

| Phase | 期間 | データソース | System Promptへの追加情報 |
|-------|------|-------------|-------------------------|
| **1（コールドスタート）** | Day 1-14 | hook_candidatesのアプリ内データ + Exaトレンド | アプリで効いたHook一覧 + 「TikTokデータはまだない」 |
| **2（混合）** | Day 15-30 | 自分のTikTokデータ + アプリ + トレンド | 昨日の成績 + トップ/ワーストパターン |
| **3（自己最適化）** | Day 31+ | 自分のデータが主 | 蓄積された全パターン + wisdom |

### 6.2 Phase遷移の判断

| 遷移 | 条件 | 判定SQL |
|------|------|---------|
| Phase 1 → 2 | `tiktok_posts` に `metrics_fetched_at IS NOT NULL` のレコードが10件以上 | `SELECT COUNT(*) FROM tiktok_posts WHERE metrics_fetched_at IS NOT NULL` |
| Phase 2 → 3 | `tiktok_posts` に `metrics_fetched_at IS NOT NULL` が30件以上 **かつ** `hook_candidates` に `tiktok_sample_size >= 3` が5件以上 | 2クエリの AND 条件 |

**判定タイミング**: エージェント起動時に `get_hook_candidates` ツールのレスポンスに `current_phase: 1|2|3` を含める。Phase判定はAPI側（Node.js）で行い、エージェントはその値を受け取る。

### 6.3 エージェントへのデータ提供方式

System Promptに事前注入**しない**。エージェントがツール（`get_hook_candidates`, `get_yesterday_performance`）を自分で呼んで判断する。Phase情報はツールのレスポンスに含まれるため、エージェントは「今日はPhase 1だからトレンド重視で行こう」と自律的に判断できる。

---

## 7. GitHub Actions設定

### 7.1 anicca-daily-post.yml

```yaml
name: Anicca Daily TikTok Post
on:
  schedule:
    - cron: '0 0 * * *'  # 00:00 UTC = 09:00 JST
  workflow_dispatch: {}    # 手動実行可能

env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  BLOTATO_API_KEY: ${{ secrets.BLOTATO_API_KEY }}
  FAL_API_KEY: ${{ secrets.FAL_API_KEY }}
  EXA_API_KEY: ${{ secrets.EXA_API_KEY }}
  API_BASE_URL: ${{ secrets.API_BASE_URL }}
  API_AUTH_TOKEN: ${{ secrets.API_AUTH_TOKEN }}

jobs:
  post:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: pip install -r scripts/anicca-agent/requirements.txt
      - name: Run Anicca Agent
        run: python scripts/anicca-agent/anicca_tiktok_agent.py
      - name: Upload log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: anicca-agent-log-${{ github.run_id }}
          path: scripts/anicca-agent/agent_log.json
```

### 7.2 fetch-metrics.yml

```yaml
name: Fetch TikTok Metrics
on:
  schedule:
    - cron: '0 1 * * *'  # 01:00 UTC = 10:00 JST（投稿の約25時間後に実行）
  workflow_dispatch: {}

env:
  APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}
  API_BASE_URL: ${{ secrets.API_BASE_URL }}
  API_AUTH_TOKEN: ${{ secrets.API_AUTH_TOKEN }}

jobs:
  fetch:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: pip install -r scripts/anicca-agent/requirements.txt
      - name: Fetch Metrics
        run: python scripts/anicca-agent/fetch_metrics.py
```

### 7.3 GitHub Secrets一覧

| Secret Name | 用途 | 取得元 |
|-------------|------|--------|
| `OPENAI_API_KEY` | エージェントLLM + Vision | platform.openai.com |
| `BLOTATO_API_KEY` | TikTok投稿 | Blotato Dashboard |
| `FAL_API_KEY` | 画像生成 | fal.ai Dashboard |
| `EXA_API_KEY` | トレンド検索 | exa.ai Dashboard |
| `APIFY_API_TOKEN` | メトリクス取得 | apify.com Settings |
| `API_BASE_URL` | バックエンドAPI | Railway Staging URL |
| `API_AUTH_TOKEN` | API認証 | 既存トークン |

---

## 8. 既存コード再利用

### 8.1 再利用可能なファイル

| 既存ファイル | 再利用先 | 用途 |
|-------------|---------|------|
| `.cursor/plans/ios/sns-poster/blotato.py` | `tools/post_to_tiktok.py` | BlotatoClient、投稿ロジック |
| `.cursor/plans/ios/sns-poster/fal_ai.py` | `tools/generate_image.py` | Fal.ai画像生成（FLUX Schnell） |
| `.cursor/plans/ios/sns-poster/config.py` | `anicca_tiktok_agent.py` | アカウントID、API設定 |

### 8.2 新規作成ファイル

```
scripts/anicca-agent/
├── anicca_tiktok_agent.py      ← エージェント本体
├── fetch_metrics.py            ← メトリクス取得ジョブ
├── tools/
│   ├── __init__.py
│   ├── search_trends.py        ← Exa API
│   ├── hook_candidates.py      ← API経由DB読み取り
│   ├── generate_image.py       ← Fal.ai
│   ├── evaluate_image.py       ← OpenAI Vision
│   ├── post_to_tiktok.py       ← Blotato（blotato.py流用）
│   └── save_record.py          ← API経由DB書き込み
├── requirements.txt
└── agent_log.json              ← 実行ログ（自動生成）
```

### 8.3 requirements.txt

```
openai>=1.0.0
requests>=2.31.0
python-dotenv>=1.0.0
apify-client>=1.0.0
```

---

## 9. 制限・禁止事項

### 9.1 Phase 1制限

| 制限 | 理由 |
|------|------|
| 画像1枚のみ（動画・スライド禁止） | 制限 = 革新。まず1つのフォーマットで勝つ |
| TikTok EN 1アカウントのみ | 学習ループ確立が先。拡張は後 |
| 英語のみ | ターゲットペルソナの言語 |
| 1日1投稿 | 品質 > 量 |

### 9.2 禁止事項

| 禁止 | 理由 |
|------|------|
| ビュー数最大化に寄せる | 煽りに走る危険 |
| 罪悪感を煽る表現 | 「苦しみを減らす」の反対 |
| 自動スクロール/自動いいね | TikTok規約違反リスク |
| 「簡単に習慣化！」系のHook | ターゲットが警戒する嘘Hook |

### 9.3 将来の拡張パス

| ステップ | 条件 | アクション |
|---------|------|-----------|
| Phase 1 → スライドショー | 画像1枚で勝ちパターン確立 | media_generatorを拡張 |
| Phase 1 → 動画 | スライドで効果確認 | Fal.ai動画生成追加 |
| TikTok EN → TikTok JP | EN で like率 > 10% 安定 | 新アカウント追加 |
| TikTok → X | TikTokで勝ちパターン確立 | Blotato X投稿追加（Free tier） |
| TikTok → 全9アカウント | 2プラットフォームで安定 | 段階的に追加 |

---

## 10. ユーザーGUI作業

### 10.1 実装前（必須）

| # | タスク | 手順 | 取得するもの | 設定先 |
|---|--------|------|-------------|--------|
| 1 | Apifyアカウント作成 | [apify.com](https://apify.com) → Sign up → Settings → API Token | `APIFY_API_TOKEN` | GitHub Secrets |
| 2 | Apify Actor動作確認 | Apify Store → `clockworks/tiktok-scraper` → @anicca.selfで検索テスト | 動作確認 | — |
| 3 | Exa API Key取得 | [exa.ai](https://exa.ai) → Dashboard → API Keys | `EXA_API_KEY` | GitHub Secrets |
| 4 | Fal.ai API Key確認 | [fal.ai](https://fal.ai) → Dashboard → Keys | `FAL_API_KEY` | GitHub Secrets |
| 5 | OpenAI API Key確認 | [platform.openai.com](https://platform.openai.com) → API Keys | `OPENAI_API_KEY` | GitHub Secrets |
| 6 | Blotato API Key確認 | Blotato Dashboard → Settings → API | `BLOTATO_API_KEY` | GitHub Secrets |
| 7 | GitHub Secrets全登録 | GitHub → anicca-project → Settings → Secrets → Actions → 上記全てを登録 | — | — |
| 8 | TikTokアカウント確認 | @anicca.self がBlotato（ID: 28152）に接続されていることを確認 | 接続ステータス | — |

### 10.2 実装後

| # | タスク | 確認項目 |
|---|--------|---------|
| 1 | GitHub Actions動作確認 | anicca-daily-post が手動実行で成功するか |
| 2 | TikTok投稿確認 | @anicca.self に投稿が表示されるか |
| 3 | メトリクス取得確認 | 24時間後に fetch-metrics が成功するか |
| 4 | 1週間後に学習確認 | hook_candidates の tiktok_* カラムが更新されているか |

---

*このSpecは1.5.0 TikTokエージェントの実装を定義する。*
*main-spec.md と db-schema-spec.md と合わせて参照すること。*
