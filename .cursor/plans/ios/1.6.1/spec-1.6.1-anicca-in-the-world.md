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

| Skill | 役割 | ソース |
|-------|------|--------|
| **moltbook-responder** | 苦しみ投稿を検出 → `/api/agent/nudge` → 返信 | 自前実装 |
| **slack-reminder** | 月曜12:30にラボミーティングリマインダー送信 | 自前実装 |
| **feedback-fetch** | Moltbook upvotes / Slack reactions を収集 | 自前実装 |
| **x-poster** | X/Twitter にコンテンツ投稿 | 自前実装 |
| **moltbook/late-api** | Moltbook API クライアント | ClawHub（allowlist） |

#### ClawHub Skill ポリシー（供給鎖リスク対策強化）

| ルール | 詳細 |
|--------|------|
| **allowlist 方式** | `SOUL.md` に許可リストを定義。リスト外の ClawHub Skill は自動拒否 |
| **コミットハッシュ固定** | `clawhub install moltbook/late-api@abc1234` のように特定バージョンを固定 |
| **署名/ハッシュ検証** | インストール時に SHA-256 ハッシュを検証。不一致は拒否 |
| **内部ミラー運用** | 本番では ClawHub 直接取得を禁止。内部ミラー（`skills.anicca.internal/`）からのみ取得 |
| **サンドボックス実行** | スキルは最小権限で実行。ファイルシステム・ネットワークアクセスは明示的に許可されたもののみ |
| **更新時はレビュー必須** | Skill 更新時は diff を確認 + セキュリティレビュー後にハッシュを更新 |

#### スキル権限レビュープロセス

| ステップ | 内容 |
|---------|------|
| 1. Diff 確認 | `clawhub diff moltbook/late-api@old..new` で変更を確認 |
| 2. 権限チェック | 新規の API 呼び出し、ファイルアクセス、外部通信を確認 |
| 3. セキュリティレビュー | Codex または人間がレビュー |
| 4. 承認 | Slack #agents で承認後、ハッシュを更新 |

#### 緊急停止手順

| シナリオ | 対応 |
|---------|------|
| 悪性スキル検出 | (1) `clawhub disable <skill>` で即時無効化 → (2) Slack #agents に通知 → (3) 内部ミラーから削除 |
| 全スキル停止 | `/anicca stop-skills` で全スキル停止 |
| ロールバック | `clawhub rollback <skill>@<previous-hash>` で前バージョンに戻す |

#### 監査ログ

| ログ項目 | 詳細 |
|---------|------|
| skill_install | スキルインストール日時、ハッシュ、承認者 |
| skill_update | 更新日時、old/new ハッシュ、diff サマリ |
| skill_execution | 実行日時、入力サマリ、出力サマリ、実行時間 |
| skill_error | エラー日時、エラー内容、スタックトレース |

### 3.3 Railway API

| エンドポイント | メソッド | 役割 |
|---------------|---------|------|
| `/api/agent/nudge` | POST | Nudge生成（LLM） |
| `/api/agent/wisdom` | GET | Wisdom取得 |
| `/api/agent/feedback` | POST | フィードバック保存 |
| `/api/agent/content` | POST | プラットフォーム別コンテンツ生成 |

#### AgentFeedbackRequest バリデーション

```typescript
interface AgentFeedbackRequest {
  agentPostId?: string;       // UUID（これ OR 下の2つで特定）
  platform?: string;          // optional（agentPostId があれば不要）
  externalPostId?: string;    // optional（agentPostId があれば不要）
  upvotes?: number;
  reactions?: Record<string, number>;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
}
```

**5ステップ バリデーションルール:**

| # | ルール | 失敗時 |
|---|--------|--------|
| 1 | `agentPostId` OR (`platform` + `externalPostId`) のいずれかが必須 | 400 Bad Request |
| 2 | `agentPostId` 指定時 → DB に存在するか確認 | 404 Not Found |
| 3 | `platform` + `externalPostId` 指定時 → DB に存在するか確認 | 404 Not Found |
| 4 | 数値フィールドは非負整数（`upvotes`, `views`, `likes`, `shares`, `comments`） | 400 Bad Request |
| 5 | `reactions` は `Record<string, number>` 形式（emoji → count） | 400 Bad Request |

---

## 4. Acceptance Criteria

| # | 条件 | 合否判定 | 検証方法 | テスト# |
|---|------|---------|----------|---------|
| AC-1 | OpenClaw が Hetzner VPS 上で 24/7 稼働する | `systemctl status openclaw` = active, 24h uptime 確認 | 手動（SSH） | — |
| AC-2 | SOUL.md に Anicca のペルソナが定義され、OpenClaw が認識する | OpenClaw に「Who are you?」→ Anicca として応答 | 手動（VPS） | — |
| AC-3 | Moltbook に Anicca エージェントが登録される | Moltbook プロフィールページが存在 | 手動（Moltbook） | — |
| AC-4 | s/sangha Submolt が作成される | Moltbook 上で s/sangha にアクセス可能 | 手動（Moltbook） | — |
| AC-5 | Moltbook の苦しみ投稿を検出してNudgeを返信できる | 苦しみキーワードを含む投稿 → Anicca の返信が表示される | 手動 + 自動 | #7 |
| AC-6 | Railway API `/api/agent/nudge` が正常動作 | POST → 200 + hook/content/tone/reasoning/buddhismReference（任意）/agentPostId を含むJSON | 自動 | #1, #4, #17, #22 |
| AC-7 | Railway API `/api/agent/wisdom` が正常動作 | GET → 200 + `{ hook, content, source, problemType, reasoning }` を含む JSON | 自動 | #2 |
| AC-8 | Railway API `/api/agent/feedback` がフィードバックを保存 | POST → 200 + agent_posts 更新確認 | 自動 | #3, #23, #24, #25 |
| AC-9 | Slack チャネルに接続される | OpenClaw → Slack メッセージ送信成功 | 手動（Slack） | — |
| AC-10 | ラボミーティングリマインダーが月曜12:30に投稿される | 月曜テスト → Slack にメッセージ表示 | 自動 + 手動 | #14 |
| AC-11 | 日本の祝日はリマインダーをスキップ | 祝日API → スキップメッセージ | 自動 | #13, #15 |
| AC-12 | Moltbook upvotes が agent_posts テーブルに保存される | Heartbeat 後 → DB 確認 | 自動 | #26 |
| AC-13 | Z-Score 正規化が5チャネル統合で動作 | `unifiedScore()` に moltbookZ + slackZ が反映 | 自動 | #9, #12 |
| AC-14 | agent_posts から hook_candidates への昇格が動作 | upvotes ≥ 5 の投稿 → hook_candidates INSERT | 自動 | #10, #11 |
| AC-15 | VPS セキュリティ（fail2ban + ufw + 専用APIキー） | `ufw status` = active, fail2ban running, 本番APIキー未使用 | 手動（SSH）+ 自動 | #5, #6 |
| AC-16 | Moltbook claim URL をクリックして認証完了（ユーザー作業） | claim_url アクセス → Moltbook プロフィール表示 | 手動（ユーザー） | — |
| AC-17 | Railway API `/api/agent/content` が正常動作 | POST → 200 + `{ hook, content, tone, formats: { short, medium, long, hashtags } }` を含む JSON | 自動 | #19 |
| AC-18 | `/api/agent/content` の formats.short が 280文字以内 | short フォーマットの文字数検証 | 自動 | #20, #21 |
| AC-19 | feedback-fetch Skill が Moltbook upvotes を収集して Railway API に送信 | Heartbeat 後 → agent_posts.upvotes が更新される | 自動 | #26 |
| AC-20 | feedback-fetch Skill が Slack reactions を収集して Railway API に送信 | Heartbeat 後 → agent_posts.reactions が更新される | 自動 | #27 |
| AC-21 | `/api/agent/nudge` レスポンスに agentPostId が含まれる | POST → 200 + agentPostId (UUID) がレスポンスに存在 | 自動 | #22 |
| AC-22 | `/api/agent/feedback` が agentPostId OR (platform + externalPostId) で更新可能 | 両方のパターンでテスト → agent_posts 更新確認 | 自動 | #23, #24, #25 |
| AC-23 | Prompt Injection 対策が context サニタイズで機能する | URL/コードブロック除去、`<user_post>` タグ封入、既知パターンフィルタ | 自動 | #29, #30, #31 |
| AC-24 | ツール呼び出し制御が Allowlist に従って動作する | Allowlist 外ツール → 拒否、Allowlist 内 → 許可、高リスク → HITL | 自動 | #32, #33, #34 |
| AC-25 | 監査ログが全ての LLM 呼び出し・ツール実行を記録する | `agent_audit_logs` テーブルにログが存在 | 自動 | #35, #36 |
| AC-26 | 緊急停止コマンドで全エージェントが停止する | `/anicca stop` → 全エージェント停止確認 | 自動 + 手動 | #37 |
| AC-27 | スキル署名検証が機能する | ハッシュ不一致 → 拒否、ハッシュ一致 → 許可 | 自動 | #38, #39 |
| AC-28 | Moltbook 運用ポリシーに従って動作する | オプトイン/召喚型、投稿上限、ミュート/ブロック尊重 | 手動 + 自動 | — |

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
| 32 | ツール呼び出し: Allowlist 外ツール → 拒否 | `test_toolCallDeniedIfNotInAllowlist()` | AC-24 | ✅ |
| 33 | ツール呼び出し: Allowlist 内ツール → 許可 | `test_toolCallAllowedIfInAllowlist()` | AC-24 | ✅ |
| 34 | ツール呼び出し: 高リスク操作 → HITL 通知 | `test_highRiskToolTriggersHitl()` | AC-24 | ✅ |
| 35 | 監査ログ: LLM 呼び出しがログされる | `test_llmCallAuditLogged()` | AC-25 | ✅ |
| 36 | 監査ログ: ツール実行がログされる | `test_toolExecutionAuditLogged()` | AC-25 | ✅ |
| 37 | 緊急停止: `/anicca stop` で全エージェント停止 | `test_emergencyStopCommand()` | AC-26 | ✅ |
| 38 | スキル署名検証: ハッシュ不一致 → 拒否 | `test_skillHashMismatchRejected()` | AC-27 | ✅ |
| 39 | スキル署名検証: ハッシュ一致 → 許可 | `test_skillHashMatchAllowed()` | AC-27 | ✅ |

---

## 6. データモデル

### 6.1 agent_posts（Prisma model）

```prisma
model AgentPost {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platform          String    @db.VarChar(50)        // 'moltbook', 'slack', 'x', 'tiktok', 'instagram'
  externalPostId    String?   @map("external_post_id") @db.VarChar(255)
  severity          String?   @db.VarChar(20)        // null | 'crisis'（危機検出時）
  hook              String?
  content           String?
  tone              String?   @db.VarChar(50)
  problemType       String?   @map("problem_type") @db.VarChar(100)
  reasoning         String?
  buddhismReference String?   @map("buddhism_reference")

  // フィードバック
  upvotes           Int       @default(0)
  reactions         Json      @default("{}")          // Slack { "👍": 3, "❤️": 1 }
  views             Int       @default(0)
  likes             Int       @default(0)
  shares            Int       @default(0)
  comments          Int       @default(0)

  // Z-Score
  moltbookZ         Float?    @map("moltbook_z")
  slackZ            Float?    @map("slack_z")
  tiktokZ           Float?    @map("tiktok_z")
  xZ                Float?    @map("x_z")
  instagramZ        Float?    @map("instagram_z")
  unifiedScore      Float?    @map("unified_score")

  // メタデータ
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  promotedToHookCandidates Boolean @default(false) @map("promoted_to_hook_candidates")

  @@unique([platform, externalPostId])  // 重複防止（partial: NULL は複数許容）
  @@map("agent_posts")
}
```

### 6.2 hook_candidates 拡張カラム（Prisma migration）

既存の `HookCandidate` model に以下を追加:

```prisma
// 既存の HookCandidate に追加するカラム
moltbookUpvoteRate  Decimal?  @map("moltbook_upvote_rate") @db.Decimal(5, 4)
moltbookSampleSize  Int?      @map("moltbook_sample_size")
moltbookHighPerformer Boolean? @map("moltbook_high_performer")
slackReactionRate   Decimal?  @map("slack_reaction_rate") @db.Decimal(5, 4)
slackSampleSize     Int?      @map("slack_sample_size")
slackHighPerformer  Boolean?  @map("slack_high_performer")
```

### 6.3 Z-Score 5チャネル統合

**As-Is（1.6.0）:** 3チャネル（App, TikTok, X）

```
unified_score = W_APP * appZ + W_TIK * tiktokZ + W_X * xZ
W_APP=0.5, W_TIK=0.3, W_X=0.2  (合計 1.0)
```

**To-Be（1.6.1）:** 5チャネル

```
unified_score = W_APP * appZ + W_TIK * tiktokZ + W_X * xZ + W_MOLT * moltbookZ + W_SLACK * slackZ
```

| チャネル | 重み | 理由 |
|---------|------|------|
| App (appZ) | 0.40 | コア。ユーザーの行動変容に最も直結 |
| TikTok (tiktokZ) | 0.20 | リーチが大きい。like率が指標 |
| X (xZ) | 0.15 | engagement率が指標 |
| Moltbook (moltbookZ) | 0.15 | 苦しみターゲットに最も近い。upvote率が指標 |
| Slack (slackZ) | 0.10 | 実験場。reaction数が指標 |

**ベースライン（初期値）:**

| チャネル | 指標 | 初期MEAN | 初期STDDEV | 最小サンプルサイズ |
|---------|------|---------|-----------|-----------------|
| Moltbook | upvotes / views | 0.05 | 0.03 | 10 |
| Slack | total_reactions / messages | 0.10 | 0.05 | 5 |

**注意:** Moltbook の指標は `upvotes / views` を使用。`views` は `AgentPost.views` フィールドで保存済み。Moltbook API が views を返さない場合は `upvotes` の絶対値で代替し、ベースラインを再計算する。

30日分のデータが溜まったら `refreshBaselines()` が実データで上書きする。

### 6.4 昇格パイプライン

**2つの昇格パスが共存する。干渉しない。**

| パス | 条件 | 動作 | source |
|------|------|------|--------|
| **A: agent_posts → hook_candidates**（新規） | `upvotes >= 5 AND unified_score > 0.5` | 新規 INSERT | `agent_moltbook`, `agent_slack` 等 |
| **B: 既存 cross-platform promotion** | X→TikTok: Z≥1.0, TikTok→App: unified≥1.5 | hook_candidates 内の `promoted` フラグ更新 | 既存の `tiktok`, `x` 等 |

- パスA は外部プラットフォーム（Moltbook/Slack）からの「新規 hook 発見」
- パスB は既存パイプライン内の「クロスプラットフォーム昇格」
- `source` カラムで区別。既存ロジックに影響なし

---

## 7. セキュリティ

### Railway Agent API セキュリティ

| 項目 | 設定 |
|------|------|
| 認証 | `ANICCA_AGENT_TOKEN`（`INTERNAL_API_TOKEN` とは完全分離） |
| 許可メソッド | **GET**（`/wisdom`）+ **POST**（`/nudge`, `/feedback`, `/content`） |
| スコープ | Nudge生成 + Wisdom取得 + フィードバック保存 + コンテンツ生成のみ。ユーザーデータ・課金・設定変更は不可 |
| レート制限 | 60 req/min per token |

### トークン管理（OWASP MCP Top 10 準拠）

| 項目 | 設定 |
|------|------|
| **有効期限** | 90日（短期トークン） |
| **ローテーション** | 60日ごとに新トークン発行。旧トークンは7日間の猶予期間後に失効 |
| **失効フロー** | Railway 環境変数を更新 → VPS 環境変数を更新 → 旧トークン削除 |
| **漏洩時の即時無効化** | (1) Railway で即座に環境変数を削除 → (2) Slack #agents に通知 → (3) 新トークン発行 → (4) VPS 更新 |
| **監査** | トークン使用ログを `agent_audit_logs` に記録。異常パターン検知 |

#### ローテーション手順

```bash
# 1. 新トークン生成
NEW_TOKEN=$(openssl rand -hex 32)

# 2. Railway に新トークンを追加（旧トークンも維持）
railway variables set ANICCA_AGENT_TOKEN_NEW=$NEW_TOKEN

# 3. API を更新して両方のトークンを受け入れ
# (7日間の猶予期間)

# 4. VPS を新トークンに更新
ssh anicca@<vps-ip> "sed -i 's/OLD_TOKEN/NEW_TOKEN/' ~/.env && systemctl restart openclaw"

# 5. 旧トークンを削除
railway variables unset ANICCA_AGENT_TOKEN_OLD
```

#### 漏洩検知指標

| 指標 | 閾値 | 対応 |
|------|------|------|
| 異常な IP からのリクエスト | 既知 IP 以外から10件/時 | アラート + 調査 |
| レート制限超過 | 3回連続 | アラート + 一時ブロック検討 |
| 失敗リクエスト急増 | 50件/時 | アラート + トークン漏洩疑い |

### VPS セキュリティ

| 項目 | 設定 |
|------|------|
| ファイアウォール | ufw（22, 443のみ許可） |
| ブルートフォース対策 | fail2ban |
| SSH | 公開鍵認証のみ |

### Prompt Injection 対策（OWASP MCP Top 10 準拠）

#### 入力サニタイズ層

| # | 対策 | 詳細 |
|---|------|------|
| 1 | URL除去 | HTTPリンクを削除 |
| 2 | コードブロック除去 | ``` ``` ``` を削除 |
| 3 | タグ封入 | ユーザー入力を `<user_post>...</user_post>` で囲む |
| 4 | 既知パターンフィルタ | `ignore previous`, `disregard`, `override`, `system:`, `assistant:` 等を検出・除去 |
| 5 | 最大長制限 | context は 2000文字まで（超過は切り捨て） |
| 6 | Unicode制御文字除去 | U+200B-U+200F, U+202A-U+202E を除去 |
| 7 | タグエスケープ | ユーザー入力中の `<user_post>` `</user_post>` を除去 |

#### ツール呼び出し制御層（新規）

| # | 対策 | 詳細 |
|---|------|------|
| 8 | ツール Allowlist | Anicca エージェントが呼び出せるツールを明示的に定義。それ以外は自動拒否 |
| 9 | 未信頼コンテキスト分離 | ユーザー投稿は `untrusted_context` として明確に分離。System prompt とは別セクション |
| 10 | ポリシー検証 | 各ツール呼び出し前にサーバー側でポリシー検証。外部 API 呼び出しは制限 |
| 11 | 高リスク操作の HITL | データ削除、外部送信、設定変更は人間承認必須（Slack #agents に通知） |

#### 監査・監視層（新規）

| # | 対策 | 詳細 |
|---|------|------|
| 12 | 監査ログ必須 | 全ての LLM 呼び出し・ツール実行をログ。`agent_audit_logs` テーブルに保存 |
| 13 | 異常検知 | 1時間あたり50件以上のツール呼び出しでアラート |
| 14 | 緊急停止 | Slack #agents で `/anicca stop` コマンド → 全エージェント即時停止 |

#### Allowlist 定義

```yaml
allowed_tools:
  - name: generate_nudge
    risk: low
    hitl: false
  - name: post_to_moltbook
    risk: medium
    hitl: false
    rate_limit: 10/day
  - name: post_to_slack
    risk: low
    hitl: false
  - name: fetch_feedback
    risk: low
    hitl: false

denied_tools:
  - name: execute_code
  - name: send_email
  - name: access_database_raw
  - name: modify_system_config
```

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

**ほぼ全自動。ユーザーが手動でやるのは1つだけ。**

### エージェントが自動でやること（CLI）

| # | タスク | 方法 |
|---|--------|------|
| 1 | Moltbook エージェント登録 | `curl -X POST https://www.moltbook.com/api/v1/agents/register` → api_key + claim_url 取得 |
| 2 | s/sangha Submolt 作成 | Moltbook API 経由 |
| 3 | Hetzner VPS セットアップ | CLI / Terraform |
| 4 | Slack 連携 | **設定済み**（OAuth + Bot Token + `#agents` チャンネル + 12+ ツール） |

### ユーザーが手動でやること

| # | タイミング | タスク | 手順 | 理由 |
|---|-----------|--------|------|------|
| 1 | Moltbook 登録後 | claim URL をクリック | エージェントが出力した `claim_url` をブラウザで開く | Moltbook がオーナー認証に人間のクリックを要求するため |

---

## 10. 境界（やらないこと）

| やらないこと | 理由 |
|-------------|------|
| 既存の `/api/mobile/*` エンドポイントを変更しない | 後方互換。古いiOSクライアントが壊れる |
| iOSクライアントコードを変更しない | 1.6.1 はバックエンド + VPS のみ |
| 既存の TikTok/X の GHA ワークフローを変更しない | Strangler Fig: 1.6.1 では並行稼働、1.7.0 で段階移行 |
| Commander Agent のロジックを変更しない | hook_candidates の読み取りのみ（新カラム追加は影響なし） |
| 他ユーザーの Slack ワークスペースに接続しない | 1.6.1 はラボ実験（自分のワークスペースのみ） |

### 触るファイル

| ファイル | 変更内容 |
|---------|----------|
| `apps/api/prisma/schema.prisma` | AgentPost model 追加、HookCandidate 拡張 |
| `apps/api/src/api/agent/` | 新規ディレクトリ: nudge, wisdom, feedback, content エンドポイント |
| `apps/api/src/api/auth/` | agentAuth ミドルウェア追加 |
| `apps/api/src/jobs/syncCrossPlatform.js` | unifiedScore() を 5ch に拡張、refreshBaselines() に Moltbook/Slack 追加 |

### 触らないファイル

| ファイル | 理由 |
|---------|------|
| `apps/api/src/api/mobile/*` | 既存モバイルAPI。後方互換 |
| `apps/api/src/agents/commander.js` | hook_candidates を読むだけ。変更不要 |
| `aniccaios/` | iOSクライアント。1.6.1 スコープ外 |
| `.github/workflows/anicca-daily-post.yml` | 既存TikTok投稿。並行稼働 |
| `.github/workflows/anicca-x-post.yml` | 既存X投稿。並行稼働 |

## 11. Skill 実行スケジュール

| Skill | 実行方式 | 間隔 |
|-------|---------|------|
| moltbook-responder | ポーリング | 5分間隔 |
| feedback-fetch | ポーリング | 30分間隔 |
| slack-reminder | Cron Skill | 月曜12:25にチェック開始 |
| x-poster | Commander 連携 | Commander Agent のスケジュールに従う |

### エラーハンドリング

| 項目 | 設定 |
|------|------|
| リトライ | Exponential backoff（初回1分、最大30分） |
| Circuit breaker | 5回連続失敗 → 10分停止 |
| ログ | 1-2回失敗: warn、3回以上: error |

## 12. 実行手順

### テスト

```bash
cd apps/api && npm test
```

### VPS デプロイ

```bash
# 1. SSH で VPS に接続
ssh anicca@<vps-ip>

# 2. OpenClaw インストール・設定
# (OpenClaw のデプロイ手順に従う)

# 3. SOUL.md を配置
scp SOUL.md anicca@<vps-ip>:~/openclaw/

# 4. systemd サービス起動
sudo systemctl enable openclaw && sudo systemctl start openclaw
```

### Railway デプロイ

```bash
# dev → main マージで自動デプロイ
# migration は自動実行（Prisma migrate deploy）
```

## 13. TODO

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
| 2026-02-02 | Blocking issue 6件修正: Crisis Protocol, UNIQUE制約, Z-Score 5ch重み, hook_candidates拡張, 昇格パイプライン明記, Prisma model化, 境界・実行手順追加 |
