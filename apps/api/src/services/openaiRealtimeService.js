import baseLogger from '../utils/logger.js';
import { fetch } from 'undici';

const logger = baseLogger.withContext('OpenAIRealtimeService');
// GA: Create ephemeral client secrets for Realtime
// Ref: https://platform.openai.com/docs/api-reference/realtime-sessions
const OPENAI_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE || 'alloy';

export async function issueRealtimeClientSecret({ deviceId, userId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        // tools/instructions are set client-side via session.update (iOS) to match prompts-v3.md.
        // output_modalities: ['audio'] is the only supported value (not ['audio', 'text'])
        // Ref: https://platform.openai.com/docs/api-reference/realtime-sessions
        audio: { output: { voice: DEFAULT_VOICE } },
        output_modalities: ['audio']
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error('Realtime session creation failed', detail);
    throw new Error(`Realtime API error: ${response.status} ${detail}`);
  }

  const data = await response.json();
  // Normalize to existing mobile payload shape
  return {
    client_secret: {
      value: data.value,
      expires_at: data.expires_at
    },
    // Keep full session for debugging (non-breaking additive)
    session: data.session,
    // Explicitly include model for iOS client
    model: data.session?.model || REALTIME_MODEL
  };
}
