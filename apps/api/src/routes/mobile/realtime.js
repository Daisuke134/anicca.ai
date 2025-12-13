import express from 'express';
import crypto from 'crypto';
import { issueRealtimeClientSecret } from '../../services/openaiRealtimeService.js';
import baseLogger from '../../utils/logger.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import {
  getEntitlementState,
  startUsageSession,
  finishUsageSessionAndBill,
  normalizePlanForResponse,
  canUseRealtime
} from '../../services/subscriptionStore.js';
import extractUserId from '../../middleware/extractUserId.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileRealtime');

router.get('/session', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    // 利用制限チェック（分ベース）
    const entitlement = await getEntitlementState(userId);
    if (!canUseRealtime(entitlement.plan, entitlement.usageRemaining)) {
      logger.warn('Quota exceeded for user', { userId, plan: entitlement.plan, remaining: entitlement.usageRemaining });
      return res.status(402).json({
        error: 'quota_exceeded',
        message: '月の使用上限に達しました',
        entitlement: normalizePlanForResponse(entitlement)
      });
    }

    // セッションID払い出し＆開始記録
    const sessionId = crypto.randomUUID();
    await startUsageSession(userId, sessionId);
    
    // 再取得して最新の状態を返す
    const updatedEntitlement = await getEntitlementState(userId);
    const [payload, contextSnapshot] = await Promise.all([
      issueRealtimeClientSecret({ deviceId, userId }),
      buildContextSnapshot({ userId, deviceId })
    ]);
    
    return res.json({
      ...payload,
      session_id: sessionId,
      entitlement: normalizePlanForResponse(updatedEntitlement),
      context_snapshot: contextSnapshot
    });
  } catch (error) {
    logger.error('Failed to issue client_secret', error);
    return res.status(500).json({ error: 'failed_to_issue_client_secret' });
  }
});

// セッション終了フック（分計測→VCデビット）
router.post('/session/stop', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const { session_id } = req.body || {};
  
  if (!deviceId || !session_id) {
    return res.status(400).json({ error: 'bad_request' });
  }
  
  try {
    const minutes = await finishUsageSessionAndBill(userId, session_id);
    const state = await getEntitlementState(userId);
    return res.json({
      minutes_billed: minutes,
      entitlement: normalizePlanForResponse(state),
      context_snapshot: await buildContextSnapshot({ userId, deviceId })
    });
  } catch (error) {
    logger.error('Failed to stop session', error);
    return res.status(500).json({ error: 'failed_to_stop' });
  }
});

// Realtime tool endpoint: get_context_snapshot
// iOS parses tool_call and calls this endpoint, then forwards JSON back to OpenAI as tool output.
router.post('/tools/get_context_snapshot', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await buildContextSnapshot({ userId, deviceId });
    return res.json({ ok: true, context_snapshot: snapshot });
  } catch (e) {
    logger.error('Failed to build context snapshot', e);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to build context snapshot' }
    });
  }
});

export default router;
