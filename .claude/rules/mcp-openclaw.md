# MCP & OpenClaw 運用ルール

## MCP プロジェクトID

| サービス | ID | 用途 |
|---------|---|------|
| **Mixpanel** | `3970220` (integer) | 分析クエリ |
| **RevenueCat** | `projbb7b9d1b` (string) | 課金・Offering管理 |

## Mixpanel MCP

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

## RevenueCat MCP

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

## 正しいデータソース

| 目的 | 使うイベント | ソース |
|-----|------------|-------|
| トライアル開始数 | `rc_trial_started_event` | RevenueCat→Mixpanel（正確） |
| Paywall表示数 | `onboarding_paywall_viewed` | iOS SDK |

**注意:** `onboarding_paywall_purchased`は使わない（DEBUG/サンドボックス含む）

## Slack Tokens（OpenClaw/Anicca用）

**シークレットは `.env` ファイルに保存済み（gitignored）:**
- `SLACK_BOT_TOKEN` - Anicca Bot Token
- `SLACK_APP_TOKEN` - Socket Mode Token

## OpenClaw（Anicca）— VPS 稼働中

**現状（2026-02-06）:**
- Gateway: VPS (46.225.70.241) で24時間稼働中
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
