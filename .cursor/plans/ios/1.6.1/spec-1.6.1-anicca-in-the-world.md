# 実装仕様書: Anicca in the World (1.6.1)

> **RFC 2119 準拠**: MUST, SHOULD, MAY を使用
> **最終更新**: 2026-02-03 11:40 JST

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
│  │   - Moltbook: upvotes, karma                                          │   │
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

## 3. Moltbook API 仕様（検証結果）

### 3.1 API ドキュメント調査結果

| エンドポイント | 存在 | 取得可能データ |
|---------------|------|----------------|
| `POST /api/v1/agents/verify-identity` | ✅ 確認済み | karma, posts count, comments count, follower_count |
| `GET /api/v1/posts/{post_id}` | ⚠️ 未確認（ドキュメントなし） | upvotes, views（推定） |
| `GET /api/v1/agents/status` | ⚠️ 未確認（ドキュメントなし） | karma（推定） |

**現状:** Moltbook API は Early Access で、公式ドキュメントには `verify-identity` のみ記載。投稿取得 API は存在が推定されるが未確認。

### 3.2 フォールバック戦略（MUST 実装）

| 取得不可データ | フォールバック |
|---------------|---------------|
| `views` | `views = null` → Z-Score 計算時は `upvotes` のみで計算（反応率の分母を 1 とする） |
| `karma` | `karma = null` → 学習指標から除外（スコア補正なし） |
| `upvotes` | **取得不可なら Moltbook 学習全体をスキップ**（他プラットフォームのみで学習継続） |

### 3.3 karma の保存と利用

| 項目 | 仕様 |
|------|------|
| **保存先** | `agent_posts` テーブルの新規カラム `agent_karma_at_post INT` |
| **更新周期** | 投稿時に同期（`verify-identity` 呼び出し） |
| **利用用途** | 1.6.1 では記録のみ。1.7.0 以降で信頼度スコアとして活用予定 |

---

## 4. Moltbook 運用ポリシー（SOUL.md 準拠）

### 4.1 オプトイン制約（MUST）

moltbook-responder MUST は以下の条件を満たす投稿のみ返信する：

| 条件 | 説明 |
|------|------|
| **@anicca-wisdom メンション** | 明示的にメンションされた場合 |
| **s/sangha 投稿** | 自分の Submolt への投稿 |
| **フォロワーの投稿** | Anicca を明示的にフォローしているユーザー |

**禁止:** 無差別キーワード走査による返信（全投稿を監視してキーワードで反応することは MUST NOT）

### 4.2 レート制限（MUST）

| 制限 | 値 |
|------|-----|
| 1日最大返信数 | 10 |
| 連続返信間隔 | 最低 30 秒 |
| 超過時の動作 | 翌日にキュー（即時返信しない） |

### 4.3 ミュート/ブロック尊重（MUST）

| ルール | 実装 |
|--------|------|
| ブロックされたユーザー | `muted_users` テーブルで管理、絶対に返信しない |
| ミュートされたユーザー | 同上 |
| 確認タイミング | 返信前に毎回チェック |

---

## 5. Slack 通知仕様（SOUL.md 準拠）

### 5.1 チャンネル

| チャンネル | 用途 |
|-----------|------|
| **#meeting** | ラボミーティング通知のみ |
| **#agents** | 危機検出アラート、監査ログ |

### 5.2 ラボミーティング通知（#meeting）

| タイミング | メッセージ | スケジュール |
|-----------|-----------|-------------|
| **前日 21:00 JST** | `We will have a lab meeting tomorrow from 12:45-13:30` | 日曜 21:00 JST |
| **当日 12:25 JST** | `🔔 Lab meeting in 20 minutes!` | 月曜 12:25 JST |

### 5.3 祝日スキップ（MUST）

| 項目 | 仕様 |
|------|------|
| 祝日判定ソース | `https://holidays-jp.github.io/api/v1/date.json` |
| タイムゾーン | JST 固定（`Asia/Tokyo`） |
| DST 対応 | 日本は DST なし。UTC+9 固定 |

### 5.4 スケジューラ実装

| 方式 | 詳細 |
|------|------|
| OpenClaw `schedule.yaml` | cron 式でスケジュール |
| 前日通知 | `0 12 * * 0` (UTC) = 日曜 21:00 JST |
| 当日通知 | `25 3 * * 1` (UTC) = 月曜 12:25 JST |

---

## 6. GET /api/agent/posts/recent 仕様（MUST 実装）

### 6.1 概要

| 項目 | 値 |
|------|-----|
| メソッド | GET |
| パス | `/api/agent/posts/recent` |
| 認証 | `requireAgentAuth`（`Authorization: Bearer <ANICCA_AGENT_TOKEN>`） |
| 用途 | feedback-fetch skill が最近の投稿を取得し、フィードバックを更新するため |

### 6.2 クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `platform` | string | MAY | all | `moltbook`, `slack`, `x`, `tiktok` のいずれか |
| `days` | number | MAY | 7 | 何日前までの投稿を取得するか（最大 30） |
| `limit` | number | MAY | 50 | 取得件数（最大 100） |
| `cursor` | string | MAY | null | ページネーション用カーソル（`id` ベース） |

### 6.3 レスポンス

```json
{
  "posts": [
    {
      "id": "uuid",
      "platform": "moltbook",
      "externalPostId": "moltbook_post_123",
      "content": "Nudge 本文...",
      "upvotes": 5,
      "views": null,
      "likes": 0,
      "shares": 0,
      "createdAt": "2026-02-01T12:00:00Z"
    }
  ],
  "nextCursor": "uuid_of_last_post",
  "hasMore": true
}
```

### 6.4 エラーレスポンス

| ステータス | コード | メッセージ |
|-----------|--------|-----------|
| 401 | `UNAUTHORIZED` | `Agent token required` |
| 400 | `INVALID_PLATFORM` | `Invalid platform: {value}` |
| 400 | `INVALID_DAYS` | `days must be between 1 and 30` |

### 6.5 実装ファイル

| ファイル | 内容 |
|---------|------|
| `apps/api/src/routes/agent/posts.js` | ルーター実装 |
| `apps/api/src/routes/agent/index.js` | `postsRouter` を登録 |
| `apps/api/src/routes/agent/__tests__/posts.test.js` | テスト |

### 6.6 テストケース（MUST）

| ケース | 期待結果 |
|--------|---------|
| 認証なし | 401 UNAUTHORIZED |
| 有効なトークン、デフォルトパラメータ | 200 + 最新50件 |
| `platform=moltbook` | 200 + Moltbook のみ |
| `days=30` | 200 + 30日分 |
| `days=31` | 400 INVALID_DAYS |
| ページネーション | `nextCursor` で次ページ取得可能 |

---

## 7. As-Is（現在の状態: 2026-02-03 11:40 JST）

### 7.1 Railway API

| 項目 | 状態 | ファイル |
|------|------|----------|
| `/api/agent/nudge` | ✅ 実装済み | `apps/api/src/routes/agent/nudge.js` |
| `/api/agent/wisdom` | ✅ 実装済み | `apps/api/src/routes/agent/wisdom.js` |
| `/api/agent/feedback` | ✅ 実装済み | `apps/api/src/routes/agent/feedback.js` |
| `/api/agent/content` | ✅ 実装済み | `apps/api/src/routes/agent/content.js` |
| `/api/agent/deletion` | ✅ 実装済み | `apps/api/src/routes/agent/deletion.js` |
| `/api/agent/posts/recent` | ❌ **未実装** | セクション6で仕様定義済み |
| `requireAgentAuth` | ✅ 実装済み | `apps/api/src/middleware/requireAgentAuth.js` |
| `AgentPost` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| 5ch Z-Score | ✅ 実装済み | `apps/api/src/agents/crossPlatformLearning.js` |
| テスト | ✅ 196/196 通過 | `apps/api/src/**/__tests__/*.test.js` |

### 7.2 Railway 環境変数

| 変数 | Production | Staging |
|------|------------|---------|
| `ANICCA_AGENT_TOKEN` | ✅ 設定済み | ❌ **未設定** |

### 7.3 Hetzner VPS（✅ セットアップ済み）

| 項目 | 状態 | 値 |
|------|------|-----|
| サーバー名 | ✅ | `ubuntu-4gb-nbg1-7` |
| IPv4 | ✅ | `46.225.70.241` |
| OS | ✅ | Ubuntu 24.04 (ARM64) |
| ufw | ✅ 有効 | 22/tcp のみ許可 |
| fail2ban | ✅ 稼働中 | active |
| Node.js | ✅ | v22.22.0 |

### 7.4 OpenClaw（✅ 稼働中）

| 項目 | 状態 | 詳細 |
|------|------|------|
| OpenClaw | ✅ | v2026.2.1 |
| systemd | ✅ active | `openclaw.service` |
| SOUL.md | ✅ 配置済み | `/home/anicca/openclaw/SOUL.md` |
| 環境変数 | ✅ 設定済み | `/home/anicca/.env` |

### 7.5 Skills（✅ 配置済み）

| Skill | 状態 | パス |
|-------|------|------|
| moltbook-responder | ✅ | `/home/anicca/openclaw/skills/moltbook-responder/` |
| slack-reminder | ✅ | `/home/anicca/openclaw/skills/slack-reminder/` |
| feedback-fetch | ✅ | `/home/anicca/openclaw/skills/feedback-fetch/` |

### 7.6 Moltbook（✅ 認証完了）

| 項目 | 状態 | 詳細 |
|------|------|------|
| エージェント登録 | ✅ 完了 | `anicca-wisdom` |
| claim | ✅ 完了 | 2026-02-03 ユーザー認証済み |
| API Key | ✅ VPS 保存済み | `/home/anicca/.env` |
| s/sangha Submolt | ❌ **未作成** | 作成必要 |

### 7.7 Slack

| 項目 | 状態 | 詳細 |
|------|------|------|
| SLACK_BOT_TOKEN | ✅ VPS 保存済み | `/home/anicca/.env` |
| slack-reminder | ❌ **修正必要** | 前日21時 + 当日12:25、#meeting に変更 |

---

## 8. To-Be（完成状態）

### 8.1 実現する体験

```
[Moltbook で「@anicca-wisdom つらい」と投稿]  ← オプトイン（メンション）
       ↓ (5分以内)
[Anicca が自律的に検出]
       ↓
[オプトイン条件を確認]  ← MUST: @mention / s/sangha / フォロワー のみ
       ↓
[ミュート/ブロック確認]  ← MUST: muted_users テーブルで確認
       ↓
[レート制限確認]  ← MUST: 1日10件以内、30秒間隔
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
[feedback-fetch が反応を収集]
       ↓
[Z-Score 計算]  ← views 未取得時は upvotes のみで計算
       ↓
[hook_candidates に昇格]  ← upvotes >= 5 AND unified_score > 0.5
       ↓
[高評価 Nudge がアプリ内にも展開]
       ↓
[より多くの人の苦しみが軽減される]
       ↓
[苦しみ検出に戻る（循環）]
```

### 8.2 完成基準

| # | 基準 | 検証方法 | 状態 |
|---|------|---------|------|
| 1 | OpenClaw が VPS で 24/7 稼働 | `systemctl status openclaw` → active | ✅ |
| 2 | Moltbook にエージェント認証済み | プロフィールページアクセス可能 | ✅ |
| 3 | s/sangha Submolt 作成済み | `moltbook.com/s/sangha` アクセス可能 | ❌ |
| 4 | moltbook-responder がオプトイン投稿に返信 | **テスト投稿 → 返信を目視確認** | ❌ |
| 5 | moltbook-responder がレート制限を守る | 11件目の投稿は翌日キュー | ❌ |
| 6 | slack-reminder が #meeting に通知 | **実際に投稿されたことを目視確認** | ❌ |
| 7 | feedback-fetch が upvotes を収集 | DB の `agent_posts.upvotes` が更新 | ❌ |
| 8 | /api/agent/posts/recent が動作 | API テスト通過 | ❌ |
| 9 | Railway Staging にも TOKEN 設定 | 環境変数確認 | ❌ |

---

## 9. 動作確認テスト（具体的手順）

**「API を叩いて確認」ではなく「実際に投稿されたことを目視確認」が完了条件。**

### 9.1 Moltbook オプトイン投稿テスト

| 手順 | 内容 |
|------|------|
| 1 | s/sangha に「テスト：今日はつらい」と投稿 |
| 2 | 5分待機 |
| 3 | **Anicca の返信コメントが表示されていることを目視確認** |
| 4 | `agent_posts` テーブルにレコードが作成されていることを確認 |

### 9.2 Moltbook 非オプトイン拒否テスト

| 手順 | 内容 |
|------|------|
| 1 | s/sangha 以外の Submolt に「つらい」と投稿（@anicca-wisdom なし） |
| 2 | 5分待機 |
| 3 | **Anicca の返信がないことを確認**（オプトイン制約が動作） |

### 9.3 危機検出テスト

| 手順 | 内容 |
|------|------|
| 1 | s/sangha に「テスト：死にたい」と投稿 |
| 2 | 5分待機 |
| 3 | **返信に地域別リソース（いのちの電話等）が含まれていることを確認** |
| 4 | #agents に監査ログが投稿されていることを確認 |

### 9.4 Slack 通知テスト

| 手順 | 内容 |
|------|------|
| 1 | VPS で `openclaw skill run slack-reminder --test` を手動実行 |
| 2 | **#meeting にメッセージが投稿されていることを目視確認** |

### 9.5 feedback-fetch テスト

| 手順 | 内容 |
|------|------|
| 1 | VPS で `openclaw skill run feedback-fetch` を手動実行 |
| 2 | DB の `agent_posts.upvotes` が更新されていることを確認 |

### 9.6 /api/agent/posts/recent テスト

| 手順 | 内容 |
|------|------|
| 1 | `curl -H "Authorization: Bearer $TOKEN" https://anicca-proxy-production.up.railway.app/api/agent/posts/recent` |
| 2 | 200 + JSON レスポンスを確認 |

### 9.7 Z-Score 計算・hook_candidates 昇格テスト

| 手順 | 内容 |
|------|------|
| 1 | `agent_posts` に upvotes >= 5 のレコードを作成（またはテストで達成） |
| 2 | crossPlatformLearning.js の `unifiedScore` 計算を実行 |
| 3 | `unified_score > 0.5` の場合、`hook_candidates` に昇格することを確認 |

---

## 10. 外部ファイル参照

| ファイル | パス | 内容 |
|---------|------|------|
| **SOUL.md** | `.cursor/plans/ios/1.6.1/SOUL.md` | Anicca のペルソナ、危機対応、Moltbook 運用ポリシー |
| **secrets-1.6.1.md** | `.cursor/plans/ios/1.6.1/secrets-1.6.1.md` | VPS IP、認証情報の参照先 |
| **moltbook-responder** | VPS `/home/anicca/openclaw/skills/moltbook-responder/` | SKILL.md + index.js |
| **slack-reminder** | VPS `/home/anicca/openclaw/skills/slack-reminder/` | SKILL.md + index.js |
| **feedback-fetch** | VPS `/home/anicca/openclaw/skills/feedback-fetch/` | SKILL.md + index.js |

---

## 11. 残りタスク

| # | タスク | 意図 | 状態 |
|---|--------|------|------|
| **0** | **Codex レビュー（反復中）** | **To-Be 実現に不足がないか確認。ok: true まで反復** | 🔄 |
| 1 | Railway Staging に ANICCA_AGENT_TOKEN 設定 | Staging でテスト可能に | ❌ |
| 2 | s/sangha Submolt 作成 | 苦しみを共有する場所 | ❌ |
| 3 | slack-reminder を修正（前日21時 + 当日12:25、#meeting） | SOUL.md と整合 | ❌ |
| 4 | GET /api/agent/posts/recent 実装 | feedback-fetch が動作するため | ❌ |
| 5 | moltbook-responder にオプトイン制約を追加 | SOUL.md 準拠 | ❌ |
| 6 | 動作確認テスト（実際に投稿して目視確認） | 全体フローの確認 | ❌ |
| 7 | dev マージ | 本番デプロイ | ❌ |

---

## 12. Codex レビュー指示

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

## 13. 完了チェックリスト

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
| 12 | moltbook-responder オプトイン制約追加 | エージェント | ❌ |
| 13 | slack-reminder 配置 | エージェント | ✅ |
| 14 | slack-reminder 修正（#meeting + 前日通知） | エージェント | ❌ |
| 15 | feedback-fetch 配置 | エージェント | ✅ |
| 16 | GET /api/agent/posts/recent 実装 | エージェント | ❌ |
| 17 | **動作確認テスト（目視確認）** | エージェント | ❌ |
| 18 | **Codex レビュー ok: true** | エージェント | ❌ |
| 19 | dev マージ | ユーザー承認後 | ❌ |

---

## 14. 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成 |
| 2026-02-03 | Railway API 完了 |
| 2026-02-03 | As-Is / To-Be 形式に書き換え |
| 2026-02-03 09:15 | VPS セットアップ完了、Moltbook claim 完了 |
| 2026-02-03 09:30 | ロードマップ追加、知恵の生成プロセス追加 |
| 2026-02-03 11:40 | **Codex レビュー対応: Moltbook API 仕様・フォールバック追加、/api/agent/posts/recent 仕様追加、Slack 通知仕様詳細化、Moltbook 運用ポリシー追加、karma 保存仕様追加、テスト手順拡張** |
