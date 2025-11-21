import { fetchCustomerEntitlements } from '../../services/revenuecat/api.js';
import { applyRevenueCatEntitlement } from '../../services/revenuecat/webhookHandler.js';
import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const appUserId = (req.auth?.sub || (req.get('user-id') || '').toString().trim());
  if (!appUserId) return res.status(401).json({ error: 'user-id required' });
  const entitlements = await fetchCustomerEntitlements(appUserId).catch(() => ({}));
  await applyRevenueCatEntitlement(appUserId, entitlements);
  const state = await getEntitlementState(appUserId);
  return res.json({ entitlement: normalizePlanForResponse(state) });
}


