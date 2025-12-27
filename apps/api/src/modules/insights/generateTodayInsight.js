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
    ? `あなたは行動データに基づいて、今日1日の短い洞察を提供します。
       必ず30文字以内の1文にまとめてください。2行程度で表示されるように簡潔に。
       ポジティブで具体的に。医療アドバイスは避けてください。`
    : `You provide brief insights based on behavioral data.
       Keep it under 60 characters, one sentence only. Display in about 2 lines.
       Use positive language. No medical advice.`;

  const userContent = JSON.stringify({
    task: language === 'ja' 
      ? '今日の行動データに基づいて、30文字以内の1文で短い洞察を書いてください。'
      : 'Write a brief insight in one sentence under 60 characters based on today\'s behavioral data.',
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

