# 1.6.1 Secrets（絶対ルール: これを見ろ、俺に聞くな）

> **重要:** API キーやトークンはこのファイルにハードコードしない。
> ローカルの `.env` ファイルに保存し、ここには参照情報のみ記載する。

## VPS (Hetzner)

| 項目 | 値 |
|------|-----|
| **サーバー名** | `ubuntu-4gb-nbg1-7` |
| **IPv4** | `46.225.70.241` |
| **IPv6** | `2a01:4f8:1c19:985d::/64` |
| **SSH ユーザー** | `root`（初期）→ `anicca`（作成後） |
| **SSH コマンド** | `ssh root@46.225.70.241` |

## Slack

| 項目 | 取得元 |
|------|--------|
| **SLACK_BOT_TOKEN** | VPS `/home/anicca/.env` に設定済み |
| **SLACK_WEBHOOK_AGENTS** | GitHub Secrets `SLACK_METRICS_WEBHOOK_URL` |

## Railway

| 項目 | 値 |
|------|-----|
| **Production URL** | `https://anicca-proxy-production.up.railway.app` |
| **Staging URL** | `https://anicca-proxy-staging.up.railway.app` |
| **ANICCA_AGENT_TOKEN** | Railway MCP で生成・設定する |

## Moltbook

| 項目 | 値 |
|------|-----|
| **MOLTBOOK_API_KEY** | エージェントが登録時に取得して VPS `.env` に保存 |
| **Agent 名** | `anicca` |
| **Submolt** | `s/sangha` |

---

**ルール:**
- この情報を俺に聞くな
- GUI 操作を俺にさせるな
- 全て MCP / CLI / API で自動化しろ
- **API キー・トークンは `.env` に保存、Git にコミットしない**
