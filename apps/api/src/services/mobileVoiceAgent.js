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

async function buildAuthHeader() {
  const token = new AccessToken(LIVEKIT_CONFIG.API_KEY, LIVEKIT_CONFIG.API_SECRET, {
    identity: 'mobile-agent-backend',
    ttl: 60
  });
  token.addGrant({ agent: true });
  const jwt = await token.toJwt();
  return `Bearer ${jwt}`;
}

async function createAgentJob({ identity, room }) {
  const baseUrl = resolveAgentBaseUrl();
  const endpoint = new URL('/agents/v1/jobs', baseUrl);
  const payload = {
    identity,
    room,
    instructions: "You are Anicca's Japanese voice coach. Keep replies brief and empathetic.",
    model: {
      type: 'openai-realtime',
      voice: 'alloy'
    }
  };

  const authHeader = await buildAuthHeader();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to create agent job (status=${response.status}, detail=${detail})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = (await response.text()).trim();
  return { id: text || `${identity}-${Date.now()}` };
}

async function deleteAgentJob(jobId) {
  const baseUrl = resolveAgentBaseUrl();
  const endpoint = new URL(`/agents/v1/jobs/${jobId}`, baseUrl);
  const authHeader = await buildAuthHeader();
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: authHeader
    }
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(`Failed to delete agent job (status=${response.status}, detail=${detail})`);
  }
}

export async function startMobileVoiceAgent({ deviceId, room }) {
  const identity = `${deviceId}-assistant`;
  const job = await createAgentJob({ identity, room });
  const sessionId = job.id || job.jobId || job.job_id;
  if (!sessionId) {
    throw new Error('Agent job response did not include an identifier');
  }

  sessions.set(sessionId, { identity, room });
  logger.info(`Started mobile voice agent job (session=${sessionId}, room=${room})`);
  return { sessionId };
}

export async function stopMobileVoiceAgent(sessionId) {
  if (!sessions.has(sessionId)) {
    return false;
  }

  await deleteAgentJob(sessionId);
  sessions.delete(sessionId);
  logger.info(`Stopped mobile voice agent job (session=${sessionId})`);
  return true;
}
