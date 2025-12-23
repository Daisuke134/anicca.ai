import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight } from '../../modules/metrics/stateBuilder.js';
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
import { PrismaClient } from '../../generated/prisma/index.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileBehavior');
const prisma = new PrismaClient();

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

    // Calculate streaks from recent daily_metrics
    const streaks = await calculateStreaks(userId);
    
    return res.json({
      todayInsight,
      highlights,
      futureScenario,
      timeline,
      streaks
    });
  } catch (e) {
    logger.error('Failed to build behavior summary', e);
    // UX最優先: データが無い/一時的に失敗でもUIは出す（クライアント側で「真っ白/エラーのみ」を防止）
    const lang = (req.get('accept-language') || '').toString().toLowerCase().includes('ja') ? 'ja' : 'en';
    const todayInsight = lang === 'ja'
      ? 'データ連携は任意です。連携がなくてもTalkはいつでも使えます。'
      : 'Data integration is optional. You can always use Talk even without connected data.';
    
    // v3: futureScenarioのフォールバックを空にしない
    const fallbackFuture = lang === 'ja'
      ? { ifContinue: '十分なデータがありません', ifImprove: '十分なデータがありません' }
      : { ifContinue: 'Not enough data available', ifImprove: 'Not enough data available' };
    
    return res.json({
      todayInsight,
      highlights: {
        wake: { status: 'ok', label: '' },
        screen: { status: 'ok', label: '' },
        workout: { status: 'ok', label: '' },
        rumination: { status: 'ok', label: '' }
      },
      futureScenario: fallbackFuture,
      timeline: [],
      streaks: { wake: 0, screen: 0, workout: 0, rumination: 0 }
    });
  }
});

async function calculateStreaks(userId) {
  try {
    // Get last 30 days of metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const metrics = await prisma.dailyMetric.findMany({
      where: {
        userId,
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'desc' }
    });
    
    // Calculate consecutive days for each category
    let wake = 0, screen = 0, workout = 0, rumination = 0;
    
    for (const m of metrics) {
      // Wake streak: has wakeAt recorded
      if (m.wakeAt) wake++;
      else break;
    }
    
    // Reset and calculate screen streak
    for (const m of metrics) {
      if (m.snsMinutesTotal !== null && m.snsMinutesTotal < 180) screen++;
      else break;
    }
    
    // Workout streak: steps >= 5000
    for (const m of metrics) {
      if (m.steps !== null && m.steps >= 5000) workout++;
      else break;
    }
    
    // Rumination streak: check mindSummary for low rumination
    for (const m of metrics) {
      // mindSummary is JSON, extract rumination value if exists
      const ruminationValue = m.mindSummary?.rumination;
      if (typeof ruminationValue === 'number' && ruminationValue < 0.5) rumination++;
      else break;
    }
    
    return { wake, screen, workout, rumination };
  } catch (e) {
    logger.warn('Failed to calculate streaks', e);
    return { wake: 0, screen: 0, workout: 0, rumination: 0 };
  }
}

export default router;

