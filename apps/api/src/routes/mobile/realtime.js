import express from 'express';
import { issueRealtimeClientSecret } from '../../services/openaiRealtimeService.js';
import baseLogger from '../../utils/logger.js';
import {
  getEntitlementState,
  incrementTodayUsage,
  normalizePlanForResponse,
  canUseRealtime
} from '../../services/subscriptionStore.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileRealtime');

router.get('/session', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = (req.get('user-id') || '').toString().trim();
  
  if (!deviceId) {
    logger.warn('Missing deviceId for client_secret request');
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  if (!userId) {
    logger.warn('Missing userId for client_secret request');
    return res.status(401).json({ error: 'user-id is required' });
  }

  try {
    // 利用制限チェック
    const entitlement = await getEntitlementState(userId);
    if (!canUseRealtime(entitlement.plan, entitlement.usageRemaining)) {
      logger.warn('Quota exceeded for user', { userId, plan: entitlement.plan, remaining: entitlement.usageRemaining });
      return res.status(402).json({
        error: 'quota_exceeded',
        message: '月の使用上限に達しました',
        entitlement: normalizePlanForResponse(entitlement)
      });
    }

    // 利用量をインクリメント
    await incrementTodayUsage(userId);
    
    // 再取得して最新の状態を返す
    const updatedEntitlement = await getEntitlementState(userId);
    const payload = await issueRealtimeClientSecret({ deviceId, userId });
    
    return res.json({
      ...payload,
      entitlement: normalizePlanForResponse(updatedEntitlement)
    });
  } catch (error) {
    logger.error('Failed to issue client_secret', error);
    return res.status(500).json({ error: 'failed_to_issue_client_secret' });
  }
});

export default router;
