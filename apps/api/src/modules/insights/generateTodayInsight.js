import { fetch } from 'undici';
import baseLogger from '../../utils/logger.js';

const logger = baseLogger.withContext('TodayInsight');

export async function generateTodayInsight({ todayStats, traits, language = 'en' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set, returning fallback');
    return null;
  }

  // データが不十分な場合はnullを返す（呼び出し元でフォールバック）
  const hasData = todayStats && (
    todayStats.wakeAt ||
    todayStats.steps > 0 ||
    todayStats.snsMinutesTotal > 0 ||
    todayStats.sleepDurationMin
  );
  
  if (!hasData) {
    return null;
  }

  const model = process.env.OPENAI_INSIGHT_MODEL || 'gpt-4o-mini';

  const systemPrompt = language === 'ja'
    ? `あなたは行動データに基づいて、今日1日の短い洞察（1-2文）を提供します。
       ポジティブで励ましの言葉を使い、医療的なアドバイスは避けてください。
       データに基づいた具体的な観察と、小さな改善提案を含めてください。`
    : `You provide brief insights (1-2 sentences) based on behavioral data.
       Use positive, encouraging language. Avoid medical advice.
       Include specific observations from the data and small improvement suggestions.`;

  const userContent = JSON.stringify({
    task: language === 'ja' 
      ? '今日の行動データに基づいて、短い洞察を1-2文で書いてください。'
      : 'Write a brief insight (1-2 sentences) based on today\'s behavioral data.',
    data: {
      sleepMinutes: todayStats.sleepDurationMin,
      wakeTime: todayStats.wakeAt,
      steps: todayStats.steps,
      snsMinutes: todayStats.snsMinutesTotal,
      sedentaryMinutes: todayStats.sedentaryMinutes
    },
    userTraits: {
      ideals: traits?.ideals || [],
      struggles: traits?.struggles || []
    }
  }, null, 2);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const insight = data.choices?.[0]?.message?.content?.trim();
    
    if (insight) {
      return insight;
    }
  } catch (e) {
    logger.error('Failed to generate today insight', e);
  }

  return null;
}

