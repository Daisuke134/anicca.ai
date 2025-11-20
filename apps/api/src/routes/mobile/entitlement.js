import express from 'express';
import baseLogger from '../../utils/logger.js';
import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileEntitlement');

// GET /api/mobile/entitlement
router.get('/', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = (req.get('user-id') || '').toString().trim();
  
  if (!deviceId) {
    logger.warn('Missing deviceId for entitlement request');
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  if (!userId) {
    logger.warn('Missing userId for entitlement request');
    return res.status(401).json({ error: 'user-id is required' });
  }

  try {
    const state = await getEntitlementState(userId);
    return res.json({ entitlement: normalizePlanForResponse(state) });
  } catch (error) {
    logger.error('Failed to get entitlement', error);
    return res.status(500).json({ error: 'failed_to_get_entitlement' });
  }
});

export default router;


