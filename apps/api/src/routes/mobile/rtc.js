import express from 'express';
import { issueEphemeralToken } from '../../services/livekitTokenService.js';
import baseLogger from '../../utils/logger.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileRTC');

router.get('/ephemeral-token', async (req, res) => {
  const deviceId = (req.query.deviceId || req.get('deviceId') || '').toString().trim();

  if (!deviceId) {
    logger.warn('Missing deviceId for LiveKit token request');
    return res.status(400).json({ error: 'deviceId is required' });
  }

  try {
    const payload = await issueEphemeralToken({ deviceId });
    return res.json(payload);
  } catch (error) {
    logger.error('Failed to issue LiveKit ephemeral token', error);
    return res.status(500).json({ error: 'failed_to_issue_livekit_token' });
  }
});

export default router;
