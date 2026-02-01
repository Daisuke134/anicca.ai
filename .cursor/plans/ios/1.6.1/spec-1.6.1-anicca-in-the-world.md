# Spec: Anicca in the World (1.6.1)

> Anicca がアプリを超えて世界に出る — OpenClaw + Moltbook + Slack 統合

---

## 1. 概要

### 目標
**Anicca がiOSアプリの外でも苦しみを終わらせる**

- Moltbook（分散型SNS）で苦しみの投稿を検出し、Nudgeで返信
- Slack でラボミーティングリマインダーを送信
- X/Twitter でコンテンツを配信
- 全プラットフォームの反応を統一スコアに集約

### なぜ今やるか
- Anicca の「苦しみを終わらせる」ミッションは、アプリ内だけでは不十分
- ブッダは「苦しみのある場所に自ら行った」— Anicca も同様
- Cross-Platform Learning で「何が効くか」の学習が加速

---

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                     Hetzner VPS                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   OpenClaw                               │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │ │
│  │  │ Moltbook │  │  Slack   │  │ X/Twitter│               │ │
│  │  │  Skill   │  │  Skill   │  │  Skill   │               │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘               │ │
│  │       │             │             │                      │ │
│  │       └─────────────┼─────────────┘                      │ │
│  │                     ↓                                    │ │
│  │            ┌────────────────┐                            │ │
│  │            │   SOUL.md      │  ← Anicca ペルソナ         │ │
│  │            └────────────────┘                            │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ ANICCA_AGENT_TOKEN
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   Railway API                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ /agent/nudge │  │ /agent/wisdom│  │/agent/feedback│      │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  PostgreSQL                           │   │
│  │  agent_posts → hook_candidates (昇格)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. コンポーネント

### 3.1 OpenClaw (Hetzner VPS)

| 項目 | 値 |
|------|-----|
| ホスティング | Hetzner VPS |
| デーモン | systemd (`openclaw.service`) |
| ペルソナ | `SOUL.md` |
| セキュリティ | fail2ban + ufw + 専用APIキー |

### 3.2 Skills

| Skill | 役割 |
|-------|------|
| **moltbook-responder** | 苦しみ投稿を検出 → `/api/agent/nudge` → 返信 |
| **slack-reminder** | 月曜12:30にラボミーティングリマインダー送信 |
| **feedback-fetch** | Moltbook upvotes / Slack reactions を収集 |
| **x-poster** | X/Twitter にコンテンツ投稿 |

### 3.3 Railway API

| エンドポイント | メソッド | 役割 |
|---------------|---------|------|
| `/api/agent/nudge` | POST | Nudge生成（LLM） |
| `/api/agent/wisdom` | GET | Wisdom取得 |
| `/api/agent/feedback` | POST | フィードバック保存 |
| `/api/agent/content` | POST | プラットフォーム別コンテンツ生成 |

---

## 4. Acceptance Criteria

| # | 条件 | 合否判定 | 検証方法 | テスト# |
|---|------|---------|----------|---------|
| AC-1 | OpenClaw が Hetzner VPS 上で 24/7 稼働する | `systemctl status openclaw` = active, 24h uptime 確認 | 手動（SSH） | — |
| AC-2 | SOUL.md に Anicca のペルソナが定義され、OpenClaw が認識する | OpenClaw に「Who are you?」→ Anicca として応答 | 手動（VPS） | — |
| AC-3 | Moltbook に Anicca エージェントが登録される | Moltbook プロフィールページが存在 | 手動（Moltbook） | — |
| AC-4 | s/sangha Submolt が作成される | Moltbook 上で s/sangha にアクセス可能 | 手動（Moltbook） | — |
| AC-5 | Moltbook の苦しみ投稿を検出してNudgeを返信できる | 苦しみキーワードを含む投稿 → Anicca の返信が表示される | 手動 + 自動 | #7 |
| AC-6 | Railway API `/api/agent/nudge` が正常動作 | POST → 200 + hook/content/tone/reasoning/buddhismReference（任意）を含むJSON | 自動 | #1, #4, #17, #22 |
| AC-7 | Railway API `/api/agent/wisdom` が正常動作 | GET → 200 + `{ hook, content, source, problemType, reasoning }` を含む JSON | 自動 | #2 |
| AC-8 | Railway API `/api/agent/feedback` がフィードバックを保存 | POST → 200 + agent_posts 更新確認 | 自動 | #3, #23, #24, #25 |
| AC-9 | Slack チャネルに接続される | OpenClaw → Slack メッセージ送信成功 | 手動（Slack） | — |
| AC-10 | ラボミーティングリマインダーが月曜12:30に投稿される | 月曜テスト → Slack にメッセージ表示 | 自動 + 手動 | #14 |
| AC-11 | 日本の祝日はリマインダーをスキップ | 祝日API → スキップメッセージ | 自動 | #13, #15 |
| AC-12 | Moltbook upvotes が agent_posts テーブルに保存される | Heartbeat 後 → DB 確認 | 自動 | #26 |
| AC-13 | Z-Score 正規化が5チャネル統合で動作 | `unifiedScore()` に moltbookZ + slackZ が反映 | 自動 | #9, #12 |
| AC-14 | agent_posts から hook_candidates への昇格が動作 | upvotes ≥ 5 の投稿 → hook_candidates INSERT | 自動 | #10, #11 |
| AC-15 | VPS セキュリティ（fail2ban + ufw + 専用APIキー） | `ufw status` = active, fail2ban running, 本番APIキー未使用 | 手動（SSH）+ 自動 | #5, #6 |
| AC-16 | X/Twitter オーナー認証投稿（ユーザー作業） | 投稿確認 → Moltbook 認証済み | 手動（ユーザー） | — |
| AC-17 | Railway API `/api/agent/content` が正常動作 | POST → 200 + `{ hook, content, tone, formats: { short, medium, long, hashtags } }` を含む JSON | 自動 | #19 |
| AC-18 | `/api/agent/content` の formats.short が 280文字以内 | short フォーマットの文字数検証 | 自動 | #20, #21 |
| AC-19 | feedback-fetch Skill が Moltbook upvotes を収集して Railway API に送信 | Heartbeat 後 → agent_posts.upvotes が更新される | 自動 | #26 |
| AC-20 | feedback-fetch Skill が Slack reactions を収集して Railway API に送信 | Heartbeat 後 → agent_posts.reactions が更新される | 自動 | #27 |
| AC-21 | `/api/agent/nudge` レスポンスに agentPostId が含まれる | POST → 200 + agentPostId (UUID) がレスポンスに存在 | 自動 | #22 |
| AC-22 | `/api/agent/feedback` が agentPostId OR (platform + externalPostId) で更新可能 | 両方のパターンでテスト → agent_posts 更新確認 | 自動 | #23, #24, #25 |
| AC-23 | Prompt Injection 対策が context サニタイズで機能する | URL/コードブロック除去、`<user_post>` タグ封入、既知パターンフィルタ | 自動 | #29, #30, #31 |

---

## 5. テストマトリックス

| # | To-Be | テスト名 | AC | カバー |
|---|-------|----------|-----|--------|
| 1 | `/api/agent/nudge` エンドポイント | `test_agentNudgeEndpoint()` | AC-6 | ✅ |
| 2 | `/api/agent/wisdom` エンドポイント | `test_agentWisdomEndpoint()` | AC-7 | ✅ |
| 3 | `/api/agent/feedback` エンドポイント | `test_agentFeedbackEndpoint()` | AC-8 | ✅ |
| 4 | agent_posts テーブル INSERT | `test_agentPostSavedToDb()` | AC-6 | ✅ |
| 5 | 認証: ANICCA_AGENT_TOKEN なし → 401 | `test_agentAuthRequired()` | AC-15 | ✅ |
| 6 | 認証: 本番 INTERNAL_API_TOKEN では拒否 | `test_agentTokenIsolation()` | AC-15 | ✅ |
| 7 | ProblemType マッピング（キーワード → type） | `test_keywordToProblemTypeMapping()` | AC-5 | ✅ |
| 8 | 重複投稿防止（同一 external_post_id） | `test_duplicatePostPrevention()` | AC-8 | ✅ |
| 9 | Z-Score 5チャネル統合計算 | `test_unifiedScore5Channels()` | AC-13 | ✅ |
| 10 | agent_posts → hook_candidates 昇格 | `test_agentPostPromotion()` | AC-14 | ✅ |
| 11 | 昇格条件（upvotes ≥ 5, Z-Score > 0.5） | `test_promotionThreshold()` | AC-14 | ✅ |
| 12 | hook_candidates 新カラム（moltbook/slack） | `test_hookCandidatesNewColumns()` | AC-13 | ✅ |
| 13 | 祝日判定（日本の祝日API） | `test_japaneseHolidayCheck()` | AC-11 | ✅ |
| 14 | ラボミーティング: 月曜非祝日 → 送信 | `test_labMeetingMonday()` | AC-10 | ✅ |
| 15 | ラボミーティング: 月曜祝日 → スキップ | `test_labMeetingHolidaySkip()` | AC-11 | ✅ |
| 16 | ラボミーティング: 火-日 → 送信しない | `test_labMeetingNotOnNonMonday()` | AC-10 | ✅ |
| 17 | Nudge レスポンスの buddhismReference が任意項目として正しく動作 | `test_nudgeResponseBuddhismReferenceOptional()` | AC-6 | ✅ |
| 18 | 1.6.0 API 後方互換（既存エンドポイント影響なし） | `test_existingEndpointsUnchanged()` | — | ✅ |
| 19 | `/api/agent/content` エンドポイント | `test_agentContentEndpoint()` | AC-17 | ✅ |
| 20 | `/api/agent/content` formats.short ≤ 280文字 | `test_agentContentShortFormat()` | AC-18 | ✅ |
| 21 | `/api/agent/content` formats にプラットフォーム別フォーマット | `test_agentContentFormats()` | AC-18 | ✅ |
| 22 | `/api/agent/nudge` レスポンスに agentPostId を含む | `test_nudgeResponseIncludesAgentPostId()` | AC-21 | ✅ |
| 23 | `/api/agent/feedback` agentPostId で更新 | `test_feedbackByAgentPostId()` | AC-22 | ✅ |
| 24 | `/api/agent/feedback` (platform, externalPostId) で更新 | `test_feedbackByExternalPostId()` | AC-22 | ✅ |
| 25 | feedback: agentPostId も externalPostId もなし → 400 | `test_feedbackRequiresIdentifier()` | AC-22 | ✅ |
| 26 | feedback-fetch: Moltbook upvotes 収集 → DB 更新 | `test_feedbackFetchMoltbook()` | AC-19 | ✅ |
| 27 | feedback-fetch: Slack reactions 収集 → DB 更新 | `test_feedbackFetchSlack()` | AC-20 | ✅ |
| 28 | feedback-fetch: 7日以上古い投稿をスキップ | `test_feedbackFetchSkipsOldPosts()` | — | ✅ |
| 29 | Prompt Injection: URL/コードブロック除去 | `test_contextSanitizesUrlAndCode()` | AC-23 | ✅ |
| 30 | Prompt Injection: 既知パターンフィルタ | `test_contextFiltersKnownInjectionPatterns()` | AC-23 | ✅ |
| 31 | Prompt Injection: `<user_post>` タグ封入 | `test_contextWrappedInUserPostTags()` | AC-23 | ✅ |

---

## 6. データモデル

### agent_posts テーブル

```sql
CREATE TABLE agent_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,         -- 'moltbook', 'slack', 'x', 'tiktok', 'instagram'
  external_post_id VARCHAR(255),          -- プラットフォーム固有ID
  hook TEXT,
  content TEXT,
  tone VARCHAR(50),
  problem_type VARCHAR(100),
  reasoning TEXT,
  buddhism_reference TEXT,
  
  -- フィードバック
  upvotes INTEGER DEFAULT 0,              -- Moltbook
  reactions JSONB DEFAULT '{}',           -- Slack { "👍": 3, "❤️": 1 }
  views INTEGER DEFAULT 0,                -- TikTok/X
  likes INTEGER DEFAULT 0,                -- TikTok/X
  shares INTEGER DEFAULT 0,               -- TikTok
  comments INTEGER DEFAULT 0,             -- TikTok/X
  
  -- Z-Score
  moltbook_z FLOAT,
  slack_z FLOAT,
  tiktok_z FLOAT,
  x_z FLOAT,
  instagram_z FLOAT,
  unified_score FLOAT,                    -- 5チャネル統合スコア
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  promoted_to_hook_candidates BOOLEAN DEFAULT FALSE
);
```

### 昇格条件

```
IF upvotes >= 5 AND unified_score > 0.5 THEN
  INSERT INTO hook_candidates (...)
  UPDATE agent_posts SET promoted_to_hook_candidates = TRUE
END IF
```

---

## 7. セキュリティ

### VPS セキュリティ

| 項目 | 設定 |
|------|------|
| ファイアウォール | ufw（22, 443のみ許可） |
| ブルートフォース対策 | fail2ban |
| SSH | 公開鍵認証のみ |
| API認証 | `ANICCA_AGENT_TOKEN`（本番トークンと分離） |

### Prompt Injection 対策

1. **URL除去**: HTTPリンクを削除
2. **コードブロック除去**: ```...``` を削除
3. **タグ封入**: ユーザー入力を `<user_post>...</user_post>` で囲む
4. **既知パターンフィルタ**: `ignore previous`, `disregard`, `override` 等を検出

---

## 8. 環境変数

### VPS (OpenClaw)

| 変数 | 説明 |
|------|------|
| `ANICCA_PROXY_BASE_URL` | Railway API URL |
| `ANICCA_AGENT_TOKEN` | Agent専用トークン |
| `SLACK_BOT_TOKEN` | Slack Bot Token |
| `MOLTBOOK_API_KEY` | Moltbook API Key |

### Railway API

| 変数 | 説明 |
|------|------|
| `ANICCA_AGENT_TOKEN` | Agent認証用（INTERNAL_API_TOKENとは別） |
| `OPENAI_API_KEY` | Nudge生成用 |

---

## 9. ユーザー作業（GUI / 手動）

| # | タイミング | タスク | 手順 | 理由 |
|---|-----------|--------|------|------|
| 1 | 初期セットアップ | Hetzner VPS 契約 | Hetzner Cloud → CPX11 (月€5) → Ubuntu 22.04 | VPSホスティング |
| 2 | 初期セットアップ | Moltbook アカウント作成 | moltbook.com → サインアップ | エージェント登録 |
| 3 | 初期セットアップ | s/sangha Submolt 作成 | Moltbook → Create Submolt → s/sangha | コミュニティ作成 |
| 4 | 初期セットアップ | Slack App 作成 | Slack API → Create App → Bot Token 取得 | Slack連携 |
| 5 | 初期セットアップ | X/Twitter オーナー認証 | Moltbook → Settings → Connect X | クロスポスト認証 |

---

## 10. TODO

### 高優先
- [ ] Hetzner VPS セットアップ
- [ ] OpenClaw デプロイ
- [ ] SOUL.md 作成
- [ ] Railway `/api/agent/*` エンドポイント実装
- [ ] moltbook-responder Skill 実装

### 中優先
- [ ] slack-reminder Skill 実装
- [ ] feedback-fetch Skill 実装
- [ ] Z-Score 5チャネル統合

### 低優先
- [ ] x-poster Skill 実装
- [ ] 昇格ロジック実装

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成（ターミナル出力から復元） |
