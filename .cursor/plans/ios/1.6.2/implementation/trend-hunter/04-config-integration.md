## Required Tools

| ツール | 用途 |
|--------|------|
| `exec` | TwitterAPI.io呼び出し、reddapi API呼び出し、Apify API呼び出し、Railway API呼び出し |
| `web_search` | 補助検索（Brave API経由） |
| `slack` | 結果サマリー投稿 |
| `read` | 設定ファイル、既存hook一覧 |
| `write` | DLQ書き込み |

## Error Handling

| エラー | 対応 |
|--------|------|
| TwitterAPI.io 失敗/停止 | TikTok + Reddit の結果のみで続行。Slack #alerts に通知 |
| Apify TikTok Scraper 失敗 | X + Reddit の結果のみで続行 |
| reddapi API失敗 | X + TikTok の結果のみで続行 |
| LLMフィルタ/生成失敗 | Fallback Chain（gpt-4o → gpt-4o-mini → claude-3-5-haiku → llama-3.3-70b） |
| Railway API保存失敗 | DLQ に書き込み、次回実行時にリトライ |
| 全ソース失敗 | Slack #alerts に通知、DLQに記録 |

## Cron設定

```yaml
trend-hunter:
  skill: trend-hunter
  cron: "0 */4 * * *"   # 4時間ごと（1日6回）
  session: isolated
  delivery:
    mode: "none"
  prompt: |
    trend-hunter スキルを実行してください。

    1. 今回のローテーショングループを決定（実行回数 % 3）
    2. 対象ProblemTypeに対して、TikTok / Reddit / X から並列でトレンド収集
    3. Aniccaフィルタ（LLM）で関連度・バイラル度を判定
    4. 通過したトレンドからhook候補を生成（共感系 + 問題解決系、最大5件/回）
    5. 重複チェック後、Railway DBに保存
    6. Slack #trends に結果サマリーを投稿

    exec, browser, web_search, slack ツールを使用してください。
```

## 必要な環境変数

| 変数 | 用途 | コスト | 取得方法 | ステータス |
|------|------|--------|---------|-----------|
| `TWITTERAPI_KEY` | TwitterAPI.io（X検索+メトリクス） | $0.15/1k件（月~$9） | twitterapi.io でGoogle登録 | **ユーザーGUI作業必要** |
| `REDDAPI_API_KEY` | reddapi.dev セマンティック検索 | $9.90/月（Liteプラン） | reddapi.dev でGoogle/GitHub登録 | **ユーザーGUI作業必要** |
| `APIFY_API_TOKEN` | Apify TikTok Trends Scraper | 既存Apify枠内（$5/月） | **既にGitHub Secretsに登録済み** | **VPSの.envにもあるか要確認** |
| `ANICCA_AGENT_TOKEN` | Railway API 認証 | なし | 既存（VPSの.envにある） | 済 |
| `BRAVE_API_KEY` | web_search（補助検索） | 既存 | VPSの.envにある | 済 |

### 月間コスト見積もり

| 項目 | 計算 | 月額 |
|------|------|------|
| TwitterAPI.io | 1,920ツイート/日 × 30日 ÷ 1,000 × $0.15 | ~$9 |
| reddapi.dev Lite | 500 API calls/月（固定） | $9.90 |
| Apify TikTok Trends | 既存無料枠（$5/月クレジット）内で~540 runs | $0 |
| LLM（フィルタ+hook生成） | 12回/日 × 30日、gpt-4o-mini推定 | ~$3 |
| **合計** | | **~$22/月** |

## trend-watcher（ClawHub）からの流用

| 流用するもの | 内容 |
|------------|------|
| **スキル構造** | SKILL.md + index.js + _meta.json の3ファイル構成 |
| **HTTPリクエスト関数** | `httpRequest()` — タイムアウト付き、Node.js標準のみ |
| **HTMLパーサーパターン** | `parseTrendingHTML()` — GitHub Trending用。TikTok Creative Center にも応用 |
| **カテゴリフィルタ方式** | キーワード辞書 → 13 ProblemType辞書に置き換え |
| **キャッシュデータ方式** | API失敗時のフォールバック用ローカルキャッシュ |

## reddapi（ClawHub）からの流用

| 流用するもの | 内容 |
|------------|------|
| **セマンティック検索パターン** | `"I wish there was an app that"` 系のクエリ設計 |
| **トレンドAPI** | `growth_rate` によるトレンド急成長検出 |
| **curlベースの実装** | OpenClaw exec ツールとの親和性が高い |

## x-poster との連携（データフロー）

```
trend-hunter (4h間隔)
    ↓ ProblemType別にバイラルコンテンツ検出
    ↓ 共感系 + 問題解決系の hook候補を生成
    ↓ POST /api/agent/hooks
    ↓
Railway DB (Hook テーブル)
    ↓ Thompson Sampling で選択
    ↓ contentType (empathy/solution) も考慮
    ↓
x-poster (09:00/21:00 JST)
    ↓ 朝=問題解決系（行動促進）、夜=共感系（寄り添い）
    ↓ content-verifier で検証
    ↓ X API で投稿
    ↓
投稿結果 → Hook統計更新 → Thompson Sampling の学習
    ↓
trend-hunter が学習結果を参照
    ↓ 高スコアProblemType → 検索頻度UP
    ↓ 低スコアProblemType → 検索頻度DOWN
```

