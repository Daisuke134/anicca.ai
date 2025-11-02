import { AccessToken } from '@livekit/livekit-server-sdk';
import { LIVEKIT_CONFIG } from '../config/environment.js';
import Logger from '../utils/logger.js';

const logger = new Logger('LiveKitTokenService');
const DEFAULT_TTL = 600;

function ensureLiveKitConfiguration() {
  if (!LIVEKIT_CONFIG.WS_URL || !LIVEKIT_CONFIG.API_KEY || !LIVEKIT_CONFIG.API_SECRET) {
    throw new Error('LiveKit configuration is incomplete');
  }
}

export async function issueEphemeralToken({ deviceId }) {
  ensureLiveKitConfiguration();

  const ttl = LIVEKIT_CONFIG.TOKEN_TTL > 0 ? LIVEKIT_CONFIG.TOKEN_TTL : DEFAULT_TTL;

  try {
    const accessToken = new AccessToken(LIVEKIT_CONFIG.API_KEY, LIVEKIT_CONFIG.API_SECRET, {
      identity: deviceId,
      ttl
    });

    accessToken.addGrant({
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      room: LIVEKIT_CONFIG.DEFAULT_ROOM || undefined
    });

    const token = await accessToken.toJwt();

    logger.info('Issued LiveKit token for device', deviceId, `(ttl=${ttl}s)`);

    return {
      token,
      url: LIVEKIT_CONFIG.WS_URL,
      ttl
    };
  } catch (error) {
    logger.error('Failed to generate LiveKit token', error);
    throw error;
  }
}
