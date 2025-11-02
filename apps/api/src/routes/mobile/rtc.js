import express from 'express';
import { issueEphemeralToken } from '../../services/livekitTokenService.js';
import { startMobileVoiceAgent, stopMobileVoiceAgent } from '../../services/mobileVoiceAgent.js';
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

router.post('/session', async (req, res) => {
  const deviceId = (req.body?.deviceId || '').toString().trim();
  const room = (req.body?.room || '').toString().trim();

  if (!deviceId || !room) {
    logger.warn('Missing deviceId or room for voice session start');
    return res.status(400).json({ error: 'deviceId and room are required' });
  }

  try {
    const session = await startMobileVoiceAgent({ deviceId, room });
    return res.status(201).json(session);
  } catch (error) {
    logger.error('Failed to start mobile voice agent', error);
    return res.status(500).json({ error: 'failed_to_start_voice_agent' });
  }
});

router.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const result = await stopMobileVoiceAgent(sessionId);
    if (!result) {
      return res.status(404).json({ error: 'session_not_found' });
    }
    return res.status(204).end();
  } catch (error) {
    logger.error('Failed to stop mobile voice agent', error);
    return res.status(500).json({ error: 'failed_to_stop_voice_agent' });
  }
});

export default router;
