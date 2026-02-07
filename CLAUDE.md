# Anicca プロジェクト - 開発ガイドライン

## 絶対ルール

### 0. 意思決定ルール（最重要）

曖昧なものは『AskUserQuestionTool』を使ってヒヤリング
**選択肢を出してユーザーに決めさせるのは禁止。**


どんな場合でも：
1. ベストプラクティスを調べる
2. 自分で判断して **1つに決める**
3. その理由を述べる

### 0.1 自律的ベストプラクティス検索（絶対ルール）

**技術判断する前に、必ずベストプラクティスを検索する。ユーザーに言われなくても。**

| 判断カテゴリ | 例 |
|-------------|-----|
| アーキテクチャ変更（3ファイル以上） | サービス層追加、データフロー変更 |
| API設計・データモデル変更 | エンドポイント追加、スキーマ変更 |
| 外部依存ライブラリの選定・更新 | SDK選定、バージョンアップ |
| パフォーマンス・セキュリティ判断 | キャッシュ戦略、認証方式 |
| 新しいパターン導入 | 状態管理、テストフレームワーク |

検索手段（優先順）: `mcp__exa__web_search_exa` → `mcp__context7__query-docs` → `mcp__apple-docs__*` → `.claude/rules/`

### 0.2 Serena メモリ活用ルール（絶対ルール）

**プロジェクト知識は `.serena/memories/` に集約する。** CLAUDE.mdのコンテキスト圧迫を防ぐ。

| 場面 | アクション |
|------|-----------|
| セッション開始時 | 関連するSerenaメモリを `mcp__serena__read_memory` で読む |
| 新しい知見・設計判断が出た時 | `mcp__serena__write_memory` で記録 |
| 実装完了後 | 関連メモリを `mcp__serena__edit_memory` で更新 |
| ファイル編集（Swift/TS） | `mcp__serena__find_symbol` / `mcp__serena__replace_symbol_body` を活用 |
| コード探索 | `mcp__serena__get_symbols_overview` → `mcp__serena__find_symbol` で効率的に |

**主要メモリ一覧:**

| メモリ名 | 内容 |
|---------|------|
| `ios_app_architecture` | iOS画面構成、オンボーディング、Nudge、サブスク、API連携 |
| `api_backend_architecture` | APIエンドポイント、Prismaテーブル、Cron、Railway構成 |
| `nudge_system` | Nudgeシステム全体設計（ルールベース+LLM、フィードバックループ） |
| `project_overview` | プロジェクト概要、技術スタック、リポジトリ構成 |
| `project_structure` | ディレクトリ構成、エントリーポイント |
| `closed_loop_ops_design` | 1.6.2 Closed-Loop Ops設計 |
| `openclaw-anicca-setup` | OpenClaw VPS設定・運用 |

### 0.4 git push ルール（絶対ルール）

**push時は `git add -A` で全ファイルをステージしてpushする。** 他エージェントの変更も含めて全部。stashして除外・復元は禁止。同じリポジトリで複数エージェントが並行作業しているため、自分の担当外でも必ずステージ&pushする。

### 0.5 出力形式ルール

**説明・チェックリスト・比較・タスクリストは常にテーブル形式で出力する。箇条書きやリスト形式は禁止。**

### 0.6 テスト範囲ルール

**テストは実装した部分だけ。変更していないものはテストしない。**
- 今回の実装で変更・追加したものだけをリストに入れる
- 変更していない既存機能（リグレッション）は含めない
- チェックリスト・手順・比較・ステータス報告は必ずテーブル形式

### 言語ルール

- **ユーザーは英語または日本語で話す**（音声入力で英語が速い）
- **回答は常に日本語で行う**（ユーザーが英語でも日本語で返す）
- CLAUDE.mdやドキュメントは日本語で記述

### コンテンツ変更ルール

**変更を実装する前に、必ず Before/After をチャットで示す。** 承認後に実装。

### CLAUDE.md メンテナンスルール

**CLAUDE.mdへの追記前に必ず確認:**

| 判断 | 置き場所 |
|------|---------|
| 毎セッション必要？ | CLAUDE.md（300行以下を維持） |
| 特定ドメインのルール？ | `.claude/rules/` |
| 再利用ワークフロー？ | `.claude/skills/` |
| 低頻度の参照情報？ | `.cursor/plans/reference/` |

**禁止:** 300行を超える追記。超える場合は既存の内容をrules/に移動してから追記する。
**定期見直し:** 四半期ごとにClaude自体にCLAUDE.mdの最適化を依頼する。

---

## ブランチ & デプロイ

### ブランチ構成（Trunk-Based + Release Branch）

| ブランチ | 役割 | Railway 環境 |
|---------|------|-------------|
| `main` | Production デプロイ済み | Production（自動デプロイ） |
| `release/x.x.x` | App Store 提出スナップショット | - |
| `dev` | 開発中（= trunk） | Staging（自動デプロイ） |

**フロー:** dev開発 → テスト完了 → dev→mainマージ（Prodデプロイ） → main→release/x.x.x → App Store提出

**重要:** Backend を先にデプロイ。審査中にAPIが動かないとリジェクトされる。

### Railway サービス名

| 環境 | API | Cron |
|------|-----|------|
| **Staging** | `API` | `nudge-cron` |
| **Production** | `API` | `nudge-cronp`（末尾に`p`） |

### Railway 環境変数

| 変数 | API (Staging/Prod) | nudge-cron (Staging) | nudge-cronp (Prod) |
|------|-------------------|---------------------|-------------------|
| `CRON_MODE` | なし | `nudges` | `nudges` |
| `PROXY_BASE_URL` | あり | なし | なし |
| `DATABASE_URL` | あり | あり（internal） | あり（internal） |
| `OPENAI_API_KEY` | あり | あり | あり |
| `ANTHROPIC_API_KEY` | あり | なし | なし |

**`CRON_MODE`** は truthy チェック（`!!process.env.CRON_MODE`）。

### Railway URL

| 環境 | URL |
|------|-----|
| Staging | `anicca-proxy-staging.up.railway.app` |
| Production | `anicca-proxy-production.up.railway.app` |

**注意:** `anicca-api-production` ではない。`anicca-proxy-production` が正しいURL。

### 後方互換ルール（iOS + API 統合）

**古いバージョンのユーザーを壊さない。モバイルアプリは即座にアップデートされない。**

| ルール | 詳細 |
|--------|------|
| 古いコード削除は2〜3バージョン待つ | 95%以上のユーザーが移行したら削除可能 |
| API: Destructive Changes 禁止 | エンドポイント削除、レスポンス型変更、必須パラメータ追加 |
| API: Additive Changes のみ許可 | 新規エンドポイント、オプショナルフィールド追加 |
| API 削除時は6ヶ月deprecated | 移行ガイド提供 + 95%移行後に削除 |
| iOS: 新旧両方サポート | 移行期間を設ける |

### マージ前の最終確認（必須）

**エージェントは勝手にマージしない。** テスト完了後、必ずチェックリスト（テーブル形式）を提示してユーザーの「OK」を待つ。

### ワークツリールール（要約）

**原則ワークツリーを使う。ただしCLAUDE.md更新・ドキュメント変更などコード以外の変更はdev直接コミット可。**

- コード変更: `git worktree add ../anicca-<task> -b feature/<task>`
- 勝手にdevにマージしない。ユーザー確認を待つ
- 詳細: `.claude/rules/worktree.md`

### Fastlane（絶対ルール）

**xcodebuild 直接実行は禁止。** 必ず `cd aniccaios && fastlane <lane>` を使う。詳細: `.claude/rules/tool-usage.md`

### Maestro E2Eテスト（絶対ルール）

**Maestroテストを書く・修正する前に、必ずスキルを読む:** `.claude/skills/maestro-ui-testing/SKILL.md`

- `id:` セレクター優先（`point:` 禁止）
- `optional: true` はシステムダイアログのみ
- タップ → 遷移待ち → 確認の流れ
- **必ず `inspect_view_hierarchy` で実際のテキストを確認してからセレクター決定**

### 自律開発モード（Ralph パターン）

**「終わるまでやれ」「until done」と言われたら、Skill を読む:** `.claude/skills/ralph-autonomous-dev/SKILL.md`

| トリガー | 行動 |
|---------|------|
| 「終わるまでやれ」「keep going」 | fix_plan.md でタスク管理、完了まで繰り返す |
| 複数タスクの実装依頼 | fix_plan.md にチェックリスト作成 |
| テスト通るまで | テスト実行 → 失敗なら修正 → 繰り返す |

**完了時のみ EXIT_SIGNAL: true を出力。途中で出力しない。**

---

## プロジェクト概要

### Anicca とは
行動変容をサポートするiOSアプリ。AIを活用したプロアクティブな通知で、ユーザーの「苦しみ」に寄り添う。

### 技術スタック
- **iOS**: Swift, SwiftUI (iOS 15+, Xcode 16+)
- **通知**: ProblemType-based Nudge System（ルールベース + LLM生成）
- **API**: Node.js + Express (Railway)
- **DB**: Railway PostgreSQL + Prisma ORM（25テーブル）
- **決済**: RevenueCat + Superwall ($9.99/月, 1週間トライアル)
- **分析**: Mixpanel
- **AI**: OpenAI (Commander Agent, 構造化出力)
- **E2E**: Maestro
- **VPS Agent**: OpenClaw (GPT-4o, Slack連携)

### 主要ディレクトリ
`aniccaios/` iOS | `apps/api/` API | `apps/landing/` LP | `daily-apps/` 関連アプリ | `.cursor/plans/` 仕様書 | `.serena/memories/` メモリ

### サブスクリプション
$9.99/月、1週間無料トライアル、RevenueCat + Superwall。詳細: `mcp__serena__read_memory("ios_app_architecture")`

### ペルソナ
**ターゲット**: 6-7年間習慣化に失敗し続けている25-35歳。**詳細:** `.claude/rules/persona.md`

### iOS実装状況（2026年2月8日時点）

| 項目 | 内容 |
|------|------|
| 現在バージョン | 1.6.2 |
| メイン画面 | `MainTabView` → `MyPathTabView` + NudgeCard overlay + Paywall cover |
| ローカライズ | 6言語 (ja, en, de, es, fr, pt-BR) |

**オンボーディング (4ステップ):** welcome → struggles → liveDemo → notifications

| ステップ | View | 内容 |
|---------|------|------|
| welcome | `WelcomeStepView` | 紹介 + Sign in with Apple |
| struggles | `StrugglesStepView` | 13問題選択 |
| liveDemo | `DemoNudgeStepView` | 例Nudge体験 → Soft Paywall |
| notifications | `NotificationPermissionStepView` | 通知許可 |

**Nudgeシステム:** 詳細は `mcp__serena__read_memory("nudge_system")` 参照

| 機能 | 担当 |
|------|------|
| ルールベースNudge | `ProblemNotificationScheduler` + `NudgeContentSelector` |
| LLM Nudge | `LLMNudgeService` / `LLMNudgeCache` (日次取得) |
| フィードバック | `NudgeStatsManager` / `NudgeFeedbackService` |

**注意:** ProblemTypeベース。音声機能・ATT・Singular削除済み。

---

## セッション管理

### 開始時の必須アクション

1. devブランチにいることを確認
2. ペルソナを意識（上記参照）
3. **Serenaメモリを読む**: `mcp__serena__read_memory` でタスク関連のメモリを取得
4. MCP接続確認（必要なタスクのみ）

### 実装完了時の必須アクション

**CLAUDE.md + Serenaメモリを常に最新に保つ！** 実装完了後:
- CLAUDE.md: iOS実装状況、技術スタック、最終更新日
- Serenaメモリ: 関連メモリを `mcp__serena__edit_memory` で更新

### 開発ワークフロー
**Kiroスタイル開発**（大規模機能時）: `/kiro:steering` → `/kiro:spec-init` → `/kiro:spec-requirements` → `/kiro:spec-design` → `/kiro:spec-tasks`

### ユーザー情報
日本語ネイティブ、iOSアプリ開発者、App Store提出経験あり、TikTokプロモーション計画中

### 日報
`.cursor/logs/YYYY-MM-DD.md` に記録。

---

## 参照先インデックス

### `.claude/rules/`（毎セッション自動読み込み）
`coding-style.md`, `git-workflow.md`, `testing-strategy.md`, `security.md`, `skill-subagent-usage.md`, `dev-workflow.md`, `worktree.md`, `deployment.md`, `spec-writing.md`, `tool-usage.md`, `persona.md`, `mcp-openclaw.md`

### `.cursor/plans/reference/`（自動読み込みなし — 必要時にReadで参照）

| ファイル | 内容 | いつ読む |
|---------|------|---------|
| `secrets.md` | GitHub Secrets、Railway環境変数詳細、DB Proxy URL | デプロイ・Secret設定時 |
| `infrastructure.md` | Cronジョブ構成、Railway運用、1.5.0教訓 | インフラ作業時 |
| `openclaw-learnings.md` | OpenClaw スキル作成ルール、ツール使い分け、失敗から学んだこと | OpenClaw 作業時（必読） |
| `openclaw-anicca.md` | **Anicca OpenClaw 現在の状態・機能・スキル・壊れてるもの一覧** | **OpenClaw 作業時（必読）。変更後は必ず更新** |
| `daily-metrics.md` | Daily Metrics Report設定、ASC API Key、KPI目標 | メトリクス作業時 |

---

## MCP & OpenClaw

**詳細は `.claude/rules/mcp-openclaw.md`（自動読み込み）を参照。**

| 項目 | 値 |
|------|-----|
| Mixpanel ID | `3970220` |
| RevenueCat ID | `projbb7b9d1b` |
| VPS IP | `46.225.70.241` |

---

最終更新: 2026年2月8日
