import logger from '../../utils/logger.js';
import { BILLING_CONFIG } from '../../config/environment.js';
import { fetchCustomerEntitlements } from './api.js';
import { fetchSubscriptionRow, normalizePlanForResponse, getEntitlementState, ENTITLEMENT_SOURCE } from '../subscriptionStore.js';
import { query } from '../../lib/db.js';

const RC_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION',
  'BILLING_ISSUE', 'CANCELLATION', 'EXPIRATION', 'PRODUCT_CHANGE'
]);

export async function applyRevenueCatEntitlement(userId, entitlements) {
  // 設定されたEntitlement IDを確実に指定 (entlb820c43ab7)
  const targetId = BILLING_CONFIG.REVENUECAT_ENTITLEMENT_ID;
  const entitlement = entitlements[targetId];
  
  // 指定IDのEntitlementがあり、かつ有効か？
  if (!entitlement || !entitlement.is_active) {
    logger.info('[RevenueCat] No active entitlement found for target ID', { 
      userId, 
      targetId,
      availableIds: Object.keys(entitlements),
      hasEntitlement: !!entitlement,
      isActive: entitlement?.is_active
    });
    
    // Freeプラン適用
    const payload = {
      user_id: userId,
      plan: 'free',
      status: 'free',
      current_period_end: null,
      entitlement_source: ENTITLEMENT_SOURCE.REVENUECAT,
      revenuecat_entitlement_id: targetId,
      revenuecat_original_transaction_id: null, // V2 APIでは取得不可
      entitlement_payload: entitlement ? JSON.stringify(entitlement) : null,
      updated_at: new Date().toISOString()
    };
    
    await query(
      `insert into user_subscriptions
       (user_id, plan, status, current_period_end, entitlement_source, revenuecat_entitlement_id, revenuecat_original_transaction_id, entitlement_payload, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, timezone('utc', now()))
       on conflict (user_id)
       do update set
         plan=excluded.plan,
         status=excluded.status,
         current_period_end=excluded.current_period_end,
         entitlement_source=excluded.entitlement_source,
         revenuecat_entitlement_id=excluded.revenuecat_entitlement_id,
         revenuecat_original_transaction_id=excluded.revenuecat_original_transaction_id,
         entitlement_payload=excluded.entitlement_payload,
         updated_at=excluded.updated_at`,
      [
        payload.user_id, payload.plan, payload.status, payload.current_period_end,
        payload.entitlement_source, payload.revenuecat_entitlement_id, payload.revenuecat_original_transaction_id, payload.entitlement_payload
      ]
    );
    
    logger.info('[RevenueCat] Entitlement applied successfully (free)', { userId, plan: payload.plan });
    return;
  }
  
  // 有効なEntitlementが見つかった場合
  const expiresDate = entitlement.expires_at 
    ? new Date(entitlement.expires_at) // ミリ秒単位のタイムスタンプをDateに変換
    : null;
  
  const now = new Date();
  const isExpired = expiresDate != null && expiresDate <= now;
  const isActive = entitlement.is_active && !isExpired;
  
  // 注意: V2 APIのCustomerEntitlementにはperiod_typeが存在しないため、trial判定は不可
  // 必要に応じて別エンドポイント（subscriptions）から取得
  const status = isActive ? 'active' : 'expired';
  
  const payload = {
    user_id: userId,
    plan: isActive ? 'pro' : 'free',
    status,
    current_period_end: expiresDate ? expiresDate.toISOString() : null,
    entitlement_source: ENTITLEMENT_SOURCE.REVENUECAT,
    revenuecat_entitlement_id: targetId,
    revenuecat_original_transaction_id: null, // V2 APIでは取得不可（別エンドポイント必要）
    entitlement_payload: JSON.stringify(entitlement),
    updated_at: new Date().toISOString()
  };
  
  logger.info('[RevenueCat] Applying entitlement', { 
    userId, 
    plan: payload.plan, 
    status: payload.status,
    expiresDate: payload.current_period_end,
    isActive,
    isExpired,
    expiresAt: entitlement.expires_at
  });
  
  await query(
    `insert into user_subscriptions
     (user_id, plan, status, current_period_end, entitlement_source, revenuecat_entitlement_id, revenuecat_original_transaction_id, entitlement_payload, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, timezone('utc', now()))
     on conflict (user_id)
     do update set
       plan=excluded.plan,
       status=excluded.status,
       current_period_end=excluded.current_period_end,
       entitlement_source=excluded.entitlement_source,
       revenuecat_entitlement_id=excluded.revenuecat_entitlement_id,
       revenuecat_original_transaction_id=excluded.revenuecat_original_transaction_id,
       entitlement_payload=excluded.entitlement_payload,
       updated_at=excluded.updated_at`,
    [
      payload.user_id, payload.plan, payload.status, payload.current_period_end,
      payload.entitlement_source, payload.revenuecat_entitlement_id, payload.revenuecat_original_transaction_id, payload.entitlement_payload
    ]
  );
  
  logger.info('[RevenueCat] Entitlement applied successfully', { userId, plan: payload.plan, status: payload.status });
}

export async function processRevenueCatEvent(event) {
  const type = event?.event;
  if (!RC_EVENTS.has(type)) return;
  const appUserId = event?.app_user_id;
  if (!appUserId) return;
  const entitlements = await fetchCustomerEntitlements(appUserId);
  await applyRevenueCatEntitlement(appUserId, entitlements);
  logger.info('RevenueCat entitlement updated', { appUserId, type });
}

export { normalizePlanForResponse, getEntitlementState };


