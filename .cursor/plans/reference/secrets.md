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

## Blotato アカウント

| プラットフォーム | アカウント | Blotato Account ID |
|-----------------|-----------|-------------------|
| TikTok EN | @anicca.self | 28152 |

## 新しい Secret の登録方法（エージェント向け）

```bash
# 1つずつ登録
echo "VALUE" | gh secret set SECRET_NAME --repo Daisuke134/anicca.ai

# 確認
gh secret list --repo Daisuke134/anicca.ai
```
