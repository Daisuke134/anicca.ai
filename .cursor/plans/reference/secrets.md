# API Key & Secret 管理（絶対ルール）

## 原則: ユーザーにGUI操作を頼むな。エージェントが全部やれ。

| ルール | 詳細 |
|--------|------|
| **GitHub Secrets 登録** | `gh secret set NAME --repo Daisuke134/anicca.ai` で CLI から登録。GUI は使わない |
| **Railway 環境変数** | Railway Dashboard で確認（CLI 未導入のため）。値が必要な場合は下記リストを参照 |
| **API Key をユーザーに聞くな** | 下記リストに全て記録済み。新しいキーが必要な場合のみユーザーに取得を依頼 |
| **セキュリティ** | API Key は CLAUDE.md に**名前と用途のみ**記載。値は GitHub Secrets / Railway に保存済み |

## GitHub Actions Secrets（Daisuke134/anicca.ai）

| Secret Name | 用途 | 登録済み |
|-------------|------|---------|
| `OPENAI_API_KEY` | LLM（Nudge生成、TikTokエージェント、Vision） | Yes |
| `BLOTATO_API_KEY` | TikTok投稿（Blotato API） | Yes |
| `FAL_API_KEY` | 画像生成（Fal.ai） | Yes |
| `EXA_API_KEY` | トレンド検索（Exa） | Yes |
| `APIFY_API_TOKEN` | TikTokメトリクス取得（Apify） | Yes |
| `API_AUTH_TOKEN` | Railway API 認証（= Railway の INTERNAL_API_TOKEN） | Yes |
| `API_BASE_URL` | Railway Production URL | Yes |
| `APPLE_APP_SPECIFIC_PASSWORD` | App Store提出 | Yes |
| `APPLE_ID` | App Store提出 | Yes |
| `APPLE_TEAM_ID` | App Store提出 | Yes |
| `ASC_KEY_ID` | ASC API Key ID（`D637C7RGFN`） | Yes |
| `ASC_ISSUER_ID` | ASC API Issuer ID | Yes |
| `ASC_PRIVATE_KEY` | ASC API .p8 秘密鍵（`AuthKey_D637C7RGFN.p8` の中身） | Yes |
| `ASC_VENDOR_NUMBER` | ASC Sales Reports 用ベンダー番号（`93486075`） | Yes |
| `REVENUECAT_V2_SECRET_KEY` | RevenueCat API v2 シークレットキー | Yes |
| `SLACK_METRICS_WEBHOOK_URL` | Slack #agents チャンネル Webhook URL | Yes |

## Railway 環境変数（主要なもの）

| 変数名 | 用途 |
|--------|------|
| `DATABASE_URL` | PostgreSQL接続 |
| `OPENAI_API_KEY` | Nudge生成 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 補助サービス |
| `REVENUECAT_*` | 決済連携 |
| `APNS_*` | プッシュ通知 |

**注意**: `INTERNAL_API_TOKEN` は Railway に設定済み。TikTok エージェント（GitHub Actions）が Railway API を叩く際の認証に使用。GitHub Secrets の `API_AUTH_TOKEN` と同じ値。

## Railway URL

| 環境 | URL |
|------|-----|
| Staging | `anicca-proxy-staging.up.railway.app` |
| Production | `anicca-proxy-production.up.railway.app` |

**注意**: `anicca-api-production` ではない。`anicca-proxy-production` が正しいURL。

## Railway DB Proxy URL

ローカルからRailway DBに接続する場合（Prismaマイグレーション等）:

```
# Production
postgresql://postgres:***@tramway.proxy.rlwy.net:32477/railway

# Staging
postgresql://postgres:***@ballast.proxy.rlwy.net:51992/railway
```

**詳細**: `apps/api/.env.proxy` に保存済み（gitignored）

## Railway トラブルシューティング

| 問題 | 原因 | 解決 |
|------|------|------|
| **P3005: database schema not empty** | 既存DBにPrismaベースラインがない | `DATABASE_URL="..." npx prisma migrate resolve --applied <migration>` |
| **pushしたのにRailwayが古いまま** | キャッシュまたはデプロイ未トリガー | `git commit --allow-empty -m "trigger redeploy" && git push` |
| **502 Bad Gateway** | デプロイ中 or サーバークラッシュ | Railway Dashboard でログ確認 |
| **railway run が internal hostに接続** | 内部URLはRailway内からのみアクセス可 | Proxy URL（上記）を使う |

## 本番デプロイ前チェックリスト

mainマージ前に必ず確認:

| # | 項目 | コマンド |
|---|------|---------|
| 1 | GHA secrets確認 | `gh secret list -R Daisuke134/anicca.ai` |
| 2 | API_BASE_URL確認 | `anicca-proxy-production` になっているか |
| 3 | Prismaマイグレーション | 既存DBなら `migrate resolve --applied` |
| 4 | 3並列サブエージェントレビュー | Python Agent, Backend API, DB Schema |

## GitHub Actions Variables（Daisuke134/anicca.ai）

| Variable Name | 値 | 用途 |
|---------------|-----|------|
| `BLOTATO_ACCOUNT_ID_EN` | `29171` | TikTok EN カード投稿 |
| `BLOTATO_ACCOUNT_ID_JA` | `29172` | TikTok JA カード投稿 |

## VPS (Hetzner) — OpenClaw 稼働環境

| 項目 | 値 |
|------|-----|
| **サーバー名** | `ubuntu-4gb-nbg1-7` |
| **IPv4** | `46.225.70.241` |
| **IPv6** | `2a01:4f8:1c19:985d::/64` |
| **SSH コマンド** | `ssh anicca@46.225.70.241`（または `root@`） |
| **OpenClaw バージョン** | 2026.2.3-1 |
| **OpenClaw 状態** | 🟢 **稼働中**（systemd user service + lingering） |
| **Profile** | `full`（全ツール有効） |

### VPS 環境変数（/home/anicca/.env）— ✅ 設定済み

| 変数名 | 用途 | 状態 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenClaw GPT-4o | ✅ |
| `REVENUECAT_V2_SECRET_KEY` | メトリクス取得 | ✅ |
| `MIXPANEL_API_SECRET` | メトリクス取得 | ✅ |
| `MIXPANEL_PROJECT_ID` | 3970220 | ✅ |
| `SLACK_BOT_TOKEN` | Slack 接続 | ✅ |
| `SLACK_APP_TOKEN` | Slack Socket Mode | ✅ |
| `ASC_KEY_ID` | App Store Connect | ✅ |
| `ASC_ISSUER_ID` | App Store Connect | ✅ |
| `EXA_API_KEY` | Web検索（Exa） | ✅ |

### VPS 確認コマンド

```bash
# SSH 接続
ssh anicca@46.225.70.241

# Gateway 状態確認（anicca ユーザーで実行）
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user status openclaw-gateway

# Gateway 再起動（設定変更後のみ）
systemctl --user restart openclaw-gateway

# ログ確認
journalctl --user -u openclaw-gateway -n 50
```

---

## OpenClaw / Slack 設定

| 項目 | 値 |
|------|-----|
| **Gateway Port** | 18789 |
| **Config** | `~/.openclaw/openclaw.json` |
| **Cron Jobs** | `~/.openclaw/cron/jobs.json` |
| **Logs** | `~/.openclaw/logs/` |
| **groupPolicy** | `open`（全チャンネル許可） |

### Slack チャンネル ID

| チャンネル | ID |
|-----------|-----|
| #metrics | C091G3PKHL2 |
| #ai | C08RZ98SBUL |
| #meeting | C03HRM5V5PD |

### Slack Tokens

| Token | 保存場所 |
|-------|---------|
| `SLACK_BOT_TOKEN` | `~/.openclaw/openclaw.json` / VPS `.env` |
| `SLACK_APP_TOKEN` | `~/.openclaw/openclaw.json` / VPS `.env` |

---

## Blotato アカウント

| プラットフォーム | アカウント | Blotato Account ID | 用途 |
|-----------------|-----------|-------------------|------|
| TikTok EN（動画） | @anicca.self | 28152 | AI動画投稿 |
| TikTok EN（カード） | @anicca122 | 29171 | NudgeCard投稿 |
| TikTok JA（カード） | @anicca.jp2 | 29172 | NudgeCard投稿 |

## 新しい Secret の登録方法（エージェント向け）

```bash
# 1つずつ登録
echo "VALUE" | gh secret set SECRET_NAME --repo Daisuke134/anicca.ai

# 確認
gh secret list --repo Daisuke134/anicca.ai
```
