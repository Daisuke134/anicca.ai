import { fetch } from 'undici';

function fallback(language) {
  if (language === 'ja') {
    return {
      ifContinue: '十分なデータがありません',
      ifImprove: '十分なデータがありません'
    };
  }
  return {
    ifContinue: 'Not enough data available',
    ifImprove: 'Not enough data available'
  };
}

export async function generateFutureScenario({
  language = 'en',
  traits = {},
  todayStats = {},
  now = new Date()
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback(language);

  const model = process.env.OPENAI_SIMULATION_MODEL || 'gpt-4.1';

  const input = [
    {
      role: 'system',
      content:
        language === 'ja'
          ? 'あなたは生活とウェルビーイングの将来シナリオを短く書く。医療予測や診断はしない。'
          : 'You write short, realistic lifestyle/wellbeing future scenarios. No medical predictions or diagnosis.'
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'Write two scenarios about lifestyle and wellbeing only.',
          rules: [
            '1) If current patterns continue (realistic, not catastrophizing).',
            '2) If small improvements are made (hopeful and achievable).',
            '3-4 sentences each.'
          ],
          traits,
          todayStats,
          now: now.toISOString()
        },
        null,
        2
      )
    }
  ];

  try {
    // Minimal call (Responses API assumed). If this fails, we fallback.
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input,
        // Ask for JSON in text; parse best-effort below.
        text: { format: { type: 'json_object' } }
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const text = data.output_text || '';
    const parsed = JSON.parse(text);
    if (parsed?.ifContinue && parsed?.ifImprove) {
      return { ifContinue: String(parsed.ifContinue), ifImprove: String(parsed.ifImprove) };
    }
    return fallback(language);
  } catch {
    return fallback(language);
  }
}



