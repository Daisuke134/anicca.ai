import { fetchCustomerEntitlements } from '../../services/revenuecat/api.js';
import { applyRevenueCatEntitlement, getEntitlementState, normalizePlanForResponse } from '../../services/revenuecat/webhookHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = req.auth;
  const appUserId = auth.sub;
  const entitlements = await fetchCustomerEntitlements(appUserId);
  await applyRevenueCatEntitlement(appUserId, entitlements);
  const state = await getEntitlementState(appUserId);
  return res.json({ entitlement: normalizePlanForResponse(state) });
}


