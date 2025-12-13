import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight } from '../../modules/metrics/stateBuilder.js';
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileBehavior');

// GET /api/mobile/behavior/summary
router.get('/summary', async (req, res) => {
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

    return res.json({
      todayInsight,
      highlights,
      futureScenario,
      timeline
    });
  } catch (e) {
    logger.error('Failed to build behavior summary', e);
    return res.status(500).json({ error: 'failed_to_get_behavior_summary' });
  }
});

export default router;

