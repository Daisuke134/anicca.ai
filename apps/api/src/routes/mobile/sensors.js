import express from 'express';
import extractUserId from '../../middleware/extractUserId.js';
import baseLogger from '../../utils/logger.js';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();
const router = express.Router();
const logger = baseLogger.withContext('MobileSensors');

router.put('/state', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  try {
    await prisma.sensorAccessState.upsert({
      where: { userId },
      update: req.body,
      create: { userId, ...req.body }
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
  const row = await prisma.sensorAccessState.findUnique({ where: { userId } });
  return res.json(row ?? {});
});

export default router;

