import baseLogger from '../utils/logger.js';

const logger = baseLogger.withContext('OpenAIRealtimeService');
const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime/sessions';

export async function issueRealtimeClientSecret({ deviceId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch(OPENAI_REALTIME_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-10-01',
      modalities: ['audio'],
      voice: 'alloy',
      metadata: { device_id: deviceId }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    logger.error('Realtime session creation failed', detail);
    throw new Error(`Realtime API error: ${response.status}`);
  }

  return response.json();
}
