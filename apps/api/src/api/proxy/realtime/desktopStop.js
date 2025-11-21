import logger from '../../../utils/logger.js';
import requireAuth from '../../../middleware/requireAuth.js';
import {
  getEntitlementState,
  finishUsageSessionAndBill,
  normalizePlanForResponse
} from '../../../services/subscriptionStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    const minutes = await finishUsageSessionAndBill(auth.sub, session_id);
    const state = await getEntitlementState(auth.sub);
    return res.json({
      minutes_billed: minutes,
      entitlement: normalizePlanForResponse(state)
    });
  } catch (err) {
    logger.error(`desktop-stop error: ${err?.message || String(err)}`);
    return res.status(500).json({ error: 'desktop-stop internal error', message: err?.message || String(err) });
  }
}

