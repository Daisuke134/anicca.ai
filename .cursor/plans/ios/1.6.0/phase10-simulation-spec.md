# Phase 10: シミュレーション基盤

> **バージョン**: 1.6.0
>
> **最終更新**: 2026-01-26
>
> **前提**: 1.5.0（クロスユーザー学習 + TikTok投稿）完了後
>
> **状態**: レビュー中

---

## 1. 概要

### 1.1 What（何をするか）

| 項目 | 内容 |
|------|------|
| 概要 | シミュレーション基盤を構築し、ペルソナベースのNudge効果予測とTikTokマーケティングデータの自動収集を実現する |

### 1.2 Why（なぜ必要か）

| 課題 | 解決策 |
|------|--------|
| Nudge効果の事前検証ができない | ペルソナ×Nudgeのシミュレーションで事前予測 |
| TikTokデータの手動収集は非効率 | Marketing API連携で日次自動収集 |
| ユーザーセグメントの理解が曖昧 | 5-8個のコアペルソナで明確化 |

---

## 2. スコープ

### 2.1 1.6.0でやること

| 機能 | 詳細 |
|------|------|
| DBスキーマ作成 | ペルソナ、シミュ結果、TikTokメトリクス用テーブル |
| ペルソナ生成 | 8個のコアペルソナをDBに登録 |
| EDSLシミュレーション | ペルソナ×Nudge候補のシミュレーション実行 |
| TikTokデータ自動収集 | Marketing APIで日次メトリクス取得 |
| Appフィードバック集計 | 日次でnudge_feedbackを集計 |

### 2.2 1.6.0でやらないこと（境界）

| 機能 | 理由 | 予定バージョン |
|------|------|---------------|
| 校正ループ | シミュ予測 vs 実データ比較は基盤完成後 | 1.7.0 |
| Wisdom抽出 | LLMでの自然言語抽出は次フェーズ | 1.7.0 |
| Wisdom適用 | Nudge生成時の参照は次フェーズ | 1.7.0 |

| 注記 | 内容 |
|------|------|
| Wisdomテーブル | 1.6.0でスキーマ作成（マイグレーション実施）、機能実装は1.7.0。1.7.0での追加マイグレーション不要 |

### 2.3 触るファイル

| パス | 変更種別 |
|------|---------|
| `apps/api/supabase/migrations/` | 新規追加 |
| `apps/api/src/seeds/personas.ts` | 新規追加 |
| `apps/api/src/services/tiktokDataCollector.ts` | 新規追加 |
| `apps/api/src/simulation/edsl_runner.py` | 新規追加 |
| `apps/api/src/jobs/simulationJob.ts` | 新規追加 |
| `apps/api/src/jobs/scheduled.ts` | 修正（Cronジョブ追加） |
| `apps/api/src/simulation/nudge_candidates.json` | 新規追加 |
| `apps/api/src/services/notificationService.ts` | 修正（Slack通知追加） |
| `apps/api/Dockerfile` | 修正（Python追加） |
| `apps/api/requirements.txt` | 新規追加 |

### 2.4 触らないファイル

| パス | 理由 |
|------|------|
| `aniccaios/` | iOS側の変更なし |
| `apps/api/src/routes/mobile/` | 既存APIに変更なし |
| `apps/landing/` | ランディングページに変更なし |

---

## 3. 後方互換性

### 3.1 既存APIへの影響

| 項目 | 影響 |
|------|------|
| 既存エンドポイント | **変更なし** |
| 既存レスポンス形式 | **変更なし** |
| 既存必須パラメータ | **変更なし** |
| 既存テーブル | **変更なし**（新規テーブル追加のみ） |

### 3.2 マイグレーション方針

| 方針 | 詳細 |
|------|------|
| 追加のみ | 新規テーブル・インデックスの追加 |
| 削除なし | 既存テーブル・カラムの削除なし |
| 変更なし | 既存カラムの型変更なし |

### 3.3 古いバージョンのアプリへの影響

| 項目 | 影響 |
|------|------|
| iOSアプリとの通信 | **変更なし** |
| 理由 | バックエンド内部の機能追加のみ |

---

## 4. As-Is（現状）

### 4.1 現在のデータ収集

| データ | 収集方法 | 問題 |
|--------|---------|------|
| TikTokメトリクス | 手動でAds Managerから確認 | 非効率、漏れあり |
| Nudgeフィードバック | `nudge_feedback`テーブルに保存 | 集計・分析なし |
| ユーザーセグメント | ProblemTypeで分類 | 詳細なペルソナなし |

### 4.2 現在のNudge効果検証

| 項目 | 状況 |
|------|------|
| 事前検証 | なし（本番でA/Bテストのみ） |
| 効果予測 | 経験則のみ |
| データドリブン | 不十分 |

---

## 5. To-Be（変更後）

### 5.1 DBスキーマ

#### simulated_personas テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| name | TEXT | ペルソナ名 | NOT NULL |
| problem_types | TEXT[] | 関連するProblemType配列 | NOT NULL |
| attributes | JSONB | 年齢、ライフスタイル、活動時間 | |
| psychological_profile | JSONB | コアペイン、防衛機制等 | |
| behavior_hypotheses | JSONB | 好みのトーン、効果的なHook等 | |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |

#### simulation_runs テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| persona_id | UUID | ペルソナFK | NOT NULL, REFERENCES simulated_personas(id) ON DELETE RESTRICT |
| nudge_config | JSONB | Nudge設定（hook, content, tone等） | NOT NULL |
| predictions | JSONB | 予測結果（タップ率、サムズアップ率等） | NOT NULL |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |

#### tiktok_ad_metrics テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| ad_id | TEXT | TikTok広告ID | NOT NULL |
| impressions | INT | インプレッション数 | |
| clicks | INT | クリック数 | |
| ctr | DECIMAL(5,4) | クリック率 | |
| spend | DECIMAL(10,2) | 消費金額 | |
| video_views | INT | 動画視聴数 | |
| engagement_rate | DECIMAL(5,4) | エンゲージメント率 | |
| date | DATE | 日付 | NOT NULL |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |
| - | - | **一意制約** | **UNIQUE(ad_id, date)** |

#### ad_persona_mapping テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| ad_id | TEXT | TikTok広告ID | NOT NULL |
| persona_id | UUID | ペルソナFK | NOT NULL, REFERENCES simulated_personas(id) ON DELETE RESTRICT |
| hook | TEXT | 広告で使ったHook | |
| content | TEXT | 広告で使ったContent | |
| tone | TEXT | 広告のトーン | |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |

#### wisdom テーブル（1.7.0で使用）

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| persona_id | UUID | ペルソナFK | NOT NULL, REFERENCES simulated_personas(id) ON DELETE CASCADE |
| category | TEXT | tone/timing/content/hook | NOT NULL, CHECK (category IN ('tone', 'timing', 'content', 'hook')) |
| principle | TEXT | 抽出された原則 | NOT NULL |
| confidence | DECIMAL(3,2) | 信頼度（0-1） | DEFAULT 0.50 |
| evidence_count | INT | エビデンス件数 | DEFAULT 0 |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |
| - | - | **一意制約** | **UNIQUE(persona_id, category, principle)** |

#### daily_feedback_summary テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| id | UUID | 主キー | PRIMARY KEY |
| date | DATE | 集計日 | NOT NULL |
| problem_type | TEXT | 問題タイプ | NOT NULL |
| total_delivered | INT | 配信数 | DEFAULT 0 |
| total_opened | INT | 開封数 | DEFAULT 0 |
| thumbs_up_count | INT | 👍数 | DEFAULT 0 |
| thumbs_down_count | INT | 👎数 | DEFAULT 0 |
| created_at | TIMESTAMPTZ | 作成日時 | DEFAULT NOW() |
| - | - | **一意制約** | **UNIQUE(date, problem_type)** |

| 注記 | 内容 |
|------|------|
| 集計元 | 既存の`nudge_feedback`テーブルを日次集計 |
| 実行ジョブ | `daily_feedback_aggregate`が毎日06:30 UTCに実行 |

#### system_settings テーブル

| カラム | 型 | 説明 | 制約 |
|--------|-----|------|------|
| key | TEXT | 設定キー | PRIMARY KEY |
| value | JSONB | 設定値 | NOT NULL |
| updated_at | TIMESTAMPTZ | 更新日時 | DEFAULT NOW() |

| 初期データ | key | value |
|-----------|-----|-------|
| Cron停止フラグ | tiktok_cron_disabled | `{"enabled": false}` |

#### インデックス

| テーブル | インデックス | 目的 |
|---------|-------------|------|
| simulation_runs | idx_simulation_runs_persona | ペルソナ別検索 |
| tiktok_ad_metrics | idx_tiktok_metrics_date | 日付別検索 |
| tiktok_ad_metrics | idx_tiktok_metrics_ad_date | upsert用 |
| wisdom | idx_wisdom_persona | ペルソナ別検索 |
| wisdom | idx_wisdom_confidence | 信頼度順検索 |
| daily_feedback_summary | idx_daily_feedback_date | 日付別検索 |
| daily_feedback_summary | idx_daily_feedback_problem | 問題タイプ別検索 |

### 5.2 サービス設計

#### TikTokDataCollector

| 項目 | 内容 |
|------|------|
| 責務 | TikTok Marketing APIからメトリクスを取得しDBに保存 |
| 入力 | 環境変数（TIKTOK_ACCESS_TOKEN等） |
| 出力 | tiktok_ad_metricsテーブルへのupsert |
| エラー処理 | API失敗時はSlack通知、exponential backoff（max 3回） |
| レート制限 | 10リクエスト/秒、1日10,000リクエスト（TikTok公式仕様） |
| upsert条件 | ON CONFLICT (ad_id, date) DO UPDATE |

#### SimulationJob

| 項目 | 内容 |
|------|------|
| 責務 | ペルソナ×Nudge候補のシミュレーション実行 |
| 入力 | simulated_personas、Nudge候補プール（下記参照） |
| 出力 | simulation_runsテーブルへの保存 |
| エラー処理 | EDSL失敗時はログ出力、該当ペルソナをスキップ |

#### Nudge候補プール定義

| 項目 | 内容 |
|------|------|
| データソース | `apps/api/src/simulation/nudge_candidates.json`（JSONファイル） |
| 候補数 | 50件（初期プール） |
| 選定根拠 | 13個のProblemType × 約4種類のHook/Content = 約52件、実用範囲で50件に調整 |
| 更新方法 | JSONファイルを手動更新、デプロイで反映 |
| バージョニング | Gitで管理、変更履歴を追跡可能 |

**Nudge候補JSONの構造:**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 候補ID |
| problem_type | string | 対象ProblemType |
| hook | string | 通知のフック文言 |
| content | string | 通知の本文 |
| default_tone | string | デフォルトトーン（gentle/direct/playful） |

| なぜJSONファイルか | 理由 |
|-------------------|------|
| 変更頻度 | DBに格納するほど頻繁に変更しない |
| レビュー | バージョン管理でレビュー可能 |
| 一貫性 | デプロイと同期するため一貫性が保たれる |

#### EDSLRunner（Python）

| 項目 | 内容 |
|------|------|
| 責務 | EDSLライブラリを使ってシミュレーション実行 |
| 実行環境 | Railway APIサーバー上のPython（専用ワーカープロセス） |
| 依存 | Python 3.10+, edsl, httpx, pydantic |
| 並列度 | 最大5並列（LLM API制限考慮） |
| LLM API | OpenAI API（OPENAI_API_KEY環境変数） |

#### 週次シミュレーション実行方式

| 項目 | 設定 |
|------|------|
| 実行方式 | 専用ワーカープロセス（APIプロセスから分離） |
| タイムアウト | 30分/バッチ、全体2時間 |
| リトライ | 失敗時最大3回、exponential backoff |
| 並列上限 | 5並列（LLM API制限） |
| チェックポイント | simulation_runsに途中結果保存、再開可能 |
| 中断時対応 | 未処理ペルソナから再開 |
| リソース制限 | メモリ2GB上限 |

| なぜワーカー分離か | 理由 |
|-------------------|------|
| API可用性 | 長時間処理がAPIレスポンスを圧迫しない |
| 障害分離 | シミュレーション失敗がAPIに影響しない |
| スケーラビリティ | 独立スケール可能 |

### 5.3 1000パターンの計算ロジック

| 項目 | 数 | 計算 |
|------|-----|------|
| ペルソナ数 | 8 | 固定 |
| Nudge候補数 | 50 | 初期プール |
| トーンバリエーション | 3 | gentle/direct/playful |
| タイミングバリエーション | 2 | morning/evening |
| 合計パターン | **2400** | 8 × 50 × 3 × 2 |
| 受け入れ条件 | 1000パターン以上 | 2400パターンで十分に達成 |

### 5.4 Cronジョブ設計

| ジョブ | 実行時間(UTC) | 処理内容 |
|--------|--------------|---------|
| daily_tiktok_collect | 06:00 | TikTokメトリクス取得 |
| daily_feedback_aggregate | 06:30 | Appフィードバック集計 |
| weekly_simulation | 日曜 00:00 | バッチシミュレーション |

---

## 6. To-Be チェックリスト

| # | To-Be項目 | 完了条件 |
|---|----------|---------|
| 1 | simulated_personasテーブル作成 | マイグレーション成功 |
| 2 | simulation_runsテーブル作成 | マイグレーション成功 |
| 3 | tiktok_ad_metricsテーブル作成 | マイグレーション成功 |
| 4 | ad_persona_mappingテーブル作成 | マイグレーション成功 |
| 5 | wisdomテーブル作成 | マイグレーション成功 |
| 6 | daily_feedback_summaryテーブル作成 | マイグレーション成功 |
| 7 | system_settingsテーブル作成 | マイグレーション成功 |
| 8 | 8個のペルソナ初期データ投入 | seed実行成功 |
| 9 | Nudge候補プール作成 | nudge_candidates.json作成 |
| 10 | TikTokDataCollector実装 | Unit/Integrationテスト通過 |
| 11 | SimulationJob実装 | Unit/Integrationテスト通過 |
| 12 | EDSLRunner実装 | Integrationテスト通過 |
| 13 | daily_tiktok_collectジョブ | Cronテスト通過 |
| 14 | daily_feedback_aggregateジョブ | Cronテスト通過 |
| 15 | weekly_simulationジョブ | Cronテスト通過 |
| 16 | Cron停止フラグ実装 | DB設定テーブル方式 |

---

## 7. ユーザーGUI作業

### 7.1 実装前（必須）

| # | タスク | URL/手順 | 取得するもの |
|---|--------|----------|-------------|
| 1 | TikTok For Businessアカウント作成 | https://ads.tiktok.com/ | アカウント |
| 2 | Developer登録 | Marketing API → Become a Developer | Developer ID |
| 3 | アプリ作成 | My Apps → Create New | App ID |
| 4 | スコープ申請 | Ads Management, Reporting | 承認（2-3日） |
| 5 | Access Token取得 | OAuth認証フロー実行 | Access Token |
| 6 | OpenAI API Key取得 | https://platform.openai.com/ → API Keys | OPENAI_API_KEY |
| 7 | 環境変数設定 | Railway Staging | 設定完了 |

| 取得した環境変数 | 説明 | 取得元 |
|-----------------|------|--------|
| TIKTOK_APP_ID | アプリID | TikTok Developer Portal |
| TIKTOK_APP_SECRET | アプリシークレット | TikTok Developer Portal |
| TIKTOK_ACCESS_TOKEN | アクセストークン | OAuth認証フロー |
| TIKTOK_ADVERTISER_ID | 広告主ID | TikTok Ads Manager |
| OPENAI_API_KEY | EDSLシミュレーション用 | OpenAI Platform |

### 7.2 実装中（なし）

| 項目 | 内容 |
|------|------|
| 手動作業 | なし |
| 理由 | 全て自動化済み |

### 7.3 実装後（運用時）

| # | タスク | 頻度 | 詳細 |
|---|--------|------|------|
| 1 | 新規TikTok広告作成 | 新ペルソナ追加時 | Ads Managerで作成 |
| 2 | ad_persona_mapping登録 | 同上 | SQL/Admin UIで登録 |
| 3 | Access Token更新 | 60日ごと | OAuth再認証 |

---

## 8. セキュリティ

### 8.1 APIキー管理

| 項目 | 方針 |
|------|------|
| 保存場所 | Railway環境変数のみ |
| ログ出力 | シークレットは絶対に出力しない |
| コード内ハードコード | 禁止 |

| 管理対象キー | 用途 | ローテーション |
|-------------|------|---------------|
| TIKTOK_APP_ID | TikTok Marketing API | 固定 |
| TIKTOK_APP_SECRET | TikTok OAuth | 固定 |
| TIKTOK_ACCESS_TOKEN | TikTok API認証 | 60日ごと |
| TIKTOK_ADVERTISER_ID | TikTok広告主識別 | 固定 |
| OPENAI_API_KEY | EDSLシミュレーション用LLM | 必要に応じて |

### 8.2 TikTok Access Token

| 項目 | 詳細 |
|------|------|
| 有効期限 | 60日 |
| 更新方法 | OAuth再認証フロー |
| 失効時の対応 | Slack通知 + Cronジョブ停止 |
| 最小権限 | Ads Management (read-only), Reporting |

### 8.3 Cronジョブ停止方針

| 項目 | 詳細 |
|------|------|
| 停止条件 | TikTok Access Token失効（401エラー連続3回） |
| 停止方法 | DBの`system_settings`テーブルに`tiktok_cron_disabled=true`を保存 |
| 実装 | ジョブ開始時にDBからフラグをチェック、trueなら即return |
| 復旧手順 | Token更新後、DBのフラグを`false`に更新 |
| 通知 | 停止時にSlack通知（#anicca-alerts） |

| 参照 | 内容 |
|------|------|
| テーブル定義 | 5.1 DBスキーマ → system_settings テーブル参照 |

### 8.4 ログ出力方針

| パターン | 可否 | 例 |
|---------|------|-----|
| シークレット出力 | ❌ 禁止 | `Token: ${process.env.TIKTOK_ACCESS_TOKEN}` |
| 処理結果出力 | ✅ OK | `[TikTok] Fetched ${metrics.length} ad metrics` |
| エラー詳細出力 | ⚠️ 注意 | APIレスポンスからシークレットを除外して出力 |

---

## 9. 実行環境

### 9.1 EDSL Python環境

| 項目 | 詳細 |
|------|------|
| Python | 3.10+ |
| 依存パッケージ | edsl, httpx, pydantic |
| 実行ホスト | Railway API サーバー |
| 呼び出し方法 | Node.js child_process |
| 並列度 | 最大5（LLM API制限考慮） |

### 9.2 Railway Python導入手順

| ステップ | 内容 |
|---------|------|
| 1 | Dockerfileに`python3`と`pip`をインストール |
| 2 | `requirements.txt`に依存パッケージを記載 |
| 3 | ビルド時に`pip install -r requirements.txt`を実行 |
| 4 | 環境変数`OPENAI_API_KEY`を設定（EDSL内部で使用） |

| Dockerfile追記 | 内容 |
|----------------|------|
| apt-get update | システムパッケージ更新 |
| python3, python3-pip | Python環境インストール |
| COPY requirements.txt | 依存ファイルコピー |
| pip3 install -r requirements.txt | Python依存インストール |

| requirements.txt | バージョン |
|-----------------|-----------|
| edsl | >=0.1.0 |
| httpx | >=0.25.0 |
| pydantic | >=2.0.0 |

### 9.3 LLM APIプロバイダ

| 項目 | 詳細 |
|------|------|
| プロバイダ | OpenAI |
| モデル | gpt-4o-mini（コスト効率重視） |
| 環境変数 | `OPENAI_API_KEY` |
| 料金目安 | 2400パターン × $0.001 ≈ $2.40/回 |

### 9.4 TikTok API

| 項目 | 詳細 |
|------|------|
| レート制限 | 10リクエスト/秒、1日10,000リクエスト |
| リトライ方針 | 429エラー時、exponential backoff（max 3回） |
| タイムゾーン | UTC（APIデフォルト） |
| ページング | page_size=100、必要に応じて自動ページング |

---

## 10. 受け入れ条件

| # | 条件 | 測定方法 | 対応テスト |
|---|------|---------|----------|
| 1 | 8個のペルソナがDBに登録されている | `SELECT COUNT(*) FROM simulated_personas` = 8 | #8 `test_seed_personas_count` |
| 2 | 1000パターン以上のシミュが実行できる | `SELECT COUNT(*) FROM simulation_runs` >= 1000 | #27 `test_acceptance_simulation_count` |
| 3 | TikTok APIからデータが自動取得できる | tiktok_ad_metricsに日次データあり | #13 `test_tiktok_collector_fetch_success` |
| 4 | Appフィードバックが日次集計される | daily_feedback_summaryテーブルにデータあり | #28 `test_acceptance_feedback_aggregate` |
| 5 | Token失効時にCron停止フラグが有効になる | system_settingsにtiktok_cron_disabled=true | #34 `test_tiktok_token_expired_db_auto_disable` |
| 6 | Cron停止時にSlack通知が送信される | Slack #anicca-alertsに通知到達 | #29 `test_cron_failure_slack_notification` |
| 7 | 全テストが通過する | CI green | 全テスト |

---

## 11. テストマトリックス

| # | To-Be | テスト名 | 種別 | カバー |
|---|-------|----------|------|--------|
| 1 | simulated_personasテーブル | `test_migration_personas_table` | Integration | ⬜ |
| 2 | simulation_runsテーブル | `test_migration_simulation_runs_table` | Integration | ⬜ |
| 3 | tiktok_ad_metricsテーブル | `test_migration_tiktok_metrics_table` | Integration | ⬜ |
| 4 | ad_persona_mappingテーブル | `test_migration_ad_persona_mapping_table` | Integration | ⬜ |
| 5 | wisdomテーブル | `test_migration_wisdom_table` | Integration | ⬜ |
| 6 | daily_feedback_summaryテーブル | `test_migration_daily_feedback_summary_table` | Integration | ⬜ |
| 7 | system_settingsテーブル | `test_migration_system_settings_table` | Integration | ⬜ |
| 8 | ペルソナ初期データ投入 | `test_seed_personas_count` | Integration | ⬜ |
| 9 | Nudge候補プール読み込み | `test_nudge_candidates_load` | Unit | ⬜ |
| 10 | Nudge候補プールバリデーション | `test_nudge_candidates_validation` | Unit | ⬜ |
| 11 | ペルソナバリデーション | `test_persona_validation_valid` | Unit | ⬜ |
| 12 | ペルソナバリデーション失敗 | `test_persona_validation_invalid` | Unit | ⬜ |
| 13 | TikTokメトリクス取得 | `test_tiktok_collector_fetch_success` | Integration | ⬜ |
| 14 | TikTokメトリクス取得失敗 | `test_tiktok_collector_fetch_failure` | Integration | ⬜ |
| 15 | TikTokメトリクス保存 | `test_tiktok_collector_save_to_db` | Integration | ⬜ |
| 16 | TikTok重複データ処理 | `test_tiktok_collector_upsert_duplicate` | Integration | ⬜ |
| 17 | TikTokトークン失効 | `test_tiktok_collector_token_expired` | Integration | ⬜ |
| 18 | EDSLシミュレーション | `test_edsl_runner_batch_simulation` | Integration | ⬜ |
| 19 | EDSL失敗時スキップ | `test_edsl_runner_failure_skip` | Integration | ⬜ |
| 20 | SimulationJob実行 | `test_simulation_job_run_success` | Integration | ⬜ |
| 21 | SimulationJob保存 | `test_simulation_job_save_results` | Integration | ⬜ |
| 22 | SimulationJob失敗 | `test_simulation_job_failure_handling` | Integration | ⬜ |
| 23 | daily_tiktok_collectジョブ | `test_cron_tiktok_collect_executes` | Integration | ⬜ |
| 24 | daily_feedback_aggregateジョブ | `test_cron_feedback_aggregate_executes` | Integration | ⬜ |
| 25 | weekly_simulationジョブ | `test_cron_weekly_simulation_executes` | Integration | ⬜ |
| 26 | weekly_simulation失敗時 | `test_cron_weekly_simulation_failure` | Integration | ⬜ |
| 27 | 受け入れ条件#2検証 | `test_acceptance_simulation_count` | Integration | ⬜ |
| 28 | 受け入れ条件#4検証 | `test_acceptance_feedback_aggregate` | Integration | ⬜ |
| 29 | Cron失敗時Slack通知 | `test_cron_failure_slack_notification` | Integration | ⬜ |
| 30 | ad_persona_mapping登録 | `test_ad_persona_mapping_insert` | Integration | ⬜ |
| 31 | tiktok_ad_metrics一意制約 | `test_tiktok_metrics_unique_constraint` | Integration | ⬜ |
| 32 | daily_feedback_summary一意制約 | `test_daily_feedback_summary_unique_constraint` | Integration | ⬜ |
| 33 | DB Cron停止フラグ参照 | `test_cron_db_disable_flag_check` | Unit | ⬜ |
| 34 | Token失効時DB自動停止 | `test_tiktok_token_expired_db_auto_disable` | Integration | ⬜ |

---

## 12. E2Eシナリオ

| 注記 | 内容 |
|------|------|
| Maestro E2E | 不要（バックエンド内部機能のため） |

### 12.1 手動検証シナリオ

| # | シナリオ | 確認項目 |
|---|---------|---------|
| 1 | Cronジョブ実行確認 | Railway logsでジョブ実行ログを確認 |
| 2 | TikTokデータ確認 | DBのtiktok_ad_metricsにデータあり |
| 3 | シミュレーション結果確認 | DBのsimulation_runsにデータあり |
| 4 | 日次集計確認 | DBのdaily_feedback_summaryにデータあり |

---

## 13. Skills / Sub-agents

| ステージ | 使用するもの | 用途 |
|---------|-------------|------|
| Spec作成 | `/plan` | 実装計画の作成 |
| テスト実装 | `/tdd-workflow` | TDDでテスト先行開発 |
| コードレビュー | `/code-review` | 実装後のレビュー |
| ビルドエラー | `/build-fix` | エラー発生時の修正 |
| Spec/コードレビュー | `/codex-review` | 自動レビューゲート |

---

## 14. ローカライズ

| 注記 | 内容 |
|------|------|
| 追加テキスト | なし（バックエンド内部機能のため） |

| 言語 | 追加文字列 |
|------|-----------|
| 日本語 | なし |
| 英語 | なし |

---

## 15. 実行手順

| # | コマンド | 説明 |
|---|---------|------|
| 1 | `cd apps/api && npm run build` | ビルド |
| 2 | `cd apps/api && npm run test` | Unit + Integration Tests |
| 3 | `cd apps/api && npm run test -- --grep "tiktok"` | 特定テストのみ |
| 4 | `cd apps/api && npx supabase db push` | マイグレーション |
| 5 | `cd apps/api && npm run seed:personas` | ペルソナseed |
| 6 | `cd apps/api && railway up --environment staging` | Stagingデプロイ |

---

## 16. タスクリスト

| # | タスク | ファイル | 優先度 |
|---|--------|----------|--------|
| 1 | DBスキーマ作成（migration、system_settings含む） | `apps/api/supabase/migrations/` | 高 |
| 2 | ペルソナ初期データ投入 | `apps/api/src/seeds/personas.ts` | 高 |
| 3 | Nudge候補プール作成 | `apps/api/src/simulation/nudge_candidates.json` | 高 |
| 4 | TikTokDataCollector実装 | `apps/api/src/services/tiktokDataCollector.ts` | 高 |
| 5 | EDSL Pythonスクリプト | `apps/api/src/simulation/edsl_runner.py` | 高 |
| 6 | SimulationJob実装 | `apps/api/src/jobs/simulationJob.ts` | 中 |
| 7 | 日次Cronジョブ設定 | `apps/api/src/jobs/scheduled.ts` | 中 |
| 8 | Dockerfile更新（Python追加） | `apps/api/Dockerfile` | 中 |
| 9 | エラー通知（Slack） | `apps/api/src/services/notificationService.ts` | 低 |
| 10 | Cron停止フラグ実装 | `apps/api/src/jobs/scheduled.ts` | 低 |

---

## 17. レビューチェックリスト

### 17.1 Specレビュー

| # | 項目 | 確認 |
|---|------|------|
| 1 | 全To-Beがテストマトリックスに含まれているか | ⬜ |
| 2 | 受け入れ条件がテスト可能な形式か | ⬜ |
| 3 | 設計（シグネチャ、データモデル）が明確か | ⬜ |
| 4 | 境界（やらないこと）が定義されているか | ⬜ |
| 5 | 後方互換性は保たれているか | ⬜ |
| 6 | セキュリティ（APIキー管理）が適切か | ⬜ |
| 7 | As-Isの問題がTo-Beで解決されるか | ⬜ |

### 17.2 実装レビュー

| # | 項目 | 確認 |
|---|------|------|
| 1 | テストが先に書かれているか（TDD） | ⬜ |
| 2 | 80%以上のテストカバレッジか | ⬜ |
| 3 | エラーハンドリングが適切か | ⬜ |
| 4 | ログ出力にシークレットが含まれていないか | ⬜ |
| 5 | 既存APIに影響がないか | ⬜ |

---

## 18. 参考

| 種別 | リンク |
|------|--------|
| EDSL公式 | https://github.com/expectedparrot/edsl |
| TikTok Marketing API | https://business-api.tiktok.com/portal/docs |

---

## 19. 次のステップ（1.7.0）

| # | 機能 | 詳細 |
|---|------|------|
| 1 | 週次校正ループ | シミュ予測 vs 実データ比較 |
| 2 | LLM Wisdom抽出 | 効果的なパターンを自然言語で抽出 |
| 3 | Wisdom適用 | Nudge生成時にWisdomを参照 |

---

*このSpecはCodex Review反復中。*
