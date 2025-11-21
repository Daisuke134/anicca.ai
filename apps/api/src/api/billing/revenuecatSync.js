import { fetchCustomerEntitlements } from '../../services/revenuecat/api.js';
import { applyRevenueCatEntitlement } from '../../services/revenuecat/webhookHandler.js';
import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const appUserId = (req.auth?.sub || (req.get('user-id') || '').toString().trim());
  if (!appUserId) return res.status(401).json({ error: 'user-id required' });
  
  try {
    const entitlements = await fetchCustomerEntitlements(appUserId);
    await applyRevenueCatEntitlement(appUserId, entitlements);
    // 同期後に再度取得して確実に反映
    const state = await getEntitlementState(appUserId);
    return res.json({ entitlement: normalizePlanForResponse(state) });
  } catch (error) {
    // エラー時も現在の状態を返す（フォールバック）
    const state = await getEntitlementState(appUserId);
    return res.json({ entitlement: normalizePlanForResponse(state) });
  }
}


