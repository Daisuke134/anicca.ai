---

## 受け入れ条件（Acceptance Criteria）

> テスト可能な形式。全条件を満たすまで「完了」としない。

| # | 条件 | 検証方法 | テストケース |
|---|------|---------|------------|
| AC-1 | 4時間ごとのCron実行で、対象ProblemTypeグループのトレンドを3ソース（X, TikTok, Reddit）から収集できる | Cron手動実行 → Slack #trends にサマリーが投稿される | `test_orchestrator_happy_path` |
| AC-2 | 収集したトレンドをLLMフィルタで関連度判定し、relevance_score >= 5 かつ virality != 'low' のみ通過する | モックトレンド10件投入 → 通過件数がフィルタ条件と一致 | `test_filter_relevance_and_virality` |
| AC-3 | フィルタ通過トレンドから共感系・問題解決系のhook候補を最大5件/回生成する | LLMモック出力 → HookCandidate型に適合 + 5件以下 | `test_hook_generation_max5` |
| AC-4 | 生成hookがJaccard類似度0.7未満の場合のみRailway APIに保存される | 既存hookと類似度0.9のhook投入 → 保存スキップ | `test_orchestrator_duplicate_skip` |
| AC-5 | 13 ProblemTypeが3グループにローテーションされ、2日（6実行）で全Type網羅される | executionCount 0-5 を順に実行 → 全13 Typeが1回以上検索される | `test_rotation_full_coverage` |
| AC-6 | いずれかのデータソースが障害時、残りのソースで処理が続行される | twitterApiClient → Error設定 → TikTok+Redditで正常完了 | `test_orchestrator_twitter_down` |
| AC-7 | Railway API保存失敗時、DLQに書き込まれ次回実行でリトライされる | railwayApiClient.saveHook → Error → DLQファイルに記録される | `test_orchestrator_railway_save_fail` |
| AC-8 | 実行結果サマリーがSlack #trends に投稿される（ソース別件数、保存件数、共感系/問題解決系の内訳） | Slackモック → formatされたメッセージが送信される | `test_format_normal` |
| AC-9 | LLM出力がJSON Schemaに不適合の場合、1回リトライ後にDLQに記録される | 不正JSON出力モック → リトライ1回 → DLQ記録 | `test_llm_schema_validation_retry` |
| AC-10 | 月間コストが$30以下に収まる（TwitterAPI ~$9 + reddapi $9.90 + LLM ~$3） | 1週間運用後のAPI使用量レポートで確認 | 手動検証 |

---

## 境界（やらないこと）

| # | やらないこと | 理由 |
|---|------------|------|
| B-1 | **投稿の自動実行** | trend-hunterはhook候補を生成・保存するだけ。投稿はx-posterの責務 |
| B-2 | **X API v2 の直接利用** | $200/月。TwitterAPI.io($9/月)で十分 |
| B-3 | **TikTok動画のダウンロード・分析** | ハッシュタグトレンドのメタデータのみ。動画コンテンツは対象外 |
| B-4 | **Reddit投稿へのコメント・投票** | 読み取り専用。reddapi.devのセマンティック検索のみ |
| B-5 | **ユーザー個人情報の保存** | 投稿者のusername/profileは保存しない。hookテキストとメトリクスのみ |
| B-6 | **リアルタイムストリーミング** | 4時間間隔のバッチ処理。WebSocket/Streaming APIは使わない |
| B-7 | **画像・動画の生成** | テキストhookのみ。画像付き投稿はx-posterのスコープ |
| B-8 | **Paywall/課金ロジックへの影響** | iOSアプリ側の変更なし。バックエンドのhookテーブルに書くだけ |
| B-9 | **既存Cronジョブの変更** | daily-metrics-reporter, Lab Meeting Reminderには一切触らない |
| B-10 | **OpenClaw本体の設定変更** | `openclaw.json` のbindings/agents/policiesは変更しない。Cronジョブ追加のみ |

### 触るファイル

| ファイル | 操作 |
|---------|------|
| `/usr/lib/node_modules/openclaw/skills/trend-hunter/SKILL.md` | 新規作成 |
| `/usr/lib/node_modules/openclaw/skills/trend-hunter/index.js` | 新規作成 |
| `/usr/lib/node_modules/openclaw/skills/trend-hunter/_meta.json` | 新規作成 |
| `/home/anicca/.openclaw/cron/jobs.json` | 既存ファイルにジョブ追加 |
| `/home/anicca/.env` | `TWITTERAPI_KEY`, `REDDAPI_API_KEY` 追記（ユーザー作業） |

### 触らないファイル

| ファイル | 理由 |
|---------|------|
| `/home/anicca/.openclaw/openclaw.json` | エージェント設定は変更不要 |
| `aniccaios/` 配下全て | iOSアプリ変更なし |
| `apps/api/` 配下全て | Railway API変更は別タスク（P1で確認後） |
| 既存Cronジョブのprompt | daily-metrics, Lab Meeting は変更しない |

---

## E2E判定

| 項目 | 値 |
|------|-----|
| UI変更 | なし |
| 新画面 | なし |
| 新ボタン/操作 | なし |
| iOSアプリ変更 | なし |
| 結論 | **Maestro E2Eシナリオ: 不要** |

**理由**: trend-hunterはOpenClaw VPS上のバックエンドスキル。iOSアプリのUIには一切影響しない。検証はユニットテスト + 統合テスト + VPS上でのCron手動実行で完結する。

---

