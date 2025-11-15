import logger from '../../utils/logger.js';
import { BILLING_CONFIG } from '../../config/environment.js';
import { fetchCustomerEntitlements } from './api.js';
import { requireSupabase, normalizePlanForResponse, getEntitlementState } from '../subscriptionStore.js';

const RC_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION',
  'BILLING_ISSUE', 'CANCELLATION', 'EXPIRATION', 'PRODUCT_CHANGE'
]);

export async function applyRevenueCatEntitlement(userId, entitlements) {
  const entitlement = entitlements[BILLING_CONFIG.REVENUECAT_ENTITLEMENT_ID];
  const supabase = requireSupabase();
  const status = entitlement?.period_type === 'trial' ? 'trialing' : (entitlement?.unsubscribe_detected_at ? 'canceled' : 'active');
  const payload = {
    user_id: userId,
    plan: entitlement?.is_active ? 'pro' : 'free',
    status,
    current_period_end: entitlement?.expires_date || null,
    entitlement_source: 'revenuecat',
    revenuecat_entitlement_id: BILLING_CONFIG.REVENUECAT_ENTITLEMENT_ID,
    revenuecat_original_transaction_id: entitlement?.original_transaction_id || null,
    entitlement_payload: entitlement || null,
    updated_at: new Date().toISOString()
  };
  await supabase.from('user_subscriptions').upsert(payload, { onConflict: 'user_id' });
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


