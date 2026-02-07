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

### シミュレータ/ビルドのトラブルシューティング

| 症状 | 原因 | 解決策 |
|------|------|--------|
| 削除した画面がまだ表示される | 古いビルドがキャッシュ | `rm -rf build/DerivedData` → 再ビルド → `xcrun simctl install` |
| 「Could not find .app bundle」 | fastlane が install しない | 手動: `xcrun simctl install "iPhone 16 Pro" "build/DerivedData/Build/Products/Debug-iphonesimulator/aniccaios.app"` |
| DEBUG で Paywall スキップ | sandbox の `isEntitled=true` | `#if DEBUG` で `showPaywall = true; return` を強制 |

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
- **iOS**: Swift, SwiftUI
- **通知**: ProblemType-based Nudge System（ルールベース + LLM生成）
- **API**: Node.js, Railway
- **DB**: Railway PostgreSQL + Prisma（メイン）。Supabaseは補助サービスとして残存
- **決済**: RevenueCat, Superwall
- **分析**: Mixpanel, Singular

### 主要ディレクトリ
```
aniccaios/          - iOSアプリ本体
apps/api/           - APIサーバー
daily-apps/         - 関連アプリ（Daily Dhamma等）
.cursor/plans/      - 計画・仕様書
.kiro/              - ステアリング・スペック
```

### サブスクリプション & Paywall

| 項目 | 内容 |
|------|------|
| 価格 | $9.99/月（月額のみ） |
| Paywall種別 | ハード（無料利用不可） |
| トライアル | 1週間無料 |
| 決済基盤 | RevenueCat + Superwall |

### 1週間トライアル戦略

| 日 | 体験 | 狙い |
|----|------|------|
| Day 1 | ルールベースNudge（5回/日/問題） | 即座に価値体感 |
| Day 2-6 | LLM Nudge（学習・パーソナライズ） | 行動科学 + ユーザー履歴で最適化 |
| Day 7 | 解約判断日 | 「これなしでは無理」状態を目指す |

### ペルソナ（全判断基準）

**ターゲット**: 6-7年間、習慣化に失敗し続けている25-35歳

| 特徴 | 詳細 |
|------|------|
| **コア・ペイン** | 習慣アプリ10個以上試して全部3日坊主で挫折 |
| **自己認知** | 「自分はダメな人間だ」と信じ込んでいる |
| **心理状態** | 諦めモードだが心の奥では変わりたい |
| **刺さるHook** | 「6年間、何も変われなかった」「習慣アプリ10個全部挫折」 |
| **避けるHook** | 「簡単に習慣化！」「たった○日で！」（信じない、警戒する） |
| **UI設計** | 挫折を前提に、責めない、小さすぎるステップ |

**詳細:** `.claude/rules/persona.md`

### iOS実装状況（2026年1月26日時点）

| 項目 | 内容 |
|------|------|
| App Store承認 | 1.3.0（Phase 6） |
| 次回提出 | 1.4.0 |
| メイン画面 | `MyPathTabView` — 問題一覧、Tell Anicca、DeepDive、課金/アカウント |

**オンボーディング:** welcome → value → struggles → notifications

| ステップ | View |
|---------|------|
| welcome | `WelcomeStepView`（紹介 + 復元） |
| value | `ValueStepView`（価値説明） |
| struggles | `StrugglesStepView`（13問題選択） |
| notifications | `NotificationPermissionStepView` |

**13 ProblemTypes:** `staying_up_late, cant_wake_up, self_loathing, rumination, procrastination, anxiety, lying, bad_mouthing, porn_addiction, alcohol_dependency, anger, obsessive, loneliness`

**Nudgeシステム:**

| 機能 | 担当 |
|------|------|
| Problem Nudge | `ProblemNotificationScheduler` |
| Server-driven | `NotificationScheduler`（認可+サーバーNudgeのみ、約140行） |
| LLM生成（Phase 6） | `LLMNudgeService` / `LLMNudgeCache` |

**注意:** ProblemTypeベース（HabitType削除済み）。音声機能も削除済み。LLM Nudgeは `/api/mobile/nudge/today` を日次取得。

---

## セッション管理

### 開始時の必須アクション

1. devブランチにいることを確認
2. ペルソナを意識（上記参照）
3. 関連するSerenaメモリを確認
4. MCP接続確認（必要なタスクのみ）

### 実装完了時の必須アクション

**CLAUDE.mdを常に最新に保つ！** 実装完了後、以下を更新：
- iOSアプリ現在の実装状況セクション
- 技術スタックセクション（変更があれば）
- 最終更新日

### 開発ワークフロー

**Kiroスタイル開発**（大規模機能時）:
`/kiro:steering` → `/kiro:spec-init` → `/kiro:spec-requirements` → `/kiro:spec-design` → `/kiro:spec-tasks` → `/kiro:spec-status`

パス: ステアリング `.kiro/steering/` / スペック `.kiro/specs/` / コマンド `.claude/commands/`

### ユーザー情報

- 日本語ネイティブ、iOSアプリ開発者
- App Store提出経験あり
- TikTokでのプロモーション計画中

### 日報

開発ログは `.cursor/logs/` に日付ごとに記録（`YYYY-MM-DD.md`）。

---

## 参照先インデックス

### `.claude/rules/`（毎セッション自動読み込み）

| ファイル | 内容 |
|---------|------|
| `coding-style.md` | イミュータビリティ、ファイル構成、FK制約パターン、リファクタリング方針 |
| `git-workflow.md` | コミット形式、PR、semver、Gitトラブルシューティング、hotfix |
| `testing-strategy.md` | テストピラミッド、TDDサイクル、AAA、Swift Testing、Maestro E2E |
| `security.md` | セキュリティチェックリスト、Secret管理原則 |
| `skill-subagent-usage.md` | Skill/Subagent使い分け、委任ルール、並列パターン |
| `dev-workflow.md` | 3ゲート開発ワークフロー、codex-review、Feature Flag |
| `worktree.md` | 並列開発ルール、Spec境界、Backend Worktreeデプロイ |
| `deployment.md` | 実機デプロイ、Netlify、App Storeリンクルール |
| `spec-writing.md` | Specコア6セクション、テストマトリックス、GUI作業、E2E判定 |
| `tool-usage.md` | MCP優先、Maestro MCP、Fastlane、開発コマンド一覧 |
| `persona.md` | ペルソナ詳細版（基本属性、心理特徴、コンテンツ判断基準） |

### `.cursor/plans/reference/`（自動読み込みなし — 必要時にReadで参照）

| ファイル | 内容 | いつ読む |
|---------|------|---------|
| `secrets.md` | GitHub Secrets、Railway環境変数詳細、DB Proxy URL | デプロイ・Secret設定時 |
| `infrastructure.md` | Cronジョブ構成、Railway運用、1.5.0教訓 | インフラ作業時 |
| `openclaw-learnings.md` | OpenClaw スキル作成ルール、ツール使い分け、失敗から学んだこと | OpenClaw 作業時（必読） |
| `daily-metrics.md` | Daily Metrics Report設定、ASC API Key、KPI目標 | メトリクス作業時 |

---

## MCP（Model Context Protocol）使い方

### プロジェクトID

| サービス | ID | 用途 |
|---------|---|------|
| **Mixpanel** | `3970220` (integer) | 分析クエリ |
| **RevenueCat** | `projbb7b9d1b` (string) | 課金・Offering管理 |

### Mixpanel MCP

```
# イベント一覧取得
user-mixpanel-get_events: {"project_id": 3970220}

# セグメンテーションクエリ（イベント数取得）
user-mixpanel-run_segmentation_query: {
  "project_id": 3970220,
  "event": "rc_trial_started_event",
  "from_date": "2026-01-04",
  "to_date": "2026-02-04",
  "unit": "month"
}

# ファネルクエリ
user-mixpanel-run_funnels_query: {"project_id": 3970220, ...}
```

### RevenueCat MCP

```
# Offering一覧
user-revenuecat-mcp_RC_list_offerings: {"project_id": "projbb7b9d1b"}

# 新Offering作成
user-revenuecat-mcp_RC_create_offering: {
  "project_id": "projbb7b9d1b",
  "lookup_key": "anicca_treatment_a",
  "display_name": "Anicca Treatment A"
}

# パッケージ作成
user-revenuecat-mcp_RC_create_package: {
  "project_id": "projbb7b9d1b",
  "offering_id": "ofrng...",
  "lookup_key": "$rc_monthly",
  "display_name": "Monthly Plan"
}

# 商品紐付け
user-revenuecat-mcp_RC_attach_products_to_package: {
  "project_id": "projbb7b9d1b",
  "package_id": "pkge...",
  "products": [{"product_id": "prod...", "eligibility_criteria": "all"}]
}
```

### 正しいデータソース

| 目的 | 使うイベント | ソース |
|-----|------------|-------|
| トライアル開始数 | `rc_trial_started_event` | RevenueCat→Mixpanel（正確） |
| Paywall表示数 | `onboarding_paywall_viewed` | iOS SDK |

**注意:** `onboarding_paywall_purchased`は使わない（DEBUG/サンドボックス含む）

### Slack Tokens（OpenClaw/Anicca用）

**シークレットは `.env` ファイルに保存済み（gitignored）:**
- `SLACK_BOT_TOKEN` - Anicca Bot Token
- `SLACK_APP_TOKEN` - Socket Mode Token

### OpenClaw（Anicca）— VPS 稼働中

**現状（2026-02-06）:**
- Gateway: 🟢 **VPS (46.225.70.241) で24時間稼働中**
- Profile: **full**（全ツール有効: fs, exec, memory, slack, cron, web_search, browser等）
- エージェント: GPT-4o
- Slack: 全チャンネル許可（groupPolicy: open）
- Cron: 毎朝5:00 JST メトリクスレポート + ミーティングリマインダー

| 項目 | 値 |
|------|-----|
| **VPS IP** | `46.225.70.241`（`ssh anicca@46.225.70.241`） |
| Config | `/home/anicca/.openclaw/openclaw.json` |
| Env | `/home/anicca/.env`（systemd EnvironmentFile経由） |
| Skills | `/usr/lib/node_modules/openclaw/skills/` |
| Logs | `/home/anicca/.openclaw/logs/` |
| Cron | `/home/anicca/.openclaw/cron/jobs.json` |

**Anicca への指示方法（2種類）:**

| 方法 | コマンド | 用途 |
|------|---------|------|
| **エージェントターン** | `openclaw agent --message "..." --deliver` | Aniccaの脳を通す（思考→行動） |
| **直接投稿** | `openclaw message send --channel slack --target "C091G3PKHL2" --message "..."` | Slack直接投稿（脳を通さない） |

**Gateway 再起動（設定変更後のみ必要）:**
```bash
# anicca ユーザーから実行
ssh anicca@46.225.70.241
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user restart openclaw-gateway
```

**重要ルール:**
- **Gateway再起動は `openclaw.json` や `.env` 変更時のみ**（クラッシュ時はsystemd自動復帰）
- **MCP ツール（`mcp__*`）は OpenClaw では使えない**（Claude Code専用）
- **Slack投稿は `slack` ツール（profile:full で有効）または `exec` + CLI**

**参照:**
- **Spec:** `.cursor/plans/ios/1.6.1/openclaw/anicca-openclaw-spec.md`
- **Secrets:** `.cursor/plans/reference/secrets.md`（VPS情報あり）
- **学び:** `.cursor/plans/reference/openclaw-learnings.md`

---

最終更新: 2026年2月6日
