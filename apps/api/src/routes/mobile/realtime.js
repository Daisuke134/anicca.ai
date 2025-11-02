import express from 'express';
import { issueRealtimeClientSecret } from '../../services/openaiRealtimeService.js';
import baseLogger from '../../utils/logger.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileRealtime');

router.get('/session', async (req, res) => {
  const deviceId = (req.query.deviceId || req.get('device-id') || '').toString().trim();
  if (!deviceId) {
    logger.warn('Missing deviceId for client_secret request');
    return res.status(400).json({ error: 'deviceId is required' });
  }

  try {
    const payload = await issueRealtimeClientSecret({ deviceId });
    return res.json(payload);
  } catch (error) {
    logger.error('Failed to issue client_secret', error);
    return res.status(500).json({ error: 'failed_to_issue_client_secret' });
  }
});

export default router;
