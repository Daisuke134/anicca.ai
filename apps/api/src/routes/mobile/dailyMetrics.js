import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import prisma from '../../prisma/client.js';

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
      timezone,
      sleep_minutes,
      steps,
      screen_time_minutes,
      sedentary_minutes
    } = req.body;

    // Upsert daily_metrics for this user + date
    const parsedDate = new Date(date);
    const startOfDay = new Date(parsedDate.toISOString().split('T')[0] + 'T00:00:00Z');

    await prisma.dailyMetrics.upsert({
      where: {
        userId_date: {
          userId,
          date: startOfDay
        }
      },
      update: {
        timezone: timezone || 'UTC',
        sleepMinutes: sleep_minutes ?? null,
        steps: steps ?? null,
        screenTimeMinutes: screen_time_minutes ?? null,
        sedentaryMinutes: sedentary_minutes ?? null,
        updatedAt: new Date()
      },
      create: {
        userId,
        deviceId,
        date: startOfDay,
        timezone: timezone || 'UTC',
        sleepMinutes: sleep_minutes ?? null,
        steps: steps ?? null,
        screenTimeMinutes: screen_time_minutes ?? null,
        sedentaryMinutes: sedentary_minutes ?? null
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

