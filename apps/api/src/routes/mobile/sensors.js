import express from 'express';
import extractUserId from '../../middleware/extractUserId.js';
import baseLogger from '../../utils/logger.js';
import prisma from '../../lib/prisma.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileSensors');

const coerceBoolean = (value) => value === true || value === 'true' || value === 1;

const buildPayload = (body = {}) => ({
  screenTimeEnabled: coerceBoolean(body.screenTimeEnabled),
  sleepEnabled: coerceBoolean(body.sleepEnabled),
  stepsEnabled: coerceBoolean(body.stepsEnabled),
  motionEnabled: coerceBoolean(body.motionEnabled)
});

router.put('/state', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  try {
    const payload = buildPayload(req.body);
    await prisma.sensorAccessState.upsert({
      where: { userId },
      update: { ...payload, updatedAt: new Date() },
      create: { userId, ...payload }
    });
    return res.status(200).json({ success: true });
  } catch (e) {
    logger.error('Failed to upsert sensor state', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/state', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  try {
    const row = await prisma.sensorAccessState.findUnique({ where: { userId } });
    return res.json(row ?? buildPayload());
  } catch (e) {
    logger.error('Failed to fetch sensor state', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

