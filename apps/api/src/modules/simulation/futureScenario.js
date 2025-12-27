import { fetch } from 'undici';

function fallback(language) {
  if (language === 'ja') {
    return {
      ifContinue: '十分なデータがありません',
      ifImprove: ''  // ★ 空にして1行のみ表示
    };
  }
  return {
    ifContinue: 'Not enough data available',
    ifImprove: ''  // ★ 空にして1行のみ表示
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
    // ★ 正しいエンドポイント: /v1/chat/completions
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: input,  // ★ 'input' → 'messages'
        response_format: { type: 'json_object' },  // ★ フォーマット指定
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';  // ★ レスポンス解析修正
    const parsed = JSON.parse(text);
    if (parsed?.ifContinue && parsed?.ifImprove) {
      return { ifContinue: String(parsed.ifContinue), ifImprove: String(parsed.ifImprove) };
    }
    return fallback(language);
  } catch {
    return fallback(language);
  }
}



