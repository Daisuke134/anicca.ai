import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { fetch } from 'undici';
import baseLogger from '../../utils/logger.js';
import requireInternalAuth from '../../middleware/requireInternalAuth.js';
import extractUserId from '../../middleware/extractUserId.js';
import { query } from '../../lib/db.js';
import { resolveProfileId } from '../../services/mobile/userIdResolver.js';

const router = express.Router();
const logger = baseLogger.withContext('NudgeGenerate');

// 入力バリデーションスキーマ
const GenerateNudgeSchema = z.object({
  userId: z.string().uuid(),
  problems: z.array(z.enum([
    'staying_up_late', 'cant_wake_up', 'self_loathing', 'rumination',
    'procrastination', 'anxiety', 'lying', 'bad_mouthing', 'porn_addiction',
    'alcohol_dependency', 'anger', 'obsessive', 'loneliness'
  ])).min(1).max(13),
  stats: z.record(z.string(), z.object({
    tapped: z.number().int().min(0),
    ignored: z.number().int().min(0),
    thumbsUp: z.number().int().min(0),
    thumbsDown: z.number().int().min(0)
  })).optional()
});

// LLM出力バリデーションスキーマ
const LLMOutputSchema = z.object({
  hook: z.string().min(1).max(50),
  content: z.string().min(1).max(200),
  tone: z.enum(['strict', 'gentle', 'logical', 'provocative', 'philosophical']),
  reasoning: z.string()
});

// 問題タイプからスケジュール時刻を取得
function getScheduledHourForProblem(problem) {
  const scheduleMap = {
    staying_up_late: 21,
    cant_wake_up: 6,
    self_loathing: 7,
    rumination: 7,
    procrastination: 9,
    anxiety: 7,
    lying: 8,
    bad_mouthing: 8,
    porn_addiction: 22,
    alcohol_dependency: 18,
    anger: 9,
    obsessive: 9,
    loneliness: 12
  };
  return scheduleMap[problem] || 9;
}

// プロンプトを構築
function buildPrompt(problem, stats) {
  const problemNames = {
    staying_up_late: '夜更かし',
    cant_wake_up: '朝起きられない',
    self_loathing: '自己嫌悪',
    rumination: '反芻思考',
    procrastination: '先延ばし',
    anxiety: '不安',
    lying: '嘘をつく',
    bad_mouthing: '悪口',
    porn_addiction: 'ポルノ依存',
    alcohol_dependency: 'アルコール依存',
    anger: '怒り',
    obsessive: '強迫観念',
    loneliness: '孤独'
  };

  const problemName = problemNames[problem] || problem;
  let statsText = '';
  if (stats) {
    statsText = `\n## 過去の統計\n- タップ: ${stats.tapped}回\n- 無視: ${stats.ignored}回\n- 👍: ${stats.thumbsUp}回\n- 👎: ${stats.thumbsDown}回`;
  }

  return `You are Anicca, an AI that reduces human suffering through perfectly-timed nudges.

## Your Mission
Generate notification hooks and one-screen content that will make this specific person take action. The notification alone should be powerful enough to change behavior - they shouldn't even need to tap.

## Problem Type
${problemName}${statsText}

## Tone Definitions
- strict: 厳しい、直接的、言い訳を許さない。例：「まだ寝てる？言い訳はいらない」
- gentle: 優しい、共感的、寄り添う。例：「大丈夫、少しずつでいいよ」
- logical: 論理的、データや事実ベース。例：「睡眠不足は判断力を40%下げる」
- provocative: 挑発的、プライドを刺激。例：「また負けるの？」
- philosophical: 哲学的、深い問い。例：「この5分が人生を変えるかもしれない」

## Output Requirements

### Hook (Notification)
- Maximum 25 characters (CRITICAL - must fit in notification preview)
- Action-oriented
- Powerful enough that they might change behavior without tapping

### Content (One-Screen)
- Maximum 80 characters
- Specific action or insight
- Directly related to the hook
- Provides value even if they only glance at it

## Output Format (JSON)

{
  "hook": "まだ布団の中？",
  "content": "あと5分で起きたら、今日は違う1日になる。試してみろ。",
  "tone": "strict",
  "reasoning": "This person responds well to strict tone in the morning."
}

## Critical Rules
1. NEVER exceed character limits. Hook ≤ 25, Content ≤ 80.
2. Output a SINGLE JSON object, not an array.
3. Use Japanese. Natural, conversational, not robotic.`;
}

// POST /api/nudge/generate - 内部API（cron job専用）
router.post('/generate', requireInternalAuth, async (req, res) => {
  // 入力バリデーション
  const parseResult = GenerateNudgeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: parseResult.error.issues });
  }
  const { userId, problems, stats } = parseResult.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('OPENAI_API_KEY not configured');
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const nudges = [];
  for (const problem of problems) {
    const prompt = buildPrompt(problem, stats?.[problem]);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a behavioral nudge generation assistant. Always output valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`OpenAI API error for ${problem}: ${response.status} ${errorText}`);
        continue;  // このproblemはスキップ
      }

      const data = await response.json();
      const rawOutput = JSON.parse(data.choices[0].message.content);

      // LLM出力バリデーション
      const outputResult = LLMOutputSchema.safeParse(rawOutput);
      if (!outputResult.success) {
        logger.warn(`LLM output validation failed for ${problem}:`, outputResult.error);
        continue;  // このproblemはスキップ
      }
      const generated = outputResult.data;

      const scheduledHour = getScheduledHourForProblem(problem);
      const nudgeId = crypto.randomUUID();
      
      nudges.push({
        id: nudgeId,
        problemType: problem,
        scheduledHour,
        hook: generated.hook.slice(0, 25),  // 25文字制限
        content: generated.content.slice(0, 80),  // 80文字制限
        tone: generated.tone,
        reasoning: generated.reasoning,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`LLM generation failed for ${problem}:`, error);
      // このproblemはスキップ（既存バリアントが使われる）
    }
  }

  // DBに保存（scheduledHourもstateに含める）
  if (nudges.length > 0) {
    try {
      const profileIdResult = await query(
        `SELECT id FROM mobile_profiles WHERE user_id = $1::uuid LIMIT 1`,
        [userId]
      );
      const profileId = profileIdResult.rows?.[0]?.id;
      
      if (!profileId) {
        logger.warn(`Profile not found for userId: ${userId}`);
        return res.status(404).json({ error: 'Profile not found' });
      }

      // 各nudgeを個別にINSERT（簡潔で安全）
      for (const nudge of nudges) {
        await query(
          `INSERT INTO nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, timezone('utc', now()))`,
          [
            nudge.id,
            profileId,
            'problem_nudge',
            nudge.problemType,
            'llm_generation',
            JSON.stringify({
              id: nudge.id,
              scheduledHour: nudge.scheduledHour,
              hook: nudge.hook,
              content: nudge.content,
              tone: nudge.tone,
              reasoning: nudge.reasoning
            }),
            'notification',
            'push',
            false
          ]
        );
      }
    } catch (dbError) {
      logger.error('Failed to save nudges to database', dbError);
      return res.status(500).json({ error: 'Failed to save nudges' });
    }
  }

  res.json({ nudges, skipped: problems.length - nudges.length });
});

// GET /api/nudge/today - 今日生成されたNudgeを取得（ユーザー認証必須）
router.get('/today', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const profileId = await resolveProfileId(userId);
    if (!profileId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
    }

    // 今日の00:00 JST以降に生成されたNudgeを取得
    // JST (UTC+9) で今日の開始時刻を計算
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStartJST = new Date(Date.UTC(
      nowJST.getUTCFullYear(),
      nowJST.getUTCMonth(),
      nowJST.getUTCDate(),
      0, 0, 0, 0
    ) - 9 * 60 * 60 * 1000);  // JSTの00:00をUTCに変換

    const result = await query(
      `SELECT state, subtype, created_at
       FROM nudge_events
       WHERE user_id = $1::uuid
         AND domain = 'problem_nudge'
         AND decision_point = 'llm_generation'
         AND created_at >= $2::timestamp
       ORDER BY created_at DESC`,
      [profileId, todayStartJST]
    );

    // LLMGeneratedNudge形式に変換
    const nudges = result.rows.map(row => ({
      id: row.state.id,
      problemType: row.subtype,
      scheduledHour: row.state.scheduledHour,
      hook: row.state.hook,
      content: row.state.content,
      tone: row.state.tone,
      reasoning: row.state.reasoning,
      createdAt: row.created_at.toISOString()
    }));

    return res.json({ nudges });
  } catch (e) {
    logger.error('Failed to fetch today\'s nudges', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch today\'s nudges' } });
  }
});

export default router;

