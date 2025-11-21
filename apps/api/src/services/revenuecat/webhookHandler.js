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
  const entitlement = entitlements[BILLING_CONFIG.REVENUECAT_ENTITLEMENT_ID];
  
  // V2 API対応: expires_at（タイムスタンプ）とexpires_date（ISO文字列）の両方に対応
  let expiresDate = null;
  if (entitlement?.expires_at) {
    // タイムスタンプ（ミリ秒）の場合
    expiresDate = typeof entitlement.expires_at === 'number' 
      ? new Date(entitlement.expires_at) 
      : new Date(entitlement.expires_at);
  } else if (entitlement?.expires_date) {
    expiresDate = new Date(entitlement.expires_date);
  }
  
  // is_activeの判定（V2ではactive_entitlementsに含まれている = 有効）
  const isActive = entitlement?.is_active === true || 
                   (expiresDate && expiresDate > new Date());
  const isTrial = entitlement?.period_type === 'trial';
  const status = isActive ? (isTrial ? 'trialing' : 'active') : 'expired';
  
  const payload = {
    user_id: userId,
    // 方針: 有効期間中はpro、期限切れ/未購読はfree（即時free化は行わない）
    plan: isActive ? 'pro' : 'free',
    status,
    current_period_end: expiresDate ? expiresDate.toISOString() : null,
    entitlement_source: ENTITLEMENT_SOURCE.REVENUECAT,
    revenuecat_entitlement_id: BILLING_CONFIG.REVENUECAT_ENTITLEMENT_ID,
    revenuecat_original_transaction_id: entitlement?.original_transaction_id || null,
    entitlement_payload: entitlement ? JSON.stringify(entitlement) : null,
    updated_at: new Date().toISOString()
  };
  
  logger.info('[RevenueCat] Applying entitlement', { 
    userId, 
    plan: payload.plan, 
    status: payload.status,
    expiresDate: payload.current_period_end,
    hasEntitlement: !!entitlement
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


