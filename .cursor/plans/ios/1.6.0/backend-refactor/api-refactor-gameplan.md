# API リファクタリング ゲームプラン v5

**日付**: 2026-01-29（2026-02-01 v5 — 3並列レビュー指摘全件反映）
**対象**: `apps/api/src/` + `apps/landing/`
**ステータス**: 計画中（GATE 1 レビュー待ち）
**ブランチ**: dev → feature/backend-cleanup ワークツリーで実装

---

## 調査方法

サブエージェント計15並列で `apps/api/src/` 内の全ファイルを調査。各ファイルについて:
1. 何をしているか
2. 誰が import しているか（完全な呼び出しチェーン）
3. iOS アプリが実際にそのコードパスを呼ぶか
4. DEAD / ALIVE の判定と証拠

---

## 現状サマリー

| カテゴリ | ファイル数 | 状態 |
|---------|----------|------|
| iOS アクティブ（mobile/, nudge/, auth/apple, billing/revenuecat等） | ~25 | ✅ KEEP |
| Admin/TikTok Agent（admin/tiktok, admin/hookCandidates） | 2 | ✅ KEEP |
| Jobs アクティブ（generateNudges, monthlyCredits, aggregateTypeStats） | 4 | ✅ KEEP |
| Modules アクティブ（nudge, memory, insights, metrics, simulation） | ~10 | ✅ KEEP |
| **Stripe Desktop 残骸** | 7+ | ❌ DELETE |
| **Google OAuth Desktop 残骸** | 4 | ❌ DELETE |
| **MCP GCal 孤児** | 6 | ❌ DELETE |
| **parallel-sdk 全体（Desktop Agent フレームワーク）** | 17 | ❌ DELETE |
| **Claude services（parallel-sdk 依存）** | 2 | ❌ DELETE |
| **tools/ 全エンドポイント（parallel-sdk Worker 専用）** | ~12 | ❌ DELETE |
| **mcp-clients（tools/ 依存）** | 4 | ❌ DELETE |
| **MCP HTTP server + config** | 2 | ❌ DELETE |
| **proxy/claude（Desktop Agent 専用）** | 2 | ❌ DELETE |
| **preview/app（Desktop Agent プレビュー）** | 3 | ❌ DELETE |
| **Slack 全コード（iOS 未使用）** | 4+ | ❌ DELETE |
| **OpenAI Realtime 全コード（iOS Voice 削除済み）** | 3+ | ❌ DELETE |
| **Desktop/Web Realtime セッション** | 3+ | ❌ DELETE |
| **workerMemory（parallel-sdk 専用）** | 1 | ❌ DELETE |
| **envelope crypto（gcal 削除で孤児化）** | 1 | ❌ DELETE |
| **Dead utils** | 2 | ❌ DELETE |
| **One-time scripts** | 2 | ❌ DELETE |
| **未使用 npm パッケージ** | 13+ | ❌ DELETE |
| Desktop 参照混在ファイル（config, subscriptionStore 等） | 3 | ⚠️ CLEAN |
| Landing Desktop 残骸 | 4修正 + 3削除 | ⚠️ CLEAN/DELETE |

**合計削除**: ~70ファイル以上 + ~7,000行以上

---

## 深層監査で判明した事実

### Stripe は完全に死んでいる（確定）

| 証拠 | 詳細 |
|------|------|
| 過去の削除コミット | `3eb0372f` で一度削除済み。マージ事故で復活 |
| iOS からの呼び出し | ゼロ。iOS は RevenueCat/Superwall |
| Stripe webhook トリガー | なし |

### parallel-sdk は全体として死んでいる（確定）

| 証拠 | 詳細 |
|------|------|
| 目的 | Desktop Agent システム（ParentAgent → Worker → BaseWorker → Claude services） |
| iOS/cron/routes からの import | ゼロ |
| 依存チェーン | parallel-sdk → claude services → tools/ → mcp-clients/ 全て連鎖的に死亡 |

### Slack は iOS で一切使われていない（確定）

| 証拠 | 詳細 |
|------|------|
| iOS の Slack エンドポイント呼び出し | ゼロ（`grep -r "slack" routes/mobile/` = 0件） |
| slackTokens.supabase.js の使用元 | api/tools/web/slack.js（削除対象）、api/tools/sdk/claude-code.js（削除対象）、api/auth/slack/*（Desktop OAuth）、server.js（init のみ） |
| TikTok Agent の Slack 使用 | ゼロ（hookSelector, wisdomExtractor に Slack 参照なし） |
| 結論 | Slack OAuth + トークン管理 + ツール全て Desktop Agent 専用。iOS は一切使わない |

### OpenAI Realtime API は iOS で削除済み（確定）

| 証拠 | 詳細 |
|------|------|
| VoiceSessionController.swift | コミット `9aaa5306`（2026-01-20）で 1,184行削除 |
| VoIP Background Mode | Info.plist から削除済み（コミット `d880a024`、2025-11-27） |
| Maestro E2E テスト | `03-session-start.yaml` + `04-session-completion.yaml` 削除済み（コミット `fe23706f`） |
| iOS Config.swift | URL 定義だけ孤児として残存（呼び出しコードなし） |
| 結論 | サーバー側 realtime コードは完全に孤児。iOS クライアントが存在しない |

### @composio/*, @vercel/mcp-adapter は全て未使用（確定）

import/require ゼロ。

### /mcp/gcal は完全に孤児（確定・ユーザー確認済み）

呼び出し元ゼロ。

---

## Phase A: Dead Code 完全削除

### A-1: Stripe 課金コード全削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/api/billing/checkoutSession.js` | Stripe checkout — マージ事故で復活した死コード |
| 2 | `src/api/billing/portalSession.js` | Stripe portal — 呼び出し元ゼロ |
| 3 | `src/api/billing/webhookStripe.js` | Stripe webhook — トリガーなし |
| 4 | `src/routes/billing/checkout-session.js` | ルートマウント |
| 5 | `src/routes/billing/portal-session.js` | ルートマウント |
| 6 | `src/routes/billing/webhook/stripe.js` | ルートマウント |
| 7 | `src/services/stripe/` (全ファイル) | Stripe サービス層 |

**同時修正（サーバークラッシュ防止）**:

| # | ファイル | 作業 |
|---|---------|------|
| 8 | `src/routes/billing/index.js` | checkout-session, portal-session, webhook/stripe の import/マウント削除。RC のみ残す |
| 9 | `src/services/subscriptionStore.js` | `./stripe/client.js` import 削除、`ensureStripeCustomer()` / `recordStripeEvent()` / `updateSubscriptionFromStripe()` 削除、SQL 内 stripe 参照削除、`ENTITLEMENT_SOURCE.STRIPE` 削除 |

### A-2: Google OAuth Desktop 残骸削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/api/auth/google/oauth.js` | Desktop 専用 |
| 2 | `src/api/auth/google/callback.js` | Desktop 専用 |
| 3 | `src/api/auth/google/refresh.js` | Desktop 専用 |
| 4 | `src/routes/auth/google.js` | ルートマウント |

### A-3: MCP GCal 孤児削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/api/mcp/gcal/` (全ファイル) | 呼び出し元ゼロ |
| 2 | `src/routes/mcp/gcal/index.js` | ルートマウント |
| 3 | `src/services/googleTokens.js` | gcal 専用（自己参照のみ） |

### A-4: Slack 全コード削除（iOS 未使用）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/api/auth/slack/oauth-url.js` | Slack OAuth — iOS 未使用。Desktop Agent 専用 |
| 2 | `src/api/auth/slack/oauth-callback.js` | 同上 |
| 3 | `src/api/auth/slack/check-connection.js` | 同上 |
| 4 | `src/routes/auth/slack/index.js` | ルートマウント |
| 5 | `src/services/tokens/slackTokens.supabase.js` | Slack トークン管理 — tools/slack（削除）と auth/slack（削除）のみ使用 |

**同時修正**:

| # | ファイル | 作業 |
|---|---------|------|
| 6 | `src/server.js` | slackTokens import と `initDatabase()` 呼び出し削除 |

### A-5: OpenAI Realtime 全コード削除（iOS Voice 機能削除済み）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/services/openaiRealtimeService.js` | iOS の VoiceSessionController は 2026-01-20 に削除。呼び出し元なし |
| 2 | `src/routes/mobile/realtime.js` | 6エンドポイント全て iOS から呼ばれない（Config.swift に URL だけ残存、呼び出しコードなし） |
| 3 | `src/modules/realtime/contextSnapshot.js` | realtime.js と desktop proxy のみ使用 → 両方削除で孤児化 |

**同時修正**:

| # | ファイル | 作業 |
|---|---------|------|
| 4 | `src/routes/mobile/index.js` | realtime ルートの import/マウント削除 |
| 5 | iOS: `aniccaios/Config.swift` | 孤児 URL 定義（realtimeSessionURL, realtimeSessionStopURL）削除 |

### A-6: Desktop/Web Realtime セッション削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/routes/realtime/desktop.js` | Desktop リアルタイムセッション — iOS 未使用 |
| 2 | `src/routes/realtime/web.js` | Web リアルタイムセッション — iOS 未使用 |
| 3 | `src/api/proxy/realtime/desktopSession.js` | Desktop セッションプロキシ — iOS 未使用 |
| 4 | `src/api/proxy/realtime/webSession.js` | Web セッションプロキシ — iOS 未使用 |

**ディレクトリ確認**: `src/routes/realtime/` と `src/api/proxy/realtime/` が空になったらディレクトリごと削除。

### A-7: parallel-sdk 全削除（Desktop Agent フレームワーク）

| # | ファイル | 理由 |
|---|---------|------|
| 1-7 | `src/services/parallel-sdk/core/` (3ファイル) + `IPCProtocol.js` + `prompts/` (2ファイル) + `utils/PreviewManager.js` | Desktop Agent — import ゼロ |
| 8-17 | `src/services/parallel-sdk/config/instructions/` (5ファイル) + `config/profiles/` (5ファイル) | Worker 設定 |

**ディレクトリ全体を削除（17ファイル）**: `rm -rf src/services/parallel-sdk/`

### A-8: Claude services 削除（parallel-sdk 依存で死亡）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/services/claude/executorService.js` | parallel-sdk Worker からのみ呼ばれる |
| 2 | `src/services/claude/sessionManager.js` | 同上 |

**ディレクトリ全体を削除**: `rm -rf src/services/claude/`

### A-9: tools/ 全エンドポイント削除（Desktop Agent Worker 専用）

| # | ファイル | 理由 |
|---|---------|------|
| 1-6 | `src/routes/tools/` (6ファイル: news, search_exa, claude_code, slack, playwright, transcribe) | Worker のみ |
| 7-12 | `src/api/tools/` (web/news, web/search, web/browser, web/slack, sdk/claude-code, transcribe) | Worker のみ |

**ディレクトリ全体を削除**: `rm -rf src/routes/tools/ src/api/tools/`

### A-10: MCP clients + server 削除

| # | ファイル | 理由 |
|---|---------|------|
| 1-2 | `src/mcp/clients/` (exaClient, playwrightClient) | tools/ のみ使用 |
| 3-4 | `src/services/mcp-clients/` (exaClient, playwrightClient) | 同上（重複パス） |
| 5 | `src/mcp/servers/http/index.js` | Desktop Agent MCP サーバー |
| 6 | `src/api/mcp/config.js` | 空オブジェクト返すだけ（ルートファイルは存在しない） |

**ディレクトリ確認**: gcal + clients + servers + config.js 削除で `src/mcp/` が空 → ディレクトリごと削除。

### A-11: proxy/claude 削除（Desktop Agent 専用）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/routes/proxy/claude.js` | Claude API プロキシ — Desktop のみ |
| 2 | `src/api/proxy/claude.js` | 同上 |

**注意**: A-6 の realtime proxy 削除と合わせて `src/api/proxy/` と `src/routes/proxy/` が空になったらディレクトリごと削除。

### A-12: preview/app 削除（Desktop Agent プレビュー）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/routes/preview/app.js` | Desktop Agent のみ |
| 2 | `src/api/static/preview-app.js` | 同上 |
| 3 | `src/api/static/preview/[...path].js` | 同上 |

**ディレクトリ全体を削除**: `rm -rf src/routes/preview/ src/api/static/`

### A-13: workerMemory 削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/services/storage/workerMemory.js` | parallel-sdk 削除で孤児化 |

### A-14: envelope crypto 削除（gcal 削除で孤児化）

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/lib/crypto/envelope.js` | googleTokens.js からのみ使用 → gcal 削除で孤児化 |

### A-15: Dead utils 削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/utils/migrate-to-logger.js` | import ゼロ。CLI ワンタイムツール（既に実行済み） |
| 2 | `src/utils/errorHandler.js` | import ゼロ。ApiError クラスがあるが誰も使っていない |
| 3 | `src/utils/state.js` | gcal OAuth のみ使用 → A-3 削除で孤児化 |

### A-16: One-time scripts 削除

| # | ファイル | 理由 |
|---|---------|------|
| 1 | `src/scripts/backfill-user-types.js` | 実行済みマイグレーション |
| 2 | `src/scripts/initHookLibrary.js` | 実行済み初期データ投入 |

### A-17: 未使用 npm パッケージ削除

| # | パッケージ | 理由 | 確認 |
|---|-----------|------|------|
| 1 | `@composio/core` | import ゼロ | ✅ 確定 |
| 2 | `@composio/openai` | import ゼロ | ✅ 確定 |
| 3 | `@vercel/mcp-adapter` | import ゼロ | ✅ 確定 |
| 4 | `stripe` | Stripe 全コード削除 | ✅ 確定 |
| 5 | `@anthropic-ai/claude-code` | claude services + tools/claude_code 削除で不要 | ⚠️ grep |
| 6 | `@modelcontextprotocol/sdk` | mcp/ 全削除で不要 | ⚠️ grep |
| 7 | `playwright` | playwright MCP client 削除で不要 | ⚠️ grep |
| 8 | `@google-cloud/kms` | envelope.js のみ使用 → A-14 削除で不要 | ⚠️ grep |
| 9 | `exa-mcp-server` | mcp-clients/exaClient のみ使用 → A-10 削除で不要 | ⚠️ grep |
| 10 | `busboy` | tools/transcribe のみ使用 → A-9 削除で不要 | ⚠️ grep |
| 11 | `form-data` | tools/transcribe のみ使用 → A-9 削除で不要 | ⚠️ grep |
| 12 | `mime-types` | api/static/preview のみ使用 → A-12 削除で不要 | ⚠️ grep |
| 13 | `openai` | openaiRealtimeService 削除で不要かも | ⚠️ grep（generateNudges 等で使用の可能性） |

**注意**: ⚠️ は実装時に grep 確認必須。

### A-Landing: Landing Page クリーンアップ

#### Desktop 参照修正

| # | ファイル | 現状 | 修正後 |
|---|---------|------|--------|
| 1 | `app/billing/success/page.tsx` | "Return to the desktop app" | **ページ削除**（到達不可能） |
| 2 | `app/faq/page.tsx:17` | "macOS 10.15+" | iOS 対応情報に更新 |
| 3 | `app/tokushoho/page.tsx:42` | "macOSデスクトップアプリ" | "iOSアプリ" |
| 4 | `app/tokushoho/page.tsx:46` | "Apple Silicon搭載macOS向け" | "iOS向け" |
| 5 | `app/tokushoho/page.tsx:72` | "Desktopアプリで即時反映" | "iOSアプリで即時反映" |
| 6 | `app/tokushoho/page.tsx:76` | "Apple Silicon搭載のmacOS" | "iOS 17以降" |
| 7 | `app/tokushoho/page.tsx:80` | "Desktopアプリ「Upgrade to Pro」" | RC/Superwall 解約手順 |
| 8 | `app/support/en/page.tsx:65` | "both iOS and desktop (Mac)" | "iOS devices" |

#### 未使用コンポーネント + npm 削除

| # | ファイル/パッケージ | 理由 |
|---|-------------------|------|
| 1 | `components/ui/badge.tsx` | import ゼロ |
| 2 | `components/ui/button.tsx` | import ゼロ |
| 3 | `components/ui/separator.tsx` | import ゼロ |
| 4 | `@radix-ui/react-separator` | separator 削除で不要 |

---

## Phase B: Desktop 参照クリーンアップ（残存ファイル内の掃除）

### B-1: config/environment.js 大規模クリーンアップ

| # | 対象 | 作業 |
|---|------|------|
| 1 | `DESKTOP_MODE` | フラグ定義削除 |
| 2 | `BILLING_CONFIG` Stripe フィールド | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRODUCT_PRO`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_RETURN_URL`, `PORTAL_RETURN_URL` 削除 |
| 3 | `MODEL_CONFIG.CLAUDE_WORKER_DEFAULT_MODEL` | proxy/claude.js のみ → 削除 |
| 4 | `USE_PROXY` | claude/executorService.js のみ → 削除 |
| 5 | `DIRECTORIES.USER_DATA` | parallel-sdk のみ → 削除 |
| 6 | `API_KEYS.ANTHROPIC` | proxy/claude.js のみ → 削除 |
| 7 | `validateEnvironment()` | Stripe 関連警告削除 |
| 8 | `logEnvironment()` | Stripe/Desktop ログ行削除 |

### B-2: routes/index.js クリーンアップ

| # | 作業 |
|---|------|
| 1 | 削除ルートの `app.use()` マウント全除去（auth/google, auth/slack, tools/*, mcp/*, billing/stripe系, proxy/*, preview/*, realtime/desktop, realtime/web） |
| 2 | Desktop/Web 関連コメント削除 |
| 3 | 最終確認: 残るマウントが全て iOS/Admin/Cron アクティブ |

### B-3: server.js クリーンアップ

| # | 作業 |
|---|------|
| 1 | slackTokens import/init 削除 |
| 2 | Desktop/Agent 関連の起動ロジックがあれば削除 |

### B-4: package.json 整理

| # | 作業 |
|---|------|
| 1 | 削除パッケージの残存参照確認 |
| 2 | scripts セクションの Desktop 関連コマンド削除 |

---

## Phase C: Prisma スキーマ精査

**スコープ**: schema.prisma 編集 + `prisma generate` のみ。本番 DB 変更なし。

### 削除候補

| # | モデル/フィールド | 状態 | 作業 |
|---|-----------------|------|------|
| 1 | `stripeCustomerId` (User) | Stripe 削除で不要 | raw SQL grep → 削除可否 |
| 2 | `stripeSubscriptionId` (User) | 同上 | 同上 |
| 3 | `MobileAlarmSchedule` | コード参照ゼロ（pre-v0.3 レガシー） | 削除 |
| 4 | `HabitLog` | コード参照ゼロ（NudgeEvent/NudgeOutcome に置換済み） | 削除 |
| 5 | `MobileVoipToken` | VoIP は iOS Info.plist から削除済み | 削除 |
| 6 | `RealtimeUsageDaily` | Realtime 機能削除で不要 | grep 確認 → 削除可否 |
| 7 | `UsageSession` | Desktop セッション tracking のみ | grep 確認 → 削除可否 |
| 8 | `SensorAccessState` | Profile.metadata.sensorAccess に JSON で保存しており、このモデルは未使用 | 削除 |

**絶対禁止**: `prisma migrate dev`, `prisma db push`, `prisma migrate deploy`

---

## Phase D: バグ修正（調査で発見）

### D-1: feeling.js ルート BROKEN

| 項目 | 詳細 |
|------|------|
| 問題 | `routes/mobile/index.js` で `feelingRouter` を参照しているが、`routes/mobile/feeling.js` が存在しない |
| iOS 側 | Config.swift で `/mobile/feeling/start` と `/mobile/feeling/end` を定義 |
| 影響 | iOS が feeling エンドポイントを呼ぶとサーバーエラー |
| 対応 | 調査: iOS アプリが実際にこのエンドポイントを呼んでいるか確認。呼んでいなければ参照削除。呼んでいれば実装が必要（別チケット） |

---

## 実行順序と受け入れ条件

| ステップ | 作業 | 受け入れ条件 |
|---------|------|-------------|
| 1 | Phase A-1〜A-16（API Dead Code 大量削除） | `npm test` 全 PASS。routes/index.js に削除対象マウントなし |
| 2 | A-17（npm パッケージ削除） | `npm install` 成功。`npm test` PASS |
| 3 | A-Landing（Landing クリーンアップ） | `cd apps/landing && npm run build` 成功 |
| 4 | Phase B（Desktop 参照除去） | `npm test` PASS。`grep -r "DESKTOP_MODE\|STRIPE_SECRET\|platform.*desktop" src/` = 0件 |
| 5 | Phase C（Prisma 精査） | `npx prisma generate` 成功。`npm test` PASS |
| 6 | Phase D（バグ修正） | feeling ルート問題解決 |
| 7 | レビュー | サブエージェント並列レビュー ok |
| 8 | push | — |

---

## 残すファイル一覧（全ファイル、理由付き）

### routes/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `routes/index.js` | 全ルートのマウント | Express 起動に必須 |
| `routes/auth/apple.js` | Apple Sign-in 認証 | 旧ユーザーのログイン |
| `routes/auth/entitlement.js` | 匿名/認証済みユーザーの entitlement チェック | 新ユーザー（匿名）+ 旧ユーザー |
| `routes/auth/refresh.js` | JWT リフレッシュ | トークン更新 |
| `routes/auth/logout.js` | ログアウト | アカウント管理 |
| `routes/billing/index.js` | RevenueCat webhook + sync のマウント | iOS 課金 |
| `routes/billing/revenuecat-sync.js` | RC 手動同期 | 課金状態修正 |
| `routes/billing/webhook/revenuecat.js` | RC webhook | サブスク変更検知 |
| `routes/mobile/account.js` | アカウント削除 | GDPR 対応 |
| `routes/mobile/behavior.js` | 行動サマリー | iOS Behavior タブ |
| `routes/mobile/entitlement.js` | サブスク状態確認 | iOS 課金チェック |
| `routes/mobile/nudge.js` | Nudge trigger/feedback/today | iOS Nudge 通知コア |
| `routes/mobile/preReminder.js` | Notification Extension からの事前リマインダー | iOS 通知拡張 |
| `routes/mobile/profile.js` | プロフィール CRUD | iOS ユーザー設定 |
| `routes/mobile/userType.js` | ユーザータイプ（T1-T4）取得 | iOS パーソナライズ |
| `routes/mobile/index.js` | mobile ルートマウント | Express 構造 |
| `routes/nudge/generate.js` | LLM Nudge 生成（cron） | Railway cron job |
| `routes/admin/tiktok.js` | TikTok 投稿管理 | GitHub Actions TikTok Agent |
| `routes/admin/hookCandidates.js` | Hook 候補選定 | GitHub Actions |

### services/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `services/auth/appleService.js` | Apple ID トークン検証（JWKS） | 旧ユーザー認証 |
| `services/auth/refreshService.js` | リフレッシュトークン発行・ローテーション | JWT 認証基盤 |
| `services/auth/refreshStore.js` | リフレッシュトークン PostgreSQL 保存 | 認証基盤 |
| `services/mobile/userIdResolver.js` | UUID/apple_user_id → profiles.id マッピング | 全 mobile ルートで使用 |
| `services/mobile/profileService.js` | プロフィール保存・取得 | iOS プロフィール |
| `services/revenuecat/api.js` | RevenueCat API クライアント | iOS 課金 |
| `services/revenuecat/webhookHandler.js` | RC webhook 処理 | サブスク変更処理 |
| `services/revenuecat/virtualCurrency.js` | 仮想通貨（分単位）管理 | 月次クレジット付与 |
| `services/users/profileStore.js` | 外部ID → 内部UUID マッピング | Apple/Anonymous ユーザー作成 |
| `services/guestSessions.js` | 匿名ゲストセッション管理（30ターン、24h TTL） | 新ユーザー（匿名認証） |
| `services/hookSelector.js` | Thompson Sampling で Hook A/B テスト | TikTok Agent |
| `services/wisdomExtractor.js` | 高パフォーマンス Hook パターン抽出 | TikTok Agent |
| `services/userTypeService.js` | ユーザータイプ分類（T1-T4） | iOS + Nudge 生成 |
| `services/subscriptionStore.js` | サブスク状態管理（Stripe 参照は Phase B で除去） | iOS 課金確認 |

### modules/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `modules/insights/generateTodayInsight.js` | GPT で日次インサイト生成 | iOS Behavior タブ |
| `modules/memory/mem0Client.js` | Mem0 AI メモリ管理 | Nudge パーソナライズ |
| `modules/metrics/stateBuilder.js` | 行動メトリクスサマリー構築 | iOS Behavior タブ |
| `modules/nudge/features/stateBuilder.js` | Bandit モデル用特徴量エンコーディング | Nudge 選択 |
| `modules/nudge/policy/linTS.js` | Linear Thompson Sampling アルゴリズム | Nudge 最適化コア |
| `modules/nudge/policy/mentalBandit.js` | メンタル系 Nudge バンディット | Nudge 選択 |
| `modules/nudge/policy/wakeBandit.js` | 睡眠/起床系 Nudge バンディット | Nudge 選択 |
| `modules/nudge/reward/rewardCalculator.js` | Nudge 報酬計算 | バンディット学習 |
| `modules/simulation/futureScenario.js` | 未来シナリオ生成 | iOS Behavior タブ |

### jobs/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `jobs/generateNudges.js` | 日次 LLM Nudge 生成 | Railway cron（CRON_MODE=nudges） |
| `jobs/monthlyCredits.js` | 月次仮想通貨付与 | server.js setInterval |
| `jobs/nudgeHelpers.js` | Nudge 生成ヘルパー | generateNudges から使用 |
| `jobs/aggregateTypeStats.js` | ユーザータイプ別 Nudge 統計集計 | Railway cron（CRON_MODE=aggregate_type_stats） |

### middleware/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `middleware/extractUserId.js` | Bearer JWT からユーザーID抽出 | 全 mobile ルートで使用 |
| `middleware/requireAuth.js` | JWT 署名検証（member + guest 対応） | 認証必須エンドポイント |
| `middleware/requireInternalAuth.js` | INTERNAL_API_TOKEN 検証（timing-safe） | admin + nudge/generate |

### utils/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `utils/logger.js` | 統一ログシステム（レベル、色、タイムスタンプ、コンテキスト） | 18+ファイルから使用 |
| `utils/timezone.js` | タイムゾーンユーティリティ（Intl.DateTimeFormat） | Nudge/メトリクス計算 |
| `utils/jwt.js` | JWT HS256 署名 | auth/entitlement, refreshService, apple |

### lib/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `lib/db.js` | PostgreSQL プール管理・クエリ実行 | 17ファイルから使用（DB 基盤） |
| `lib/prisma.js` | PrismaClient シングルトン | 7ファイルから使用 |
| `lib/migrate.js` | DB マイグレーション実行 | server.js 起動時 |

### config/

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `config/environment.js` | 環境変数一元管理（Phase B でクリーンアップ） | 全体基盤 |

### その他

| ファイル | 何をしている | なぜ必要 |
|---------|------------|---------|
| `server.js` | Express サーバーエントリポイント | 起動に必須 |
| `prisma/schema.prisma` | DB スキーマ定義 | Prisma 必須 |

---

## やらないこと（境界）

| 項目 | 理由 |
|------|------|
| 上記「残すファイル一覧」の変更（Phase B/C のクリーンアップ対象を除く） | 全て iOS/Admin/Cron アクティブ |
| `apps/landing/` の構造変更 | テキスト修正 + 未使用コンポーネント削除のみ |
| 本番 DB のテーブル/カラム削除 | schema.prisma 編集 + generate のみ |

---

## 1.6.0-one-buddha との依存関係

| パッケージ | backend-cleanup | one-buddha | 衝突 |
|-----------|----------------|------------|------|
| `@openai/agents` | — | ^0.4.4 | なし |
| `openai` | 削除かも | ^6.17.0 | ⚠️ grep 確認（generateNudges で使用の可能性） |
| `@composio/*` | 削除 | 不使用 | なし |
| `stripe` | 削除 | 不使用 | なし |

**マージ順序**: backend-cleanup → one-buddha。削除を先に。

---

## 予想される削除量

| Phase | 削除ファイル数 | 削除行数（推定） |
|-------|-------------|----------------|
| A-1〜A-3 (Stripe/Google/GCal) | ~17 | ~2,000 |
| A-4 (Slack) | ~5 | ~400 |
| A-5〜A-6 (Realtime) | ~7 | ~1,200 |
| A-7〜A-12 (Desktop Agent 系) | ~40+ | ~3,500+ |
| A-13〜A-16 (Dead utils/scripts) | ~5 | ~400 |
| A-17 (npm packages) | — | package.json |
| A-Landing | 4削除 + 3修正 | ~200 |
| Phase B | 3ファイル修正 | ~300 |
| Phase C (Prisma) | 8モデル/フィールド | ~100 |
| **合計** | **~70+ファイル削除 + ~6修正** | **~8,000+行** |

---

## リスク管理

| リスク | 対策 |
|--------|------|
| Stripe 削除でクラッシュ | subscriptionStore.js + billing/index.js を同時修正（A-1 で明記） |
| Slack 削除で Worker 破壊 | parallel-sdk 自体が死コード。Worker は存在しない |
| Realtime 削除で iOS 破壊 | iOS VoiceSessionController は 2026-01-20 に削除済み。Config.swift の孤児 URL も同時削除 |
| npm パッケージ誤削除 | ⚠️ マークは実装時 grep 必須 |
| Prisma モデル削除 | generate のみ。DB カラム残置 |

### ロールバック・監視

| 項目 | 方法 |
|------|------|
| ロールバック | `git revert` Phase 単位。Railway 自動再デプロイ |
| 監視: API 5xx | Railway ログ 30 分間 |
| 監視: iOS | `/mobile/*`, `/auth/apple/*`, `/billing/revenuecat/*`, `/nudge/generate` 正常応答確認 |
| 監視: Landing | Netlify 主要ページ 404 確認 |
| 判断基準 | 5xx 1% 超 → 即 revert |
