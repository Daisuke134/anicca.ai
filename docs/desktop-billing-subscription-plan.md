# デスクトップ課金機能実装計画（2025年版）

## 目的
Anicca Desktopアプリに月額課金機能（Proプラン：USD 5/月）を導入し、課金によって解放される高負荷/高付加価値機能をセキュアに提供する。Supabase認証を継続活用しつつ、Stripe Billingによる定期課金とRailway上のProxy APIを組み合わせ、シンプルかつ拡張性の高い構成を実現する。

## 全体アーキテクチャ
- **認証**: Supabase Auth（PKCE + 公開鍵）。DesktopアプリはSupabaseの`sb_publishable_...`キーを埋め込み、OAuthセッション情報を暗号化して保存。
- **課金**: Stripe Billing（Product/Price/Subscription + Customer Portal）。stagingはStripe Sandbox、productionはLiveモードで運用。
- **バックエンド**: Railway上の`apps/api`がStripe API/WebhookとSupabase Edge Functionを仲介し、`user_subscriptions`テーブルでプラン状態を管理。
- **エンタイトルメント**: Proxy JWT発行時にSupabaseからプラン情報を読み、`plan`属性を`free/pro/grace`で返却。Desktopはこの値で機能制御。
- **将来拡張**: 追加プラン、使用量ベース、アドオン、チーム共有などに備えたテーブル設計とイベント駆動更新を採用。

## Supabase設計
1. **鍵管理**
   - Desktop: `sb_publishable`キーを埋め込み（既存`anon`キーはローテーションして失効）。
   - Proxy/API: `SUPABASE_SERVICE_ROLE_KEY`をRailway環境変数で管理。ローテーション手順をRunbook化。
2. **テーブル**
   - `user_subscriptions`
     - `user_id` (PK, references `auth.users.id`)
     - `stripe_customer_id`
     - `stripe_subscription_id`
     - `plan` (`free`/`pro`/`grace`)
     - `status` (`active`/`trialing`/`past_due`/`canceled`)
     - `current_period_end` (timestamp)
     - `trial_end` (timestamp, nullable)
     - `metadata` (jsonb)
     - `updated_at` (timestamp)
   - RLS: `service_role`のみ書き込み可。ユーザーは自分の行のみ読み込み可（Desktopでステータス表示）。
3. **Edge Function (例: `stripe-sync`)**
   - 入力: StripeイベントJSON。
   - 処理: WebhookからQueue経由で呼び出し、`user_subscriptions`をUPSERT。
   - ログ: StripeイベントIDとSupabase更新結果を記録。

## Stripe設定
1. **Product/Price**
   - Product: `Anicca Pro`
   - Price: `price_pro_monthly_usd`（USD 5、interval=month、trial期間7日）
2. **環境**
   - `Stripe Sandbox` → Railway staging
   - `Stripe Live` → Railway production
   - 各環境で以下を登録:
     - Secret Key (`STRIPE_SECRET_KEY`)
     - Publishable Key (`STRIPE_PUBLISHABLE_KEY`)
     - Webhook Signing Secret (`STRIPE_WEBHOOK_SECRET`)
     - Price ID (`STRIPE_PRICE_PRO_MONTHLY`)
3. **Webhook**
   - 対象イベント: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Railway API: `/api/billing/webhook/stripe`
   - 署名検証: `stripe.webhooks.constructEvent`で`STRIPE_WEBHOOK_SECRET`を検証。
4. **Customer Portal**
   - URL設定 → `return_url`はDesktop設定画面のディープリンク（例: `anicca://billing/success`）とブラウザ用フォールバック。
   - Allowed features: 支払い方法更新、請求履歴確認、キャンセル。

## Proxy/API 実装方針（`apps/api`）
1. **ルーター追加**: `/api/billing`
   - `POST /checkout-session`
     - 入力: ユーザーBearer（Proxy JWT）
     - 処理: `requireAuth` → Supabaseから`stripe_customer_id`取得/作成 → `stripe.checkout.sessions.create`
     - 出力: Checkout URL
   - `POST /portal-session`
     - 入力: 同上
     - 処理: Stripe Customer Portalセッション生成
     - 出力: Portal URL
   - `POST /webhook/stripe`
     - 入力: Stripe Webhook
     - 処理: 署名検証 → イベント種別毎にEdge Function呼び出し（または直接Supabase更新） → 200応答
2. **サービス層**
   - `services/stripe/client.ts`: Stripe SDK初期化。
   - `services/stripe/subscription.ts`: Customer/Subscriptionのヘルパー。
   - `services/subscriptionStore.ts`: Supabase更新ラッパ。
3. **エンタイトルメント更新** (`api/auth/entitlement.js`)
   - Supabaseから`plan/status/current_period_end`取得。
   - JWTペイロード: `{ sub, email, plan, status, exp }`
   - `plan`は`status`に応じて`pro`/`grace`/`free`に割当。
4. **レート制御**
   - `middleware/requireAuth`でplan情報を`req.auth`に格納。
   - 高コストAPI（Slack送信、Playwright等）は`plan !== 'pro'`でHTTP 402を返却。
   - Realtime利用回数はRedis or Supabase `usage_logs`で集計（将来実装）。

## Desktop側対応（`apps/desktop`）
1. **状態管理**
   - `DesktopAuthService`に`currentPlan`/`planExpiresAt`フィールドを追加。
   - `getProxyJwt`レスポンスの`plan/status`を保持し、アプリ全体で参照可能に。
2. **UI**
   - 設定画面に「現在のプラン」「請求更新」ボタン追加。
   - 無料ユーザーが制限超過時にモーダル（アップグレード導線付き）を表示。
   - Checkout/Portalは外部ブラウザ起動（`shell.openExternal`）。
3. **制御ロジック**
   - Realtimeセッション開始前に`currentPlan`チェック。
   - 無料ユーザーのAPI呼び出し回数をアプリ内で計測し、閾値（例: 日次30リクエスト）超過時はProxy呼び出しを止める。

## セキュリティ/運用
- Stripeキー/Webhook秘密はRailwayの`Variable Groups`でstagingとproductionを分離管理。
- Supabase Service RoleキーはEdge Functionでのみ使用。ProxyサーバーはEdge Function経由でサブスクリプションを更新。
- Webhook処理は冪等ID（`event.id` + Stripe `Idempotency-Key`）で二重処理防止。
- 失敗時のフォールバック: `invoice.payment_failed`受信 → Supabase `status=grace` → Proxy JWTで`plan=grace` → Desktopに支払い更新案内。
- ログ:
  - Stripeイベント → Supabase `subscription_events`テーブル
  - Proxy JWT発行 → 30分TTLでメモリ保持（再発行時にPlan差異を確認）
- 監査: 月次で`user_subscriptions`とStripeダッシュボードの照合スクリプトを実行。

## ロードマップ
1. **準備**（Day 0-2）
   - Stripe Sandbox構築、Supabaseテーブル作成、鍵ローテーション。
2. **実装**（Day 3-7）
   - Proxy/APIのBillingルーター実装
   - Desktop UI/状態管理更新
   - Edge Function & Webhook連携
3. **QA**（Day 8-10）
   - Stripe CLIでイベントテスト
   - Desktopで無料→有料→キャンセルまでのE2E
   - 異常系（支払い失敗、Webhook遅延）検証
4. **リリース**（Day 11-14）
   - staging → productionへStripe設定コピー
   - Featureフラグで段階的公開
   - リリースノート/LP更新

## テスト項目サマリ
- Checkout成功/キャンセル/支払い失敗のハンドリング
- Supabase `user_subscriptions`が正しく更新されるか
- Proxy JWTに反映された`plan`で機能制限が動作するか
- Desktopアプリ再起動後もプラン状態が持続するか
- Stripe Customer Portalからのキャンセル → `status=canceled` → アプリ制限を確認

## 未決事項
- 使用量レポートのストレージ手段（Supabase vs 外部）
- チームプラン/年額プランのSKU設計
- 税務（Stripe Tax）を導入する時期と対応地域


---

## 実装ノート（2025-02-XX）
- Proxy 側に `/api/billing/checkout-session` `/api/billing/portal-session` `/api/billing/webhook/stripe` を追加。Stripe SDK で Checkout/Portal を作成し、Webhook は `stripe.webhooks.constructEvent` で署名検証。
- Supabase テーブルは `user_subscriptions` (既存), `realtime_usage_daily`, `subscription_events` を利用。`FREE_DAILY_LIMIT` 環境変数で無料枠を制御し、HTTP 402 を返すことでデスクトップへ課金導線を提示。
- Entitlement API (`/api/auth/entitlement`) で `plan`, `status`, `daily_usage_limit`, `daily_usage_remaining` を JWT とレスポンスに封入。Proxy JWT の検証で同情報を参照し、Realtime セッション発行前に残枠を判定。
- デスクトップは `DesktopAuthService` がプラン状態を保持し、トレイメニューに「現在のプラン」「Upgrade」「Manage Subscription」を表示。402 受信時は通知し、Stripe Hosted Checkout/Portal をブラウザで開く。
- 新規環境変数: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRODUCT_PRO`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_RETURN_URL`, `PORTAL_RETURN_URL`, `PRO_PLAN_MONTHLY_USD`, `FREE_DAILY_LIMIT`。Railway (staging/production) で設定済み。
- ランディング (`apps/landing/billing/*`) に Checkout/Portal 戻り先の案内ページを追加。Netlify デプロイ時に自動で公開される。
