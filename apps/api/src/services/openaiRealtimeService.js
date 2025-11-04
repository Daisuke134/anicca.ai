import baseLogger from '../utils/logger.js';
import { fetch } from 'undici';

const logger = baseLogger.withContext('OpenAIRealtimeService');
const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime/sessions';
const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_VOICE = 'alloy';

export async function issueRealtimeClientSecret({ deviceId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

const response = await fetch(OPENAI_REALTIME_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'realtime=v1'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_MODEL,
      modalities: ['text', 'audio'],
      voice: process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error('Realtime session creation failed', detail);
    throw new Error(`Realtime API error: ${response.status} ${detail}`);
  }

  return response.json();
}
