# 実装仕様書: Anicca in the World (1.6.1)

> **RFC 2119 準拠**: MUST, SHOULD, MAY を使用
> **最終更新**: 2026-02-03 09:15 JST

---

## 0. 用語定義

| キーワード | 意味 |
|-----------|------|
| **MUST** | 絶対的な要件。違反は不可 |
| **MUST NOT** | 絶対的な禁止 |
| **SHOULD** | 強く推奨。例外は正当な理由が必要 |
| **MAY** | 任意 |

---

## 1. As-Is（現在の状態: 2026-02-03 09:15 JST）

### 1.1 Railway API（✅ 完了）

| 項目 | 状態 | ファイル |
|------|------|----------|
| `/api/agent/nudge` | ✅ 実装済み | `apps/api/src/routes/agent/nudge.js` |
| `/api/agent/wisdom` | ✅ 実装済み | `apps/api/src/routes/agent/wisdom.js` |
| `/api/agent/feedback` | ✅ 実装済み | `apps/api/src/routes/agent/feedback.js` |
| `/api/agent/content` | ✅ 実装済み | `apps/api/src/routes/agent/content.js` |
| `/api/agent/deletion` | ✅ 実装済み | `apps/api/src/routes/agent/deletion.js` |
| `/api/agent/posts/recent` | ❌ 未実装 | 新規作成必要 |
| `requireAgentAuth` | ✅ 実装済み | `apps/api/src/middleware/requireAgentAuth.js` |
| `AgentPost` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| `AgentAuditLog` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| 5ch Z-Score | ✅ 実装済み | `apps/api/src/agents/crossPlatformLearning.js` |
| 90日匿名化ジョブ | ✅ 実装済み | `apps/api/src/jobs/anonymizeAgentPosts.js` |
| テスト | ✅ 196/196 通過 | `apps/api/src/**/__tests__/*.test.js` |

### 1.2 Railway 環境変数

| 変数 | Production | Staging |
|------|------------|---------|
| `ANICCA_AGENT_TOKEN` | ✅ 設定済み | ❌ **未設定** |

### 1.3 Hetzner VPS（✅ セットアップ済み）

| 項目 | 状態 | 値 |
|------|------|-----|
| サーバー名 | ✅ | `ubuntu-4gb-nbg1-7` |
| IPv4 | ✅ | `46.225.70.241` |
| OS | ✅ | Ubuntu 24.04 (ARM64) |
| ufw | ✅ 有効 | 22/tcp のみ許可 |
| fail2ban | ✅ 稼働中 | active |
| Node.js | ✅ | v22.22.0 |
| anicca ユーザー | ✅ 作成済み | sudo 権限あり |

### 1.4 OpenClaw（✅ 稼働中）

| 項目 | 状態 | 詳細 |
|------|------|------|
| OpenClaw | ✅ インストール済み | v2026.2.1 |
| systemd | ✅ active | `openclaw.service` |
| SOUL.md | ✅ 配置済み | `/home/anicca/openclaw/SOUL.md` |
| 環境変数 | ✅ 設定済み | `/home/anicca/.env` |

### 1.5 Skills（✅ 配置済み）

| Skill | 状態 | 役割 |
|-------|------|------|
| moltbook-responder | ✅ 配置済み | 苦しみ投稿検出 → Nudge 返信 |
| slack-reminder | ✅ 配置済み | 月曜12:30 #meeting にリマインダー |
| feedback-fetch | ✅ 配置済み | upvotes 収集 → Railway API |

### 1.6 Moltbook（✅ 認証完了）

| 項目 | 状態 | 詳細 |
|------|------|------|
| エージェント登録 | ✅ 完了 | `anicca-wisdom` |
| **claim** | ✅ **完了** | 2026-02-03 ユーザー認証済み |
| API Key | ✅ VPS 保存済み | `moltbook_sk_...` |
| s/sangha Submolt | ❌ **未作成** | claim 後に作成可能 |

### 1.7 Slack

| 項目 | 状態 | 詳細 |
|------|------|------|
| SLACK_BOT_TOKEN | ✅ VPS 保存済み | `/home/anicca/.env` |
| 通知先チャンネル | **#meeting** | ラボミーティングリマインダー用 |

---

## 2. To-Be（完成状態）

### 2.1 実現する体験

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ユーザーの苦しみが軽減される流れ                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Moltbook で「つらい」と投稿]                                            │
│           │                                                              │
│           ↓ (5分以内)                                                    │
│  [Anicca が苦しみを検出]                                                  │
│           │                                                              │
│           ↓                                                              │
│  [Railway API で Nudge 生成]                                             │
│   - LLM が文脈を理解                                                     │
│   - SOUL.md のペルソナで応答                                              │
│   - 危機検出時は地域別リソース提供                                         │
│           │                                                              │
│           ↓                                                              │
│  [Moltbook にコメントで返信]                                              │
│   「今は本当につらいんだね。その気持ち、否定しなくていいんだよ...」           │
│           │                                                              │
│           ↓                                                              │
│  [ユーザーが少しだけ楽になる]                                              │
│   - 誰かが聞いてくれた                                                    │
│   - 責められなかった                                                      │
│   - 次の一歩のヒントをもらえた                                            │
│           │                                                              │
│           ↓                                                              │
│  [upvotes / 反応を収集]                                                   │
│           │                                                              │
│           ↓                                                              │
│  [Z-Score 計算 → hook_candidates に昇格]                                  │
│           │                                                              │
│           ↓                                                              │
│  [高評価 Nudge がアプリ内にも展開]                                         │
│   → より多くの人の苦しみが軽減される                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 完成基準

| # | 基準 | 検証方法 | 状態 |
|---|------|---------|------|
| 1 | OpenClaw が VPS で 24/7 稼働 | `systemctl status openclaw` → active | ✅ |
| 2 | Moltbook にエージェント登録・認証済み | プロフィールページアクセス可能 | ✅ |
| 3 | s/sangha Submolt 作成済み | `moltbook.com/s/sangha` アクセス可能 | ❌ |
| 4 | moltbook-responder が苦しみ投稿に返信 | テスト投稿 → 5分以内に返信 | ❌ |
| 5 | slack-reminder が月曜12:30に #meeting に通知 | 手動テスト or 月曜待機 | ❌ |
| 6 | feedback-fetch が upvotes を収集 | DB の `agent_posts.upvotes` が更新 | ❌ |
| 7 | Railway Staging にも ANICCA_AGENT_TOKEN 設定 | 環境変数確認 | ❌ |

---

## 3. 残りタスク

| # | タスク | 意図 | 状態 |
|---|--------|------|------|
| 1 | **Railway Staging に ANICCA_AGENT_TOKEN 設定** | Staging 環境でもテスト可能にする | ❌ |
| 2 | **s/sangha Submolt 作成** | 苦しみを共有する安全な場所を作る | ❌ |
| 3 | **VPS slack-reminder の通知先を #meeting に変更** | 正しいチャンネルに通知する | ❌ |
| 4 | **GET /api/agent/posts/recent 実装** | feedback-fetch が最近の投稿を取得できるようにする | ❌ |
| 5 | **動作確認テスト** | 全体フローが動作することを確認 | ❌ |
| 6 | **Codex レビュー** | To-Be 実現に不足がないか確認 | ❌ |
| 7 | **dev マージ** | 本番デプロイ準備 | ❌ |

---

## 4. 実装方針（意図の説明）

### 4.1 moltbook-responder

**意図:** Moltbook で苦しんでいる人を見つけ、押し付けがましくない形で寄り添う

**実装方針:**
- 5分間隔でポーリング（リアルタイム性と負荷のバランス）
- オプトイン/召喚型のみ対応（@anicca メンション、s/sangha 投稿、フォロワー）
- 苦しみキーワードで検出（SOUL.md の suffering_keywords）
- 危機検出時は地域別リソース（いのちの電話等）を含める
- 1日10件まで（スパム防止）

### 4.2 slack-reminder

**意図:** ラボミーティングを忘れないようにリマインドする

**実装方針:**
- 月曜12:30 JST（12:00の30分前）
- 日本の祝日はスキップ
- 通知先: **#meeting**

### 4.3 feedback-fetch

**意図:** Nudge の効果を測定し、より良い Nudge を学習する

**実装方針:**
- 30分間隔で upvotes を収集
- Railway API `/api/agent/posts/recent` から最近の投稿を取得
- 各投稿の Moltbook upvotes を取得して `/api/agent/feedback` に送信
- Z-Score 計算 → 高評価は hook_candidates に昇格

### 4.4 GET /api/agent/posts/recent

**意図:** feedback-fetch が最近の投稿を取得できるようにする

**実装方針:**
- 過去7日間の agent_posts を返す
- platform: moltbook, slack のみ
- id, platform, externalPostId, createdAt を返す

---

## 5. Slack 通知チャンネル

| 用途 | チャンネル |
|------|-----------|
| ラボミーティングリマインダー | **#meeting** |
| 危機検出・緊急停止・監査 | #agents |

---

## 6. 完了チェックリスト

| # | タスク | 実行者 | 状態 |
|---|--------|--------|------|
| 1 | Railway Production `ANICCA_AGENT_TOKEN` 設定 | エージェント | ✅ |
| 2 | Railway Staging `ANICCA_AGENT_TOKEN` 設定 | エージェント | ❌ |
| 3 | VPS ufw/fail2ban 設定 | エージェント | ✅ |
| 4 | VPS Node.js インストール | エージェント | ✅ |
| 5 | OpenClaw インストール | エージェント | ✅ |
| 6 | SOUL.md 配置 | エージェント | ✅ |
| 7 | 環境変数設定 | エージェント | ✅ |
| 8 | systemd サービス設定・起動 | エージェント | ✅ |
| 9 | Moltbook エージェント登録 | エージェント | ✅ (`anicca-wisdom`) |
| 10 | **Moltbook claim** | **ユーザー** | ✅ **完了** |
| 11 | s/sangha Submolt 作成 | エージェント | ❌ |
| 12 | moltbook-responder Skill 配置 | エージェント | ✅ |
| 13 | slack-reminder Skill 配置 | エージェント | ✅ |
| 14 | slack-reminder 通知先を #meeting に変更 | エージェント | ❌ |
| 15 | feedback-fetch Skill 配置 | エージェント | ✅ |
| 16 | GET /api/agent/posts/recent 実装 | エージェント | ❌ |
| 17 | 動作確認テスト | エージェント | ❌ |
| 18 | Codex レビュー（To-Be 実現に不足がないか） | エージェント | ❌ |
| 19 | dev マージ | ユーザー承認後 | ❌ |

---

## 7. 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成 |
| 2026-02-03 | Railway API 完了、実装状況追加 |
| 2026-02-03 | As-Is / To-Be 形式に完全書き換え |
| 2026-02-03 09:15 | VPS セットアップ完了、OpenClaw 稼働中、Moltbook claim 完了、Slack 通知先を #meeting に変更 |
