import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();
const router = express.Router();
const logger = baseLogger.withContext('DailyMetrics');

// POST /api/mobile/daily_metrics
router.post('/', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const {
      date,
      sleep_minutes,
      steps,
      screen_time_minutes,
      sedentary_minutes,
      sleep_start_at,
      wake_at,
      sns_minutes_total,
      sns_minutes_night,
      activity_summary  // v3.1: 追加
    } = req.body;

    // Upsert daily_metrics for this user + date
    const parsedDate = new Date(date);
    const startOfDay = new Date(parsedDate.toISOString().split('T')[0] + 'T00:00:00Z');

    await prisma.dailyMetric.upsert({
      where: {
        userId_date: {
          userId,
          date: startOfDay
        }
      },
      update: {
        sleepDurationMin: sleep_minutes ?? null,
        steps: steps ?? 0,  // Prismaスキーマ: Int @default(0) なのでnull不可
        snsMinutesTotal: sns_minutes_total ?? screen_time_minutes ?? 0,
        snsMinutesNight: sns_minutes_night ?? 0,
        sedentaryMinutes: sedentary_minutes ?? 0,
        sleepStartAt: sleep_start_at ? new Date(sleep_start_at) : null,
        wakeAt: wake_at ? new Date(wake_at) : null,
        activitySummary: activity_summary ?? {},  // v3.1: 追加
        updatedAt: new Date()
      },
      create: {
        userId,
        date: startOfDay,
        sleepDurationMin: sleep_minutes ?? null,
        steps: steps ?? 0,
        snsMinutesTotal: sns_minutes_total ?? screen_time_minutes ?? 0,
        snsMinutesNight: sns_minutes_night ?? 0,
        sedentaryMinutes: sedentary_minutes ?? 0,
        sleepStartAt: sleep_start_at ? new Date(sleep_start_at) : null,
        wakeAt: wake_at ? new Date(wake_at) : null,
        activitySummary: activity_summary ?? {}  // v3.1: 追加
      }
    });

    logger.info(`Saved daily_metrics for user ${userId} on ${date}`);
    return res.status(200).json({ success: true });
  } catch (e) {
    logger.error('Failed to save daily_metrics', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
