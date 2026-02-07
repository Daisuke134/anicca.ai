# OpenClaw Anicca — 現在の状態と機能

**最終更新: 2026-02-07**

## VPS 情報

| 項目 | 値 |
|------|-----|
| IP | 46.225.70.241 |
| SSH | `ssh anicca@46.225.70.241` |
| OS | Ubuntu |
| OpenClaw | v2026.2.3-1 |
| Gateway | systemd user service + lingering |
| Profile | `full`（全ツール有効） |
| モデル | `openai/gpt-4o` |
| Workspace | `~/.openclaw/workspace` |
| Config | `~/.openclaw/openclaw.json` |
| Cron | `~/.openclaw/cron/jobs.json` |
| Env | `~/.env`（systemd EnvironmentFile 経由） |

## 現在できること

| 機能 | 状態 | 備考 |
|------|------|------|
| Slack 送受信 | OK | Socket Mode。全チャンネル許可 |
| Cron ジョブ | OK | 3 個稼働中（daily-metrics, lab-meeting x2） |
| ファイル読み書き | OK | workspace 内 |
| シェルコマンド実行 | OK | exec ツール。制限なし |
| SOUL.md / AGENTS.md | OK | Decisive + 日本語 + テーブル形式ルール記載済み |
| content-research-writer スキル | OK | workspace/skills/ に配置済み |

## 壊れてる / 未設定

| 機能 | 問題 | 修正方法 | 発見元 |
|------|------|---------|--------|
| **Web 検索** | Brave API Key が openclaw.json に未設定。.env にはあるが OpenClaw が読めない | `openclaw configure --section web` で apiKey を設定 | 既知 |
| **ハートビート** | `every: "0m"`（無効）。HEARTBEAT.md 未作成 | config で `every: "30m"` + HEARTBEAT.md 作成 + activeHours: 08:00-22:00 | 既知 + D2 |
| **MoltBook** | ハートビート無効のため投稿停止中 | ハートビート有効化 + HEARTBEAT.md に MoltBook チェック追加 | 既知 |
| **ブラウザ** | Chromium / Playwright 未インストール | apt install chromium + npx playwright install | 既知 |
| **Gmail** | 未接続 | GCP PubSub 経由で設定 | 既知 |
| **Twitter/X** | 未接続 | X公式OAuth 2.0で接続（Bird スキルは使わない: Cookie=BANリスク） | 既知 + 7.10 |
| **コーディング** | gh CLI 未インストール。coding-agent スキル未導入 | `npx clawhub@latest install coding-agent` + gh CLI | 既知 |
| **Memory** | MEMORY.md 未作成、日次ログなし、memoryFlush 無効 | workspace に MEMORY.md 作成 + memoryFlush.enabled: true | D1 |
| **session-memory hook** | 未有効化。セッション終了時にメモリ保存されない | config: hooks.internal.entries.session-memory.enabled: true | D3 |
| **Vector memory search** | 無効。メモリ検索がテキストマッチのみ | config: memorySearch.provider: "openai" | D4 |
| **groupPolicy** | "open"（誰でもDM/トリガー可能） | "allowlist" に変更 + セキュリティ監査実行 | D5 |
| **BOOT.md** | 未作成。Gateway再起動時の自動初期化チェックリストなし | workspace に BOOT.md 作成 | D6 |
| **セキュリティ監査** | 未実行。設定ミスの検出漏れ | `openclaw security audit --deep` 定期実行 | D7 |
| **mDNS** | デフォルト（VPS IP等の情報漏洩リスク） | config: gateway.mdns: "minimal" or "off" | D8 |
| **Cron bestEffort** | 未設定。配信失敗時にリトライなし | delivery.bestEffort: true を全Cronジョブに | D9 |
| **command-logger hook** | 未有効化。監査ログなし | 有効化推奨 | D10 |

## インストール済みスキル

| スキル | パス |
|--------|------|
| content-research-writer | `~/.openclaw/workspace/skills/content-research-writer/SKILL.md` |

## 未インストール（優先度順）

| スキル | 用途 | インストール |
|--------|------|-------------|
| coding-agent | コード書き + PR 作成 | `npx clawhub@latest install coding-agent` |
| skill-creator | カスタムスキル作成 | `npx clawhub@latest install skill-creator` |
| gitclaw | workspace 自動バックアップ | `npx clawhub@latest install gitclaw` |
| slack | Slack 高度な制御 | `npx clawhub@latest install slack` |
| system-monitor | CPU/RAM/ディスク監視 | `npx clawhub@latest install system-monitor` |
| ~~bird~~ | ~~Twitter/X 読み書き~~ | **使用禁止**: Cookie認証 = BAN リスク。公式 OAuth 2.0 を使う |
| xcodebuildmcp | Xcode ビルド自動化 | `npx clawhub@latest install xcodebuildmcp` |

## Slack チャンネル

| チャンネル | ID |
|-----------|-----|
| #metrics | C091G3PKHL2 |
| #ai | C08RZ98SBUL |
| #meeting | C03HRM5V5PD |

## Cron ジョブ

| ジョブ | スケジュール | 送信先 |
|--------|------------|--------|
| daily-metrics-reporter | 05:00 JST 毎日 | #metrics |
| Lab Meeting Reminder (日曜) | 09:00 JST 日曜 | #meeting |
| Lab Meeting Reminder (月曜) | 09:00 JST 月曜 | #meeting |

## 環境変数（~/.env）

| 変数 | 用途 | 状態 |
|------|------|------|
| OPENAI_API_KEY | GPT-4o | 設定済み |
| REVENUECAT_V2_SECRET_KEY | メトリクス | 設定済み |
| MIXPANEL_API_SECRET | メトリクス | 設定済み |
| MIXPANEL_PROJECT_ID | 3970220 | 設定済み |
| SLACK_BOT_TOKEN | Slack | 設定済み |
| SLACK_APP_TOKEN | Socket Mode | 設定済み |
| ASC_KEY_ID | App Store Connect | 設定済み |
| ASC_ISSUER_ID | App Store Connect | 設定済み |
| EXA_API_KEY | Exa 検索 | 設定済み |
| BRAVE_API_KEY | Web 検索 | .env にはあるが openclaw.json に未設定 |

## 参考リンク

| リソース | URL |
|---------|-----|
| OpenClaw Docs | https://docs.openclaw.ai |
| ClawHub スキル | https://clawhub.ai |
| awesome-openclaw-skills | https://github.com/VoltAgent/awesome-openclaw-skills |
| MoltBook | https://moltbook.com |
| OpenClaw Security | https://docs.openclaw.ai/gateway/security |
| Gmail PubSub | https://docs.openclaw.ai/automation/gmail-pubsub |
| Heartbeat | https://docs.openclaw.ai/gateway/heartbeat |
| OpenClaw Memory | https://docs.openclaw.ai/concepts/memory |
| OpenClaw Hooks | https://docs.openclaw.ai/hooks |
| OpenClaw Sandboxing | https://docs.openclaw.ai/gateway/sandboxing |
