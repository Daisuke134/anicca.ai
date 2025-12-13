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
    // UX最優先: データが無い/一時的に失敗でもUIは出す（クライアント側で「真っ白/エラーのみ」を防止）
    const lang = (req.get('accept-language') || '').toString().toLowerCase().includes('ja') ? 'ja' : 'en';
    const todayInsight = lang === 'ja'
      ? 'データ連携は任意です。連携がなくてもTalkはいつでも使えます。'
      : 'Data integration is optional. You can always use Talk even without connected data.';
    return res.json({
      todayInsight,
      highlights: {
        wake: { status: 'ok', label: '' },
        screen: { status: 'ok', label: '' },
        workout: { status: 'ok', label: '' },
        rumination: { status: 'ok', label: '' }
      },
      futureScenario: {
        ifContinue: '',
        ifImprove: ''
      },
      timeline: []
    });
  }
});

export default router;

