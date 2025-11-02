import { AccessToken } from '@livekit/livekit-server-sdk';
import { LIVEKIT_CONFIG } from '../config/environment.js';
import baseLogger from '../utils/logger.js';

const logger = baseLogger.withContext('MobileVoiceAgent');
const sessions = new Map();

function resolveAgentBaseUrl() {
  const explicit = process.env.LIVEKIT_AGENT_BASE_URL?.trim();
  if (explicit) return explicit;
  return LIVEKIT_CONFIG.WS_URL.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

async function buildAgentAuthorization(room) {
  const token = new AccessToken(LIVEKIT_CONFIG.API_KEY, LIVEKIT_CONFIG.API_SECRET, {
    ttl: '60s'
  });
  token.addGrant({
    room,
    roomAdmin: true,
    agent: true
  });
  return `Bearer ${await token.toJwt()}`;
}

async function createAgentJob({ identity, room }) {
  const baseUrl = resolveAgentBaseUrl();
  const endpoint = new URL('/agents/v1/jobs', baseUrl);
  const payload = {
    identity,
    room,
    agentName: LIVEKIT_CONFIG.AGENT_NAME,
    instructions: "You are Anicca's Japanese voice coach. Keep replies brief and empathetic.",
    model: {
      type: 'openai-realtime',
      voice: LIVEKIT_CONFIG.AGENT_VOICE
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await buildAgentAuthorization(room)
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to create agent job (status=${response.status}, detail=${detail})`);
  }

  const body = await response.json();
  const job = body.job ?? body;
  const sessionId = job?.id ?? job?.jobId ?? job?.job_id;
  if (!sessionId) {
    throw new Error(`Agent job response missing identifier: ${JSON.stringify(body)}`);
  }
  return { sessionId, job };
}

async function deleteAgentJob({ jobId, room }) {
  const baseUrl = resolveAgentBaseUrl();
  const endpoint = new URL(`/agents/v1/jobs/${jobId}`, baseUrl);
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: await buildAgentAuthorization(room)
    }
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(`Failed to delete agent job (status=${response.status}, detail=${detail})`);
  }
}

export async function startMobileVoiceAgent({ deviceId, room }) {
  const identity = `${deviceId}-assistant`;
  const { sessionId, job } = await createAgentJob({ identity, room });
  sessions.set(sessionId, { identity, room, job });
  logger.info(`Started mobile voice agent job (session=${sessionId}, room=${room})`);
  return { sessionId };
}

export async function stopMobileVoiceAgent(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  await deleteAgentJob({ jobId: sessionId, room: session.room });
  sessions.delete(sessionId);
  logger.info(`Stopped mobile voice agent job (session=${sessionId})`);
  return true;
}
