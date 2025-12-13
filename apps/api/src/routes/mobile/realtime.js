import express from 'express';
import crypto from 'crypto';
import { issueRealtimeClientSecret } from '../../services/openaiRealtimeService.js';
import baseLogger from '../../utils/logger.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight } from '../../modules/metrics/stateBuilder.js';
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
import { getMem0Client } from '../../modules/memory/mem0Client.js';
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
        error: {
          code: 'QUOTA_EXCEEDED',
          message: '月の使用上限に達しました',
          details: {
            entitlement: normalizePlanForResponse(entitlement)
          }
        }
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
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to issue client_secret' } });
  }
});

// セッション終了フック（分計測→VCデビット）
router.post('/session/stop', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const { session_id } = req.body || {};
  
  if (!deviceId || !session_id) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'device-id and session_id are required' } });
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
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to stop session' } });
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

// Realtime tool endpoint: get_behavior_summary
router.post('/tools/get_behavior_summary', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await buildContextSnapshot({ userId, deviceId });
    const tz = snapshot?.timezone || 'UTC';
    const lang = snapshot?.language || 'en';
    const today = snapshot?.today_stats || null;

    const todayInsight = pickTodayInsight({ todayStats: today, language: lang });
    const highlights = buildHighlights({ todayStats: today, timezone: tz });
    const timeline = buildTimeline({ todayStats: today, timezone: tz });
    const futureScenario = await generateFutureScenario({
      language: lang,
      traits: snapshot?.traits || {},
      todayStats: today || {},
      now: new Date()
    });

    return res.json({ todayInsight, highlights, futureScenario, timeline });
  } catch (e) {
    logger.error('Failed to build behavior summary tool', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to build behavior summary' } });
  }
});

// Realtime tool endpoint: choose_nudge
router.post('/tools/choose_nudge', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const targetBehavior = String(req.body?.targetBehavior || '').trim();
  if (!targetBehavior) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'targetBehavior is required' } });
  }

  // Minimal mapping (v0.3): real policy lives in /mobile/nudge/*, but tool-call向けに決定だけ返す
  const key = targetBehavior.toLowerCase();
  let templateId = 'do_nothing';
  if (key.includes('sleep')) templateId = 'sleep_wind_down';
  else if (key.includes('sns') || key.includes('screen')) templateId = 'gentle_sns_break';
  else if (key.includes('exercise') || key.includes('movement')) templateId = 'walk_invite';
  else if (key.includes('mindfulness') || key.includes('rumination')) templateId = 'soft_self_compassion';

  return res.json({
    templateId,
    tone: 'normal',
    channel: 'notification',
    priority: 0.5
  });
});

// Realtime tool endpoint: log_nudge
router.post('/tools/log_nudge', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const templateId = String(req.body?.templateId || '').trim();
  const channel = String(req.body?.channel || 'realtime').trim();

  try {
    const mem0 = getMem0Client();
    await mem0.addNudgeMeta({
      userId,
      content: `Realtime nudge delivered: templateId=${templateId} channel=${channel}`.trim(),
      metadata: {
        templateId: templateId || null,
        channel,
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    logger.warn('log_nudge mem0 write failed', e);
  }

  return res.json({ ack: true });
});

export default router;
