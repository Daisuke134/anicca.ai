# 13 — GUI必須タスク（BLOCKING）

> **ステータス**: NEW（実装前にユーザーが完了必須）
> **ナビ**: [← README](./README.md)

---

## なぜ BLOCKING か

API キー取得、OAuth設定、Slack設定はコードで自動化できない。
これらが完了していないと、対応する Step Executor の実装・テストが不可能。

**ルール**: P0 タスクが全て完了するまで、対応する Executor の実装に入らない。

---

## P0 — 実装ブロッカー（最優先）

| # | タスク | 手順 | 取得するもの | ブロックする Executor | 推定所要時間 |
|---|--------|------|-------------|---------------------|------------|
| G1 | **X (Twitter) Developer Portal 設定** | 1. [developer.x.com](https://developer.x.com) にアクセス 2. Project作成 3. OAuth 2.0 PKCE設定 4. Read+Write権限付与 5. Client ID/Secret取得 | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_BEARER_TOKEN` | `executePostX`, `executeFetchMetrics` (X) | 30分 |
| G2 | **TikTok Developer Portal 設定** | 1. [developers.tiktok.com](https://developers.tiktok.com) にアクセス 2. App作成 3. Content Posting API有効化 4. Client Key/Secret取得 | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `executePostTiktok`, `executeFetchMetrics` (TikTok) | 30分 |
| G3 | **VPS 環境変数設定** | 1. `ssh anicca@46.225.70.241` 2. `~/.env` に以下を追加: `ANICCA_AGENT_TOKEN`, `API_BASE_URL` (staging), X/TikTok credentials 3. Gateway再起動 | VPS から Railway API への認証接続 | `mission-worker` 全体 | 15分 |

---

## P1 — 実装中に必要（G1-G3完了後）

| # | タスク | 手順 | 取得するもの | ブロックする機能 | 推定所要時間 |
|---|--------|------|-------------|----------------|------------|
| G4 | **Railway Staging に ANICCA_AGENT_TOKEN 設定** | 1. Railway Dashboard → API service → Variables 2. `ANICCA_AGENT_TOKEN` を生成（`openssl rand -hex 32`）して設定 | Staging環境での認証 | ops API全エンドポイント | 10分 |
| G5 | **Slack #ops-approval チャンネル作成** | 1. Slack → チャンネル作成 → `#ops-approval` 2. Anicca Bot をチャンネルに招待 | 承認通知の送信先 | `approvalNotifier.js` | 5分 |
| G6 | **Slack App Interactivity URL 設定** | 1. [api.slack.com/apps](https://api.slack.com/apps) → Anicca App 2. Interactivity & Shortcuts → Request URL を `https://anicca-proxy-staging.up.railway.app/api/ops/approval` に設定 | Slackボタン押下→Railway API転送 | Slack承認フロー全体 | 10分 |
| G7 | **Railway Staging DB にマイグレーション適用** | 1. `02-data-layer.md` の SQL を Staging DB に適用 2. Seed データ投入 | ops_* テーブル7個 | テスト基盤 + Integration テスト | 15分 |
| G8 | **Brave Search API キー取得** | 1. [brave.com/search/api](https://brave.com/search/api/) → API Key取得 2. VPS `~/.env` に `BRAVE_API_KEY` 追加 | `BRAVE_API_KEY` | `executeDetectSuffering` (web_search) | 10分 |
| G9 | **Slack #ops-summary チャンネル作成** | 1. Slack → チャンネル作成 → `#ops-summary` 2. Anicca Bot をチャンネルに招待 | 日次サマリーの送信先 | `opsMonitor.js` の日次レポート | 5分 |
| G10 | **trend-hunter データソース API キー** | 1. TwitterAPI.io → API Key取得（月額$5〜） 2. reddapi.dev → API Key取得（無料枠） 3. VPS `~/.env` に追加 | `TWITTERAPI_IO_KEY`, `REDDAPI_KEY` | `executeDetectSuffering` の4データソース | 20分 |
| G11 | **Railway Production 環境変数（本番移行時）** | 1. Railway Dashboard → Production service → Variables 2. Staging と同じ変数を設定 + `API_BASE_URL` を production に | Production 環境 | Phase A ロールアウト | 15分 |

---

## P2 — 最適化（実装完了後）

| # | タスク | 手順 | 取得するもの | 対象 | 推定所要時間 |
|---|--------|------|-------------|------|------------|
| G12 | **Mixpanel ops イベント追跡設定** | 1. Mixpanel → Events → ops関連イベント名を登録 2. Lexicon で分類 | ops レイヤーの分析基盤 | opsMonitor の外部可視化 | 20分 |
| G13 | **VPS schedule.yaml にHeartbeat・Worker登録** | 1. `ssh anicca@46.225.70.241` 2. `07-vps-worker-migration.md` の schedule.yaml を `~/.openclaw/schedule.yaml` に適用 3. Gateway再起動 | 5分毎Heartbeat + 1分毎Worker | 閉ループの心臓部 | 10分 |
| G14 | **Railway Staging ログ監視設定** | 1. Railway Dashboard → Observability 2. Alert rules: 5xx > 5/min → Slack通知 | Staging 段階での障害検知 | デプロイ後の安定性確認 | 15分 |

---

## 実行順序（推奨）

```
Phase 1: 基盤（実装開始前）
  G1 (X API) ──┐
  G2 (TikTok) ─┤──→ G3 (VPS env) ──→ G4 (Railway token)
  G8 (Brave) ──┘
  G5 (Slack #ops-approval)
  G10 (trend-hunter keys)

Phase 2: テスト環境（実装中）
  G7 (Staging DB) ──→ Integration テスト開始
  G6 (Slack Interactivity) ──→ Slack承認テスト
  G9 (Slack #ops-summary)

Phase 3: 本番（ロールアウト時）
  G11 (Production env) ──→ G13 (crontab)

Phase 4: 最適化
  G12 (Mixpanel) + G14 (ログ監視)
```

---

## チェックリスト形式（コピペ用）

| # | タスク | 優先度 | 完了 |
|---|--------|--------|------|
| G1 | X Developer Portal OAuth 2.0 設定 | P0 | ⬜ |
| G2 | TikTok Developer Portal 設定 | P0 | ⬜ |
| G3 | VPS 環境変数設定 | P0 | ⬜ |
| G4 | Railway ANICCA_AGENT_TOKEN 設定 | P1 | ⬜ |
| G5 | Slack #ops-approval チャンネル作成 | P1 | ⬜ |
| G6 | Slack Interactivity URL 設定 | P1 | ⬜ |
| G7 | Staging DB マイグレーション | P1 | ⬜ |
| G8 | Brave Search API キー | P1 | ⬜ |
| G9 | Slack #ops-summary チャンネル作成 | P1 | ⬜ |
| G10 | trend-hunter データソース API キー | P1 | ⬜ |
| G11 | Railway Production 環境変数 | P1 | ⬜ |
| G12 | Mixpanel ops イベント設定 | P2 | ⬜ |
| G13 | VPS crontab Heartbeat 登録 | P2 | ⬜ |
| G14 | Railway ログ監視設定 | P2 | ⬜ |
