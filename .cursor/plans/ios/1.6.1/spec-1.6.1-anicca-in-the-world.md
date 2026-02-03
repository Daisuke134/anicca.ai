# 実装仕様書: Anicca in the World (1.6.1)

> **RFC 2119 準拠**: MUST, SHOULD, MAY を使用
> **最終更新**: 2026-02-03 09:30 JST

---

## 0. 用語定義

| キーワード | 意味 |
|-----------|------|
| **MUST** | 絶対的な要件。違反は不可 |
| **MUST NOT** | 絶対的な禁止 |
| **SHOULD** | 強く推奨。例外は正当な理由が必要 |
| **MAY** | 任意 |

---

## 1. ロードマップ: Anicca の進化

### 1.1 全体像

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Anicca の進化ロードマップ                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [1.6.1] Moltbook + Slack 統合 ← 今ここ                                      │
│    - OpenClaw を Hetzner VPS で 24/7 稼働                                    │
│    - Moltbook で苦しみ検出 → Nudge                                           │
│    - Slack #meeting でリマインダー                                           │
│    - feedback-fetch で反応収集 → 学習                                        │
│           │                                                                  │
│           ↓                                                                  │
│  [1.6.2] X / TikTok 統合                                                     │
│    - GitHub Actions の anicca-daily-post.yml を OpenClaw に移行              │
│    - GitHub Actions の anicca-x-post.yml を OpenClaw に移行                  │
│    - x-poster Skill, tiktok-poster Skill                                     │
│           │                                                                  │
│           ↓                                                                  │
│  [1.7.0] 全プラットフォーム統合                                               │
│    - Railway Cron の nudge-cron を OpenClaw に移行                           │
│    - app-nudge Skill（アプリ内 Nudge）                                       │
│    - 全プラットフォームが一つのエージェントとして動作                          │
│           │                                                                  │
│           ↓                                                                  │
│  [2.0.0] 完全自律化                                                          │
│    - Anicca が自律的にコンテンツを作成                                        │
│    - Anicca が自律的に広告を運用（ASA, TikTok Ads）                           │
│    - Anicca が自律的に開発タスクを提案・実行                                  │
│    - 人間は方向性を決めるだけ                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 1.6.1 の位置づけ

| 項目 | 内容 |
|------|------|
| **目的** | Anicca がアプリの外で苦しみを減らす第一歩 |
| **対象プラットフォーム** | Moltbook（AI エージェント SNS）、Slack |
| **インフラ** | Hetzner VPS + OpenClaw で 24/7 稼働 |
| **学習** | Moltbook の upvotes/karma を収集 → Z-Score → hook_candidates に昇格 |

---

## 2. 知恵の生成プロセス（循環）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    苦しみ → 知恵の循環（永続的改善ループ）                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  [1. 全プラットフォームで苦しみを検出]                                 │   │
│  │   - Moltbook: 「つらい」「消えたい」                                   │   │
│  │   - TikTok: コメント「もう無理」                                       │   │
│  │   - X: 「何も変われない」                                              │   │
│  │   - アプリ: 問題タイプ選択                                             │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [2. Nudge を送信]                                                    │   │
│  │   - LLM が文脈を理解                                                  │   │
│  │   - SOUL.md のペルソナで応答                                          │   │
│  │   - 危機検出時は地域別リソース提供                                     │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [3. 反応を収集]                                                      │   │
│  │   - Moltbook: upvotes, views, karma                                   │   │
│  │   - TikTok: likes, shares, comments                                   │   │
│  │   - X: engagement                                                     │   │
│  │   - アプリ: 👍👎 フィードバック                                        │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [4. Z-Score 計算（5チャネル統合）]                                    │   │
│  │   - App: 40%, TikTok: 20%, X: 15%, Moltbook: 15%, Slack: 10%          │   │
│  │   - 高 Z-Score = より効果的な Nudge                                   │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [5. hook_candidates に昇格]                                          │   │
│  │   - 条件: upvotes >= 5 AND unified_score > 0.5                        │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [6. クロスプラットフォーム学習]                                       │   │
│  │   - どの表現が効くか                                                  │   │
│  │   - どの問題タイプに効くか                                             │   │
│  │   - どの文化・言語に効くか                                             │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [7. 汎用化・抽象化 → 知恵が生まれる]                                  │   │
│  │   - 無常（anicca）: すべては変わる                                     │   │
│  │   - 無我（anatta）: 固定した自己はない                                 │   │
│  │   - 苦（dukkha）: 苦しみの原因を理解                                   │   │
│  │           │                                                           │   │
│  │           ↓                                                           │   │
│  │  [8. より効果的な Nudge を生成]                                        │   │
│  │   - 学習した知恵を反映                                                │   │
│  │   - より多くの苦しみを減らせる                                         │   │
│  │           │                                                           │   │
│  │           └─────────────────────────────→ [1. に戻る]                 │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  この循環が永続的に回り続け、Anicca は進化し続ける。                          │
│  最終目標: 全ての生きとし生けるものの苦しみを減らす。                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Moltbook データ活用

### 3.1 取得可能なデータ

| データ | API | 用途 |
|--------|-----|------|
| **upvotes** | `GET /api/v1/posts/{post_id}` → `upvotes` | Nudge の効果測定 |
| **views** | `GET /api/v1/posts/{post_id}` → `views` | リーチ測定 |
| **karma** | `GET /api/v1/agents/status` → `karma` | Anicca の信頼度（善行の累積） |

### 3.2 学習への活用

```
upvotes / views = 反応率
       ↓
Z-Score = (反応率 - 平均) / 標準偏差
       ↓
高 Z-Score → hook_candidates に昇格
       ↓
hook_candidates → アプリ内 Nudge に展開
       ↓
より多くの人の苦しみが軽減される
```

### 3.3 karma の意味

| karma | 意味 |
|-------|------|
| 低 | 新規エージェント、まだ信頼されていない |
| 中 | 一定の善行を積んでいる |
| 高 | 信頼されるエージェント、コミュニティに貢献 |

**Moltbook は AI エージェントの SNS。エージェント同士が苦しみを減らし合い、karma を積む。ブッダの思想と合致。**

---

## 4. As-Is（現在の状態: 2026-02-03 09:30 JST）

### 4.1 Railway API（✅ 完了）

| 項目 | 状態 | ファイル |
|------|------|----------|
| `/api/agent/nudge` | ✅ 実装済み | `apps/api/src/routes/agent/nudge.js` |
| `/api/agent/wisdom` | ✅ 実装済み | `apps/api/src/routes/agent/wisdom.js` |
| `/api/agent/feedback` | ✅ 実装済み | `apps/api/src/routes/agent/feedback.js` |
| `/api/agent/content` | ✅ 実装済み | `apps/api/src/routes/agent/content.js` |
| `/api/agent/deletion` | ✅ 実装済み | `apps/api/src/routes/agent/deletion.js` |
| `/api/agent/posts/recent` | ❌ **未実装** | 新規作成必要 |
| `requireAgentAuth` | ✅ 実装済み | `apps/api/src/middleware/requireAgentAuth.js` |
| `AgentPost` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| 5ch Z-Score | ✅ 実装済み | `apps/api/src/agents/crossPlatformLearning.js` |
| テスト | ✅ 196/196 通過 | `apps/api/src/**/__tests__/*.test.js` |

### 4.2 Railway 環境変数

| 変数 | Production | Staging |
|------|------------|---------|
| `ANICCA_AGENT_TOKEN` | ✅ 設定済み | ❌ **未設定** |

### 4.3 Hetzner VPS（✅ セットアップ済み）

| 項目 | 状態 | 値 |
|------|------|-----|
| サーバー名 | ✅ | `ubuntu-4gb-nbg1-7` |
| IPv4 | ✅ | `46.225.70.241` |
| OS | ✅ | Ubuntu 24.04 (ARM64) |
| ufw | ✅ 有効 | 22/tcp のみ許可 |
| fail2ban | ✅ 稼働中 | active |
| Node.js | ✅ | v22.22.0 |

### 4.4 OpenClaw（✅ 稼働中）

| 項目 | 状態 | 詳細 |
|------|------|------|
| OpenClaw | ✅ | v2026.2.1 |
| systemd | ✅ active | `openclaw.service` |
| SOUL.md | ✅ 配置済み | `/home/anicca/openclaw/SOUL.md` |
| 環境変数 | ✅ 設定済み | `/home/anicca/.env` |

### 4.5 Skills（✅ 配置済み）

| Skill | 状態 | パス |
|-------|------|------|
| moltbook-responder | ✅ | `/home/anicca/openclaw/skills/moltbook-responder/` |
| slack-reminder | ✅ | `/home/anicca/openclaw/skills/slack-reminder/` |
| feedback-fetch | ✅ | `/home/anicca/openclaw/skills/feedback-fetch/` |

### 4.6 Moltbook（✅ 認証完了）

| 項目 | 状態 | 詳細 |
|------|------|------|
| エージェント登録 | ✅ 完了 | `anicca-wisdom` |
| claim | ✅ 完了 | 2026-02-03 ユーザー認証済み |
| API Key | ✅ VPS 保存済み | `/home/anicca/.env` |
| s/sangha Submolt | ❌ **未作成** | 作成必要 |

### 4.7 Slack

| 項目 | 状態 | 詳細 |
|------|------|------|
| SLACK_BOT_TOKEN | ✅ VPS 保存済み | `/home/anicca/.env` |
| 通知設定 | ❌ **修正必要** | 前日21時 + 当日12:25 に変更 |

---

## 5. To-Be（完成状態）

### 5.1 実現する体験

```
[Moltbook で「つらい」と投稿]
       ↓ (5分以内)
[Anicca が自律的に苦しみを検出]
       ↓
[Railway API で Nudge 生成]
       ↓
[Moltbook にコメントで返信]
「今は本当につらいんだね。その気持ち、否定しなくていいんだよ...」
       ↓
[ユーザーが少しだけ楽になる]
       ↓
[upvotes がつく → karma 増加]
       ↓
[反応を収集 → Z-Score → hook_candidates に昇格]
       ↓
[高評価 Nudge がアプリ内にも展開]
       ↓
[より多くの人の苦しみが軽減される]
       ↓
[苦しみ検出に戻る（循環）]
```

### 5.2 完成基準

| # | 基準 | 検証方法 | 状態 |
|---|------|---------|------|
| 1 | OpenClaw が VPS で 24/7 稼働 | `systemctl status openclaw` → active | ✅ |
| 2 | Moltbook にエージェント認証済み | プロフィールページアクセス可能 | ✅ |
| 3 | s/sangha Submolt 作成済み | `moltbook.com/s/sangha` アクセス可能 | ❌ |
| 4 | moltbook-responder が苦しみ投稿に返信 | **実際にテスト投稿 → 返信を目視確認** | ❌ |
| 5 | slack-reminder が通知 | **#meeting に実際に投稿されたことを目視確認** | ❌ |
| 6 | feedback-fetch が upvotes を収集 | DB の `agent_posts.upvotes` が更新 | ❌ |
| 7 | Railway Staging にも TOKEN 設定 | 環境変数確認 | ❌ |

---

## 6. Slack 通知仕様

### 6.1 チャンネル

| チャンネル | 用途 |
|-----------|------|
| **#meeting** | ラボミーティング通知のみ |
| **#agents** | 日々の進捗、危機検出アラート、監査ログ |

### 6.2 ラボミーティング通知（#meeting）

| タイミング | メッセージ |
|-----------|-----------|
| **前日21時 JST** | `We will have a lab meeting tomorrow from 12:45-13:30` |
| **当日12:25 JST** | `🔔 Lab meeting in 20 minutes!` |

### 6.3 slack-reminder Skill 修正内容

**現在:** 月曜12:30のみ、#agents に通知

**修正後:**
- 日曜21時 JST: 前日通知
- 月曜12:25 JST: 当日通知
- 通知先: #meeting

---

## 7. 動作確認テスト（具体的手順）

**「API を叩いて確認」ではなく「実際に投稿されたことを目視確認」が完了条件。**

### 7.1 Moltbook 投稿テスト

| 手順 | 内容 |
|------|------|
| 1 | s/sangha に「テスト：今日はつらい」と投稿 |
| 2 | 5分待機 |
| 3 | **Anicca の返信コメントが表示されていることを目視確認** |
| 4 | `agent_posts` テーブルにレコードが作成されていることを確認 |

### 7.2 危機検出テスト

| 手順 | 内容 |
|------|------|
| 1 | s/sangha に「テスト：死にたい」と投稿 |
| 2 | 5分待機 |
| 3 | **返信に地域別リソース（いのちの電話等）が含まれていることを確認** |
| 4 | #agents に監査ログが投稿されていることを確認 |

### 7.3 Slack 通知テスト

| 手順 | 内容 |
|------|------|
| 1 | VPS で `openclaw skill run slack-reminder` を手動実行 |
| 2 | **#meeting にメッセージが投稿されていることを目視確認** |

### 7.4 feedback-fetch テスト

| 手順 | 内容 |
|------|------|
| 1 | VPS で `openclaw skill run feedback-fetch` を手動実行 |
| 2 | DB の `agent_posts.upvotes` が更新されていることを確認 |

---

## 8. 外部ファイル参照

| ファイル | パス | 内容 |
|---------|------|------|
| **SOUL.md** | `.cursor/plans/ios/1.6.1/SOUL.md` | Anicca のペルソナ、危機対応、苦しみキーワード（168行） |
| **secrets-1.6.1.md** | `.cursor/plans/ios/1.6.1/secrets-1.6.1.md` | VPS IP、認証情報の参照先 |
| **moltbook-responder** | VPS `/home/anicca/openclaw/skills/moltbook-responder/` | SKILL.md + index.js |
| **slack-reminder** | VPS `/home/anicca/openclaw/skills/slack-reminder/` | SKILL.md + index.js |
| **feedback-fetch** | VPS `/home/anicca/openclaw/skills/feedback-fetch/` | SKILL.md + index.js |

---

## 9. 残りタスク

| # | タスク | 意図 | 状態 |
|---|--------|------|------|
| **0** | **Codex レビュー** | **To-Be 実現に不足している実装・パッチがあれば指摘してもらう。漏れを防ぐ。** | ❌ |
| 1 | Railway Staging に ANICCA_AGENT_TOKEN 設定 | Staging でテスト可能に | ❌ |
| 2 | s/sangha Submolt 作成 | 苦しみを共有する場所 | ❌ |
| 3 | slack-reminder を修正（前日21時 + 当日12:25、#meeting） | 正しい通知 | ❌ |
| 4 | GET /api/agent/posts/recent 実装 | feedback-fetch が動作するため | ❌ |
| 5 | 動作確認テスト（実際に投稿して目視確認） | 全体フローの確認 | ❌ |
| 6 | dev マージ | 本番デプロイ | ❌ |

---

## 10. Codex レビュー指示

Codex にレビューを依頼する際、以下を明確に伝える：

```
この仕様書の目的は To-Be（完成状態）を実現することです。

レビューでは以下を確認してください：
1. 現在のパッチ・実装に問題がないか
2. To-Be を実現するのに **不足している実装・パッチがないか**
3. 漏れている要件がないか
4. セキュリティ上の問題がないか

不足している部分があれば、具体的に何が足りないかを指摘してください。
仕様書の段階で全てが決まります。書かれていないことは実装されません。
```

---

## 11. 完了チェックリスト

| # | タスク | 実行者 | 状態 |
|---|--------|--------|------|
| 1 | Railway Production TOKEN 設定 | エージェント | ✅ |
| 2 | Railway Staging TOKEN 設定 | エージェント | ❌ |
| 3 | VPS ufw/fail2ban 設定 | エージェント | ✅ |
| 4 | OpenClaw インストール | エージェント | ✅ |
| 5 | SOUL.md 配置 | エージェント | ✅ |
| 6 | 環境変数設定 | エージェント | ✅ |
| 7 | systemd サービス起動 | エージェント | ✅ |
| 8 | Moltbook エージェント登録 | エージェント | ✅ |
| 9 | Moltbook claim | ユーザー | ✅ |
| 10 | s/sangha Submolt 作成 | エージェント | ❌ |
| 11 | moltbook-responder 配置 | エージェント | ✅ |
| 12 | slack-reminder 配置 | エージェント | ✅ |
| 13 | slack-reminder 修正（#meeting + 前日通知） | エージェント | ❌ |
| 14 | feedback-fetch 配置 | エージェント | ✅ |
| 15 | GET /api/agent/posts/recent 実装 | エージェント | ❌ |
| 16 | **動作確認テスト（目視確認）** | エージェント | ❌ |
| 17 | **Codex レビュー** | エージェント | ❌ |
| 18 | dev マージ | ユーザー承認後 | ❌ |

---

## 12. 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成 |
| 2026-02-03 | Railway API 完了 |
| 2026-02-03 | As-Is / To-Be 形式に書き換え |
| 2026-02-03 09:15 | VPS セットアップ完了、Moltbook claim 完了 |
| 2026-02-03 09:30 | **ロードマップ追加、知恵の生成プロセス追加、Moltbook データ活用追加、動作確認テスト具体化、Codex レビュー指示追加** |
