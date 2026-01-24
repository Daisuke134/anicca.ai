/**
 * Phase 6: LLM生成Nudge - Cron Job
 *
 * 毎朝5:00 JST (20:00 UTC) に実行
 * 全アクティブユーザーに対してGPT-4o-miniでNudge文言を生成
 *
 * Railway Cron Schedule: 0 20 * * *
 */

import { query } from '../lib/db.js';
import baseLogger from '../utils/logger.js';
import { fetch } from 'undici';
import crypto from 'crypto';

const logger = baseLogger.withContext('GenerateNudges');

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
function buildPrompt(problem) {
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

  return `You are Anicca, an AI that reduces human suffering through perfectly-timed nudges.

## Your Mission
Generate notification hooks and one-screen content that will make this specific person take action. The notification alone should be powerful enough to change behavior - they shouldn't even need to tap.

## Problem Type
${problemName}

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

// LLM出力バリデーション
function validateLLMOutput(output) {
  if (!output || typeof output !== 'object') return null;
  if (typeof output.hook !== 'string' || output.hook.length === 0) return null;
  if (typeof output.content !== 'string' || output.content.length === 0) return null;
  if (!['strict', 'gentle', 'logical', 'provocative', 'philosophical'].includes(output.tone)) return null;
  if (typeof output.reasoning !== 'string') return null;
  return output;
}

// メイン処理
async function runGenerateNudges() {
  logger.info('Starting LLM nudge generation cron job');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('OPENAI_API_KEY not configured');
    process.exit(1);
  }

  // 1. 全アクティブユーザーを取得（problemsを持っている人）
  const usersResult = await query(`
    SELECT DISTINCT mp.id as profile_id, mp.user_id, mp.problems
    FROM mobile_profiles mp
    WHERE mp.problems IS NOT NULL
      AND jsonb_array_length(mp.problems) > 0
  `);

  const users = usersResult.rows;
  logger.info(`Found ${users.length} users with problems`);

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 2. 各ユーザーに対して処理
  for (const user of users) {
    const problems = user.problems || [];

    for (const problem of problems) {
      const prompt = buildPrompt(problem);

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`OpenAI API error for user ${user.profile_id}, problem ${problem}: ${response.status} ${errorText}`);
          totalErrors++;
          continue;
        }

        const data = await response.json();
        const rawOutput = JSON.parse(data.choices[0].message.content);

        // LLM出力バリデーション
        const validated = validateLLMOutput(rawOutput);
        if (!validated) {
          logger.warn(`LLM output validation failed for user ${user.profile_id}, problem ${problem}`);
          totalSkipped++;
          continue;
        }

        const scheduledHour = getScheduledHourForProblem(problem);
        const nudgeId = crypto.randomUUID();

        // DBに保存
        await query(
          `INSERT INTO nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, timezone('utc', now()))`,
          [
            nudgeId,
            user.profile_id,
            'problem_nudge',
            problem,
            'llm_generation',
            JSON.stringify({
              id: nudgeId,
              scheduledHour: scheduledHour,
              hook: validated.hook.slice(0, 25),
              content: validated.content.slice(0, 80),
              tone: validated.tone,
              reasoning: validated.reasoning
            }),
            'notification',
            'push',
            false
          ]
        );

        totalGenerated++;
        logger.debug(`Generated nudge for user ${user.profile_id}, problem ${problem}`);

      } catch (error) {
        logger.error(`LLM generation failed for user ${user.profile_id}, problem ${problem}:`, error);
        totalErrors++;
      }
    }
  }

  logger.info('LLM nudge generation complete', {
    usersProcessed: users.length,
    totalGenerated,
    totalSkipped,
    totalErrors
  });
}

// 実行
runGenerateNudges()
  .then(() => {
    logger.info('Cron job finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Cron job failed:', error);
    process.exit(1);
  });
