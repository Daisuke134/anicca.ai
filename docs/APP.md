# 音声分課金（Virtual Currency）+ 即時同期 擬似パッチ完全版

## 概要/前提

- 使用量指標: 1セッションの合計秒数を分に切り上げ（61秒→2分）。
- 記録の正: Railway Postgres に原票（usage_sessions）を保存。
- 残高: RevenueCat Virtual Currency（VC）。無料30分/月、PRO 300分/月。
- 月額: RCの購入/更新/トライアル開始で自動付与（300/300）。
- 年額: VCに紐付けない（RC UIは0不可のため）。サーバ月次ジョブで毎月+300分を自動付与。
- 即時同期: Paywall/Customer Center閉鎖時に `syncPurchases()` → `/billing/revenuecat/sync` → `/mobile/entitlement`。
- 表示: 常に人間可読名（ID文字列は出さない）。
- 参照: Stripe従量課金の設計、RevenueCat×Stripe連携、Virtual Currency 公式。

## 環境変数（Railway）

- REVENUECAT_PROJECT_ID, REVENUECAT_REST_API_KEY, REVENUECAT_WEBHOOK_SECRET
- REVENUECAT_ENTITLEMENT_ID（例: pro）
- REVENUECAT_VC_CODE=anicca（VCのCodeと厳密一致）
- FREE_MONTHLY_LIMIT=30, PRO_MONTHLY_LIMIT=300（UI表示用）

## 環境（iOS）

- `Configs/*.xcconfig`: REVENUECAT_API_KEY, REVENUECAT_ENTITLEMENT_ID, REVENUECAT_PAYWALL_ID=anicca（Offering Identifier）, REVENUECAT_CUSTOMER_CENTER_ID

---

## 擬似パッチ（差分）

```diff
*** Add File: apps/api/docs/migrations/007_usage_sessions.sql
+ create table if not exists public.usage_sessions (
+   session_id text primary key,
+   user_id text not null,
+   started_at timestamptz not null default timezone('utc', now()),
+   ended_at timestamptz,
+   billed_seconds int default 0,
+   billed_minutes int default 0,
+   source text not null default 'realtime',
+   updated_at timestamptz not null default timezone('utc', now())
+ );
+ create index if not exists idx_usage_sessions_user_month
+   on public.usage_sessions (user_id, date_trunc('month', started_at));
```
```diff
*** Add File: apps/api/docs/migrations/008_monthly_vc_grants.sql
+ create table if not exists public.monthly_vc_grants (
+   user_id text not null,
+   grant_month date not null,
+   reason text not null check (reason in ('free', 'annual')),
+   minutes int not null,
+   granted_at timestamptz not null default timezone('utc', now()),
+   primary key (user_id, grant_month, reason)
+ );
+ create index if not exists idx_monthly_vc_grants_month on public.monthly_vc_grants (grant_month);
```
```diff
*** Add File: apps/api/src/services/revenuecat/virtualCurrency.js
+ import { fetch } from 'undici';
+ import baseLogger from '../../utils/logger.js';
+ const logger = baseLogger.withContext('RCVirtualCurrency');
+ const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;
+ const API_KEY    = process.env.REVENUECAT_REST_API_KEY;
+ export const VC_CURRENCY_CODE = process.env.REVENUECAT_VC_CODE || 'CREDIT';
+ 
+ function rcHeaders() {
+   if (!PROJECT_ID || !API_KEY) throw new Error('RevenueCat env not configured');
+   return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
+ }
+ 
+ export async function getBalance(appUserId, currency = VC_CURRENCY_CODE) {
+   const uid = encodeURIComponent(appUserId);
+   const url = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${uid}/virtual_currencies`;
+   const res = await fetch(url, { headers: rcHeaders() });
+   if (!res.ok) throw new Error(`RC balance failed: ${res.status}`);
+   const data = await res.json();
+   const item = (data.items || []).find((i) => i.currency_code === currency);
+   return Number(item?.balance ?? 0);
+ }
+ 
+ async function adjustMinutes({ appUserId, minutes, currency = VC_CURRENCY_CODE, context }) {
+   const uid = encodeURIComponent(appUserId);
+   const url = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${uid}/virtual_currencies/transactions`;
+   const body = JSON.stringify({ adjustments: { [currency]: minutes }, context: context || {} });
+   const res = await fetch(url, { method: 'POST', headers: rcHeaders(), body });
+   if (!res.ok) { const detail = await res.text().catch(()=>''); throw new Error(`RC adjust failed: ${res.status} ${detail}`); }
+   return true;
+ }
+ 
+ export async function grantMinutes({ appUserId, minutes, currency, context }) {
+   if (minutes <= 0) return true; logger.info('RC grant', { appUserId, minutes, currency: currency || VC_CURRENCY_CODE, context });
+   return adjustMinutes({ appUserId, minutes, currency, context });
+ }
+ 
+ export async function debitMinutes({ appUserId, minutes, currency, context }) {
+   if (minutes <= 0) return true; logger.info('RC debit', { appUserId, minutes, currency: currency || VC_CURRENCY_CODE, context });
+   return adjustMinutes({ appUserId, minutes: -Math.abs(minutes), currency, context });
+ }
```
```diff
*** Update File: apps/api/src/services/subscriptionStore.js
@@
-import { query } from '../lib/db.js';
+import { query } from '../lib/db.js';
+import { debitMinutes, VC_CURRENCY_CODE } from './revenuecat/virtualCurrency.js';
@@
-export async function incrementTodayUsage(userId) { /* 削除（回数制） */ }
+export async function startUsageSession(userId, sessionId) {
+  await ensureSubscriptionRow(userId);
+  await query(`insert into usage_sessions (session_id, user_id, started_at) values ($1,$2, timezone('utc', now())) on conflict (session_id) do nothing`, [sessionId, userId]);
+}
+
+export async function finishUsageSessionAndBill(userId, sessionId) {
+  const r = await query(`update usage_sessions set ended_at = timezone('utc', now()), billed_seconds = extract(epoch from timezone('utc', now()) - started_at), billed_minutes = ceil(extract(epoch from timezone('utc', now()) - started_at)/60.0)::int, updated_at = timezone('utc', now()) where session_id=$1 and user_id=$2 returning billed_minutes`, [sessionId, userId]);
+  const minutes = Number(r.rows[0]?.billed_minutes || 0);
+  if (minutes > 0) { await debitMinutes({ appUserId: userId, minutes, currency: VC_CURRENCY_CODE, context: { type: 'realtime', sessionId } }); }
+  return minutes;
+}
@@
-export async function getMonthlyUsage(userId) { /* realtime_usage_daily → usage_sessions */ }
+export async function getMonthlyUsage(userId) {
+  const r = await query(`select coalesce(sum(billed_minutes),0) as total from usage_sessions where user_id=$1 and started_at >= date_trunc('month', (now() at time zone 'utc'))`, [userId]);
+  return Number(r.rows[0]?.total || 0);
+}
```
```diff
*** Update File: apps/api/src/routes/mobile/realtime.js
@@
-import {
-  getEntitlementState,
-  incrementTodayUsage,
-  normalizePlanForResponse,
-  canUseRealtime
-} from '../../services/subscriptionStore.js';
+import { getEntitlementState, startUsageSession, finishUsageSessionAndBill, normalizePlanForResponse, canUseRealtime } from '../../services/subscriptionStore.js';
+import crypto from 'crypto';
@@
-    // 利用量をインクリメント（回数制）
-    await incrementTodayUsage(userId);
+    // セッションID払い出し＆開始記録
+    const sessionId = crypto.randomUUID();
+    await startUsageSession(userId, sessionId);
@@
-    return res.json({
-      ...payload,
-      entitlement: normalizePlanForResponse(updatedEntitlement)
-    });
+    return res.json({ ...payload, session_id: sessionId, entitlement: normalizePlanForResponse(updatedEntitlement) });
   } catch (error) { /* 既存 */ }
 });
+
+router.post('/session/stop', async (req, res) => {
+  const deviceId = (req.get('device-id') || '').toString().trim();
+  const userId = (req.get('user-id') || '').toString().trim();
+  const { session_id } = req.body || {};
+  if (!deviceId || !userId || !session_id) return res.status(400).json({ error: 'bad_request' });
+  try {
+    const minutes = await finishUsageSessionAndBill(userId, session_id);
+    const state = await getEntitlementState(userId);
+    return res.json({ minutes_billed: minutes, entitlement: normalizePlanForResponse(state) });
+  } catch (e) { return res.status(500).json({ error: 'failed_to_stop' }); }
+});
```
```diff
*** Add File: apps/api/src/jobs/monthlyCredits.js
+ import { query } from '../lib/db.js';
+ import baseLogger from '../utils/logger.js';
+ import { grantMinutes, VC_CURRENCY_CODE } from '../services/revenuecat/virtualCurrency.js';
+ const logger = baseLogger.withContext('MonthlyCredits');
+ const FREE_MIN = 30; const PRO_MIN = 300;
+ function monthStartUTC(d=new Date()){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
+ export async function runMonthlyCredits(now=new Date()){
+   const monthISO = monthStartUTC(now).toISOString().slice(0,10);
+   const freeTargets = await query(`select user_id from user_subscriptions where coalesce(plan,'free')='free' and not exists (select 1 from monthly_vc_grants g where g.user_id=user_subscriptions.user_id and g.grant_month=$1::date and g.reason='free')`, [monthISO]);
+   for (const r of freeTargets.rows){ await grantMinutes({ appUserId:r.user_id, minutes:FREE_MIN, currency:VC_CURRENCY_CODE, context:{ month:monthISO, reason:'free'}}); await query(`insert into monthly_vc_grants(user_id, grant_month, reason, minutes) values ($1,$2,'free',$3)`, [r.user_id, monthISO, FREE_MIN]); }
+   const annualTargets = await query(`select user_id from user_subscriptions where plan='pro' and entitlement_source='revenuecat' and (entitlement_payload->>'product_identifier')='ai.anicca.app.ios.annual' and (current_period_end is null or current_period_end>timezone('utc', now())) and not exists (select 1 from monthly_vc_grants g where g.user_id=user_subscriptions.user_id and g.grant_month=$1::date and g.reason='annual')`, [monthISO]);
+   for (const r of annualTargets.rows){ await grantMinutes({ appUserId:r.user_id, minutes:PRO_MIN, currency:VC_CURRENCY_CODE, context:{ month:monthISO, reason:'annual'}}); await query(`insert into monthly_vc_grants(user_id, grant_month, reason, minutes) values ($1,$2,'annual',$3)`, [r.user_id, monthISO, PRO_MIN]); }
+   logger.info('Monthly credits done', { freeGranted: freeTargets.rowCount, annualGranted: annualTargets.rowCount, monthISO });
+ }
```
```diff
*** Update File: apps/api/src/server.js
@@
 import { runMigrationsOnce } from './lib/migrate.js';
 // マイグレーション（初回のみ実行）
 await runMigrationsOnce();
+// 月次クレジット（UTC 00:05 付近で起動、当月未付与のみ実行）
+import { runMonthlyCredits } from './jobs/monthlyCredits.js';
+setInterval(async () => {
+  const now = new Date();
+  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
+    try { await runMonthlyCredits(now); } catch (e) { console.error('monthly credits failed', e); }
+  }
+}, 60_000);
```
```diff
*** Update File: apps/api/src/config/environment.js
@@
 export const BILLING_CONFIG = {
@@
-  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET || '',
+  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET || '',
   REVENUECAT_ENTITLEMENT_ID: process.env.REVENUECAT_ENTITLEMENT_ID || 'pro',
   REVENUECAT_PAYWALL_ID: process.env.REVENUECAT_PAYWALL_ID || '',
-  REVENUECAT_CUSTOMER_CENTER_ID: process.env.REVENUECAT_CUSTOMER_CENTER_ID || ''
+  REVENUECAT_CUSTOMER_CENTER_ID: process.env.REVENUECAT_CUSTOMER_CENTER_ID || '',
+  REVENUECAT_VC_CODE: process.env.REVENUECAT_VC_CODE || ''
 };
@@
-  console.log(`  - Pro monthly limit: ${BILLING_CONFIG.PRO_MONTHLY_LIMIT ?? 'unset'}`);
+  console.log(`  - Pro monthly limit: ${BILLING_CONFIG.PRO_MONTHLY_LIMIT ?? 'unset'}`);
+  console.log(`  - RC VC code: ${BILLING_CONFIG.REVENUECAT_VC_CODE || 'unset'}`);
```
```diff
*** Update File: aniccaios/aniccaios/Config.swift
@@
     static var realtimeSessionURL: URL {
         proxyBaseURL.appendingPathComponent("mobile/realtime/session")
     }
+    static var realtimeSessionStopURL: URL {
+        proxyBaseURL.appendingPathComponent("mobile/realtime/session/stop")
+    }
```
```diff
*** Update File: aniccaios/aniccaios/VoiceSessionController.swift
@@
-    private var cachedSecret: ClientSecret?
+    private var cachedSecret: ClientSecret?
+    private var activeSessionId: String?
@@
-        let payload = try JSONDecoder().decode(RealtimeSessionResponse.self, from: data)
+        let payload = try JSONDecoder().decode(RealtimeSessionResponse.self, from: data)
         sessionModel = "gpt-realtime"
         let secret = payload.clientSecretModel
         cachedSecret = secret
+        activeSessionId = payload.sessionId
         return secret
@@
     func stop() {
         logger.debug("Stopping realtime session")
+        Task { await self.notifyStopIfNeeded() }
         peerConnection?.close()
@@
+    private func notifyStopIfNeeded() async {
+        guard let sessionId = activeSessionId, case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+        var req = URLRequest(url: AppConfig.realtimeSessionStopURL)
+        req.httpMethod = "POST"
+        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+        req.httpBody = try? JSONSerialization.data(withJSONObject: ["session_id": sessionId])
+        _ = try? await URLSession.shared.data(for: req)
+        activeSessionId = nil
+    }
@@
 private struct RealtimeSessionResponse: Decodable {
@@
-    let model: String?
+    let model: String?
+    let sessionId: String?
 }
```
```diff
*** Update File: aniccaios/aniccaios/Services/SubscriptionManager.swift
@@
     func refreshOfferings() async { /* 既存 */ }
+
+    func syncNow() async {
+        _ = try? await Purchases.shared.syncPurchases()
+        guard case .signedIn(let credentials) = AppState.shared.authStatus else { return }
+        var req = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("billing/revenuecat/sync"))
+        req.httpMethod = "POST"
+        req.setValue(AppState.shared.resolveDeviceId(), forHTTPHeaderField: "device-id")
+        req.setValue(credentials.userId, forHTTPHeaderField: "user-id")
+        _ = try? await URLSession.shared.data(for: req)
+        var subscription = AppState.shared.subscriptionInfo
+        await syncUsageInfo(&subscription)
+        await MainActor.run { AppState.shared.updateSubscriptionInfo(subscription) }
+    }
```
```diff
*** Update File: aniccaios/aniccaios/SettingsView.swift
@@
-        .sheet(isPresented: $showingCustomerCenter) {
-            RevenueCatUI.CustomerCenterView()
-        }
+        .sheet(isPresented: $showingCustomerCenter, onDismiss: { Task { await SubscriptionManager.shared.syncNow() } }) {
+            RevenueCatUI.CustomerCenterView(customerCenterIdentifier: AppConfig.revenueCatCustomerCenterId)
+        }
@@
-    private func resolvedPlanLabel(for info: SubscriptionInfo) -> String {
-        if let name = info.planDisplayName, !name.isEmpty {
-            return name
-        }
-        switch info.productIdentifier {
-        case "ai.anicca.app.ios.annual":
-            return NSLocalizedString("subscription_plan_annual", comment: "")
-        case "ai.anicca.app.ios.monthly":
-            return NSLocalizedString("subscription_plan_monthly", comment: "")
-        default:
-            return NSLocalizedString("settings_subscription_pro", comment: "")
-        }
-    }
+    private func resolvedPlanLabel(for info: SubscriptionInfo) -> String {
+        if let name = info.planDisplayName, !name.isEmpty { return name }
+        if info.productIdentifier == "ai.anicca.app.ios.annual" { return NSLocalizedString("subscription_plan_annual", comment: "") }
+        if info.productIdentifier == "ai.anicca.app.ios.monthly" { return NSLocalizedString("subscription_plan_monthly", comment: "") }
+        return NSLocalizedString("settings_subscription_pro", comment: "")
+    }
```
```diff
*** Update File: aniccaios/aniccaios/Authentication/AuthCoordinator.swift
@@
-    func completeSignIn(result: Result<ASAuthorization, Error>) {
+    func completeSignIn(result: Result<ASAuthorization, Error>) {
         switch result {
         case .success(let authorization):
             handleAuthorization(authorization)
         case .failure(let error):
-            logger.error("Apple sign in failed: \(error.localizedDescription, privacy: .public)")
-            AppState.shared.setAuthStatus(.signedOut)
+            if case .signedIn = AppState.shared.authStatus { return }
+            logger.error("Apple sign in failed: \(error.localizedDescription, privacy: .public)")
+            AppState.shared.setAuthStatus(.signedOut)
         }
     }
```
```diff
*** Update File: aniccaios/Configs/Production.xcconfig
@@
-REVENUECAT_PAYWALL_ID = ofrng78a01eb506
+REVENUECAT_PAYWALL_ID = anicca
```

（Staging/Debug 側の xcconfig も同様に `REVENUECAT_PAYWALL_ID = anicca` を設定）

---

## 動作検証（必須）

1. 月額ユーザー: 購入/更新/トライアル開始後に VC +300、通話2分で 2 減少。
2. 年額ユーザー: RCにVC未紐付けでも、月初に +300 が自動加算。
3. 無料ユーザー: 月初に +30。
4. Paywall/Customer Center を閉じた瞬間に残高/表示が即更新。
5. 表示: ID文字列が一切出ず、常に人間可読。
6. Appleサインイン: 成功後の後着エラーで失敗遷移しない。

## 注意

- 年額は VC に 0 を設定できないため **Associated products へは紐付けない**。毎月付与はサーバジョブが実施。
- VC の Code（`REVENUECAT_VC_CODE`）は RC ダッシュボードの Code（`anicca`）と厳密一致。

### WebRTC を `WebRTC.xcframework` に置換（必須）

1) 既存の `WebRTC.framework` を Target から完全削除（Link/Embed から両方除去）

2) `aniccaios/scripts/setup-webrtc.sh` で取得した `WebRTC.xcframework` を

   Target > Frameworks, Libraries, and Embedded Content に追加し、Embed を「Embed & Sign」

3) Production 構成は本リポの `Configs/Production.xcconfig` により検索パスが自動解決

4) 派生データを全削除してクリーンビルド（下記コマンド参照）

これで `RTCMacros.h not found` / `could not build Objective‑C module 'WebRTC'` は解消します