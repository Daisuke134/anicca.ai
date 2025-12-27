import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { fetch } from 'undici';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { query } from '../../lib/db.js';
import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
import { getMem0Client } from '../../modules/memory/mem0Client.js';
import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();
const router = express.Router();
const logger = baseLogger.withContext('PreReminder');

const requestSchema = z.object({
  habitType: z.enum(['wake', 'bedtime', 'training', 'custom']),
  habitName: z.string().optional(), // カスタム習慣の場合のみ
  scheduledTime: z.string(), // "HH:MM" 形式
  customHabitId: z.string().uuid().optional()
});

// 各習慣タイプ別のプロンプトテンプレート
// 睡眠時間のフォーマット関数
function formatSleepDuration(minutes, lang = 'ja') {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (lang === 'ja') {
    return `${hours}時間${mins}分`;
  }
  return `${hours}h ${mins}m`;
}

const PROMPT_TEMPLATES = {
  ja: {
    bedtime: {
      system: `あなたはAnicca（aniicha）という名前の温かく賢明なライフコーチです。
ユーザーが就寝15分前であることを踏まえ、睡眠準備を促す短いメッセージを生成してください。

ルール:
- 30文字以内（厳守）1-2行で表示されるように簡潔に
- ユーザーの名前を必ず含める（「〇〇さん」または「〇〇」の形で文頭か文中に自然に）
- ユーザーの理想の姿や現在の課題に関連付けて励ます
- 今日の活動データ（歩数、睡眠時間など）があれば参照して具体的に
- 命令形ではなく、提案や誘いの形で
- 絵文字は使わない
- 「Anicca」「アニッチャ」という名前は含めない`,
      user: (ctx) => `ユーザー情報:
- 名前: ${ctx.displayName}
- 就寝予定時刻: ${ctx.scheduledTime}
- 現在時刻: ${ctx.currentTime}
- 寝室の場所: ${ctx.sleepLocation || '未設定'}
- なりたい自分: ${ctx.idealTraits?.join('、') || '未設定'}
- 今抱えている課題: ${ctx.problems?.join('、') || '未設定'}
${ctx.memories ? `- 過去の記録: ${ctx.memories}` : ''}
${ctx.todayStats ? `- 今日の活動: 歩数 ${ctx.todayStats.steps || 0}歩${ctx.todayStats.sleepDurationMin ? `、昨晩の睡眠 ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'ja')}` : ''}${ctx.todayStats.snsMinutesTotal ? `、SNS利用 ${ctx.todayStats.snsMinutesTotal}分` : ''}` : ''}

就寝準備を促す優しいメッセージを1文で生成してください。`
    },
    training: {
      system: `あなたはAnicca（aniicha）という名前の温かく賢明なライフコーチです。
ユーザーのトレーニング15分前であることを踏まえ、運動準備を促す短いメッセージを生成してください。

ルール:
- 80文字以内（厳守）
- ユーザーの名前を必ず含める（「〇〇さん」または「〇〇」の形で文頭か文中に自然に）
- ユーザーの理想の姿に関連付けてモチベーションを高める
- 今日の活動データがあれば参照して具体的に
- モチベーションを高める言葉で
- 絵文字は使わない
- 「Anicca」「アニッチャ」という名前は含めない`,
      user: (ctx) => `ユーザー情報:
- 名前: ${ctx.displayName}
- トレーニング予定時刻: ${ctx.scheduledTime}
- 現在時刻: ${ctx.currentTime}
- トレーニングの重点: ${ctx.trainingFocus?.join('、') || '未設定'}
- トレーニング目標: ${ctx.trainingGoal || '未設定'}
- なりたい自分: ${ctx.idealTraits?.join('、') || '未設定'}
- 今抱えている課題: ${ctx.problems?.join('、') || '未設定'}
${ctx.memories ? `- 過去の記録: ${ctx.memories}` : ''}
${ctx.todayStats ? `- 今日の活動: 歩数 ${ctx.todayStats.steps || 0}歩${ctx.todayStats.sleepDurationMin ? `、昨晩の睡眠 ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'ja')}` : ''}` : ''}

トレーニング準備を促すメッセージを1文で生成してください。`
    },
    custom: {
      system: `あなたはAnicca（aniicha）という名前の温かく賢明なライフコーチです。
ユーザーが設定した習慣の15分前であることを踏まえ、準備を促す短いメッセージを生成してください。

ルール:
- 80文字以内（厳守）
- ユーザーの名前を必ず含める（「〇〇さん」または「〇〇」の形で文頭か文中に自然に）
- 習慣の名前を自然に含める
- ユーザーの理想の姿に関連付けて励ます
- 絵文字は使わない
- 「Anicca」「アニッチャ」という名前は含めない`,
      user: (ctx) => `ユーザー情報:
- 名前: ${ctx.displayName}
- 習慣名: ${ctx.habitName}
- 予定時刻: ${ctx.scheduledTime}
- 現在時刻: ${ctx.currentTime}
- なりたい自分: ${ctx.idealTraits?.join('、') || '未設定'}
- 今抱えている課題: ${ctx.problems?.join('、') || '未設定'}
${ctx.memories ? `- 過去の記録: ${ctx.memories}` : ''}

この習慣の準備を促すメッセージを1文で生成してください。`
    },
    wake: {
      system: `あなたはAnicca（aniicha）という名前の温かく賢明なライフコーチです。
ユーザーの起床5分前であることを踏まえ、優しく起こすメッセージを生成してください。

ルール:
- 80文字以内（厳守）
- ユーザーの名前を必ず含める（「〇〇、おはよう」などの形で）
- ユーザーの理想の姿を参照して一日のスタートを励ます
- 昨晩の睡眠データがあれば参照して具体的に
- 朝の挨拶として自然な言葉で
- 絵文字は使わない
- 「Anicca」「アニッチャ」という名前は含めない`,
      user: (ctx) => `ユーザー情報:
- 名前: ${ctx.displayName}
- 起床予定時刻: ${ctx.scheduledTime}
- 現在時刻: ${ctx.currentTime}
- 起床場所: ${ctx.wakeLocation || '未設定'}
- なりたい自分: ${ctx.idealTraits?.join('、') || '未設定'}
- 今抱えている課題: ${ctx.problems?.join('、') || '未設定'}
${ctx.memories ? `- 過去の記録: ${ctx.memories}` : ''}
${ctx.todayStats ? `- 昨日の活動: 歩数 ${ctx.todayStats.steps || 0}歩${ctx.todayStats.sleepDurationMin ? `、睡眠 ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'ja')}` : ''}` : ''}

優しく目覚めを促すメッセージを1文で生成してください。`
    }
  },
  en: {
    bedtime: {
      system: `You are Anicca, a warm and wise life coach.
The user is 15 minutes before bedtime. Generate a short message to encourage sleep preparation.

Rules:
- Maximum 50 characters (strict) Keep it to 1-2 lines visible in notification
- Always include the user's name (e.g., "Name, it's time to..." or "Good night, Name")
- Reference their ideal self or current struggles when relevant
- If today's activity data is available, reference it specifically
- Use suggestions, not commands
- No emojis
- Do not include "Anicca" in the message`,
      user: (ctx) => `User info:
- Name: ${ctx.displayName}
- Scheduled bedtime: ${ctx.scheduledTime}
- Current time: ${ctx.currentTime}
- Sleep location: ${ctx.sleepLocation || 'not set'}
- Ideal self: ${ctx.idealTraits?.join(', ') || 'not set'}
- Current struggles: ${ctx.problems?.join(', ') || 'not set'}
${ctx.memories ? `- Past notes: ${ctx.memories}` : ''}
${ctx.todayStats ? `- Today's activity: ${ctx.todayStats.steps || 0} steps${ctx.todayStats.sleepDurationMin ? `, last night ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'en')} sleep` : ''}${ctx.todayStats.snsMinutesTotal ? `, ${ctx.todayStats.snsMinutesTotal}min SNS` : ''}` : ''}

Generate a gentle one-sentence message encouraging bedtime preparation.`
    },
    training: {
      system: `You are Anicca, a warm and wise life coach.
The user is 15 minutes before training. Generate a short motivational message.

Rules:
- Maximum 80 characters (strict)
- Always include the user's name (e.g., "Name, let's..." or "Ready, Name?")
- Connect to their ideal self when relevant to motivate
- If today's activity data is available, reference it
- Be encouraging and motivating
- No emojis
- Do not include "Anicca" in the message`,
      user: (ctx) => `User info:
- Name: ${ctx.displayName}
- Scheduled time: ${ctx.scheduledTime}
- Current time: ${ctx.currentTime}
- Training focus: ${ctx.trainingFocus?.join(', ') || 'not set'}
- Training goal: ${ctx.trainingGoal || 'not set'}
- Ideal self: ${ctx.idealTraits?.join(', ') || 'not set'}
- Current struggles: ${ctx.problems?.join(', ') || 'not set'}
${ctx.memories ? `- Past notes: ${ctx.memories}` : ''}
${ctx.todayStats ? `- Today: ${ctx.todayStats.steps || 0} steps${ctx.todayStats.sleepDurationMin ? `, ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'en')} sleep` : ''}` : ''}

Generate a one-sentence message to encourage workout preparation.`
    },
    custom: {
      system: `You are Anicca, a warm and wise life coach.
The user is 15 minutes before a custom habit. Generate a short reminder message.

Rules:
- Maximum 80 characters (strict)
- Always include the user's name
- Include the habit name naturally
- Connect to their ideal self when relevant
- No emojis
- Do not include "Anicca" in the message`,
      user: (ctx) => `User info:
- Name: ${ctx.displayName}
- Habit name: ${ctx.habitName}
- Scheduled time: ${ctx.scheduledTime}
- Current time: ${ctx.currentTime}
- Ideal self: ${ctx.idealTraits?.join(', ') || 'not set'}
- Current struggles: ${ctx.problems?.join(', ') || 'not set'}
${ctx.memories ? `- Past notes: ${ctx.memories}` : ''}

Generate a one-sentence reminder for this habit.`
    },
    wake: {
      system: `You are Anicca, a warm and wise life coach.
It's 5 minutes before the user's wake-up time. Generate a gentle wake-up message.

Rules:
- Maximum 80 characters (strict)
- Always include the user's name (e.g., "Good morning, Name" or "Name, rise and shine")
- Reference their ideal self to inspire the start of the day
- If sleep data is available, reference it
- Use a warm morning greeting tone
- No emojis
- Do not include "Anicca" in the message`,
      user: (ctx) => `User info:
- Name: ${ctx.displayName}
- Wake time: ${ctx.scheduledTime}
- Current time: ${ctx.currentTime}
- Wake location: ${ctx.wakeLocation || 'not set'}
- Ideal self: ${ctx.idealTraits?.join(', ') || 'not set'}
- Current struggles: ${ctx.problems?.join(', ') || 'not set'}
${ctx.memories ? `- Past notes: ${ctx.memories}` : ''}
${ctx.todayStats ? `- Yesterday: ${ctx.todayStats.steps || 0} steps${ctx.todayStats.sleepDurationMin ? `, ${formatSleepDuration(ctx.todayStats.sleepDurationMin, 'en')} sleep` : ''}` : ''}

Generate a gentle one-sentence wake-up message.`
    }
  }
};

// デフォルトメッセージ（OpenAI失敗時のフォールバック）
const FALLBACK_MESSAGES = {
  ja: {
    bedtime: (name) => `${name}、そろそろ寝る準備を始めましょう。`,
    training: (name) => `${name}、トレーニングの時間が近づいています。`,
    custom: (name, habitName) => `${name}、${habitName}の時間が近づいています。`,
    wake: (name) => `おはよう、${name}。新しい一日が始まります。`
  },
  en: {
    bedtime: (name) => `${name}, time to start winding down for bed.`,
    training: (name) => `${name}, your training time is coming up.`,
    custom: (name, habitName) => `${name}, time for ${habitName} is approaching.`,
    wake: (name) => `Good morning, ${name}. A new day begins.`
  }
};

async function generatePersonalizedMessage({ profileId, habitType, habitName, scheduledTime, language, profile }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set, using fallback message');
    const name = profile?.displayName || 'there';
    const fb = FALLBACK_MESSAGES[language] || FALLBACK_MESSAGES.en;
    if (habitType === 'custom') {
      return fb.custom(name, habitName || 'your habit');
    }
    return fb[habitType](name);
  }

  // 1. プロファイル情報を取得
  const displayName = profile?.displayName || (language === 'ja' ? 'あなた' : 'there');
  const sleepLocation = profile?.sleepLocation || '';
  const wakeLocation = profile?.wakeLocation || '';
  const trainingFocus = profile?.trainingFocus || [];
  const trainingGoal = profile?.trainingGoal || '';
  
  // ★ idealTraits と problems を追加（ideals/strugglesをフォールバック）
  const idealTraits = profile?.idealTraits || profile?.ideals || [];
  const problems = profile?.problems || profile?.struggles || [];

  // 2. mem0から関連記憶を検索
  let memories = '';
  try {
    const mem0 = getMem0Client();
    const searchResult = await mem0.search({
      userId: profileId,
      query: habitType === 'custom' ? habitName : habitType,
      topK: 2
    });
    if (searchResult?.results?.length > 0) {
      memories = searchResult.results.map(r => r.memory || r.content).join('; ').slice(0, 200);
    }
  } catch (e) {
    logger.warn('mem0 search failed, continuing without memories', e);
  }

  // 3. 今日のメトリクスを取得
  let todayStats = null;
  try {
    const today = new Date();
    const startOfDay = new Date(today.toISOString().split('T')[0] + 'T00:00:00Z');
    const metrics = await prisma.dailyMetric.findUnique({
      where: {
        userId_date: {
          userId: profileId,
          date: startOfDay
        }
      }
    });
    if (metrics) {
      todayStats = {
        steps: metrics.steps,
        sleepDurationMin: metrics.sleepDurationMin,
        snsMinutesTotal: metrics.snsMinutesTotal
      };
    }
  } catch (e) {
    logger.warn('Failed to fetch today metrics', e);
  }

  // 4. 現在時刻
  const now = new Date();
  const currentTime = now.toLocaleTimeString(language === 'ja' ? 'ja-JP' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // 5. プロンプト構築
  const templates = PROMPT_TEMPLATES[language] || PROMPT_TEMPLATES.en;
  const template = templates[habitType];
  if (!template) {
    logger.error(`No template for habitType: ${habitType}`);
    const fb = FALLBACK_MESSAGES[language] || FALLBACK_MESSAGES.en;
    return fb[habitType](displayName);
  }

  const context = {
    displayName,
    scheduledTime,
    currentTime,
    sleepLocation,
    wakeLocation,
    trainingFocus,
    trainingGoal,
    habitName: habitName || '',
    memories: memories || null,
    idealTraits,
    problems,
    todayStats
  };

  const messages = [
    { role: 'system', content: template.system },
    { role: 'user', content: template.user(context) }
  ];

  // 6. OpenAI API呼び出し
  try {
    const model = process.env.OPENAI_PRE_REMINDER_MODEL || 'gpt-4o-mini';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      logger.error(`OpenAI API error: ${resp.status} ${errorText}`);
      throw new Error('OpenAI API failed');
    }

    const data = await resp.json();
    const generatedMessage = data.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      throw new Error('Empty response from OpenAI');
    }

    // 文字数制限: 日本語30文字、英語50文字
    const maxLength = language === 'ja' ? 30 : 50;
    if (generatedMessage.length > maxLength) {
      return generatedMessage.slice(0, maxLength - 3) + '...';
    }

    return generatedMessage;
  } catch (e) {
    logger.error('Failed to generate personalized message', e);
    const fb = FALLBACK_MESSAGES[language] || FALLBACK_MESSAGES.en;
    if (habitType === 'custom') {
      return fb.custom(displayName, habitName || 'your habit');
    }
    return fb[habitType](displayName);
  }
}

// POST /api/mobile/nudge/pre-reminder
router.post('/pre-reminder', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors }
    });
  }

  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' }
    });
  }

  try {
    // 言語設定とプロファイル取得
    const langR = await query(`SELECT language FROM user_settings WHERE user_id = $1::uuid LIMIT 1`, [profileId]);
    const language = langR.rows?.[0]?.language || 'en';

    const profileR = await query(`SELECT profile FROM mobile_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
    const profile = profileR.rows?.[0]?.profile || {};

    const { habitType, habitName, scheduledTime } = parsed.data;

    const message = await generatePersonalizedMessage({
      profileId,
      habitType,
      habitName,
      scheduledTime,
      language,
      profile
    });

    // nudge_eventsに記録（分析用）
    const nudgeId = crypto.randomUUID();
    await query(
      `INSERT INTO nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, true, timezone('utc', now()))`,
      [
        nudgeId,
        profileId,
        'habit',
        `pre_reminder_${habitType}`,
        `pre_reminder_${habitType}`,
        JSON.stringify({ habitName, scheduledTime }),
        'pre_reminder',
        'notification'
      ]
    );

    logger.info(`Generated pre-reminder for ${habitType}: ${message.slice(0, 30)}...`);

    return res.json({
      nudgeId,
      message,
      habitType
    });
  } catch (e) {
    logger.error('Failed to generate pre-reminder', e);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate pre-reminder' }
    });
  }
});

export default router;

