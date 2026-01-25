/**
 * Phase 6: LLM生成Nudge - Cron Job
 *
 * 毎朝5:00 JST (20:00 UTC) に実行
 * 全アクティブユーザーに対してGPT-4o-miniでNudge文言を生成
 *
 * Railway Cron Schedule: 0 20 * * *
 * 環境変数: CRON_MODE=nudges
 */

import pg from 'pg';
import { fetch } from 'undici';
import crypto from 'crypto';

const { Pool } = pg;

// 直接環境変数から取得（environment.jsを使わない）
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is not set');
  process.exit(1);
}

// DB接続
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

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

// ユーザーの過去フィードバックを取得（パーソナライズ用）
async function getUserFeedback(userId, problem) {
  const result = await query(`
    SELECT
      ne.state->>'hook' as hook,
      ne.state->>'content' as content,
      ne.state->>'tone' as tone,
      no.reward,
      no.signals->>'outcome' as outcome,
      no.signals->>'thumbsUp' as thumbs_up,
      no.signals->>'thumbsDown' as thumbs_down
    FROM nudge_events ne
    LEFT JOIN nudge_outcomes no ON no.nudge_event_id = ne.id
    WHERE ne.user_id = $1::uuid
      AND ne.subtype = $2
      AND ne.domain = 'problem_nudge'
      AND ne.created_at >= NOW() - INTERVAL '30 days'
      AND no.id IS NOT NULL
    ORDER BY ne.created_at DESC
    LIMIT 20
  `, [userId, problem]);

  const rows = result.rows;
  if (rows.length === 0) return null;

  // 成功例（reward=1 または thumbsUp）
  const successful = rows
    .filter(r => r.reward === 1 || r.thumbs_up === 'true')
    .slice(0, 3)
    .map(r => `- "${r.hook}" → "${r.content}" (tone: ${r.tone})`);

  // 失敗例（reward=0 または thumbsDown または outcome=ignored）
  const failed = rows
    .filter(r => r.reward === 0 || r.thumbs_down === 'true' || r.outcome === 'ignored')
    .slice(0, 3)
    .map(r => `- "${r.hook}" → "${r.content}" (tone: ${r.tone})`);

  // 好まれるトーン（成功例から抽出）
  const successfulTones = rows
    .filter(r => r.reward === 1 || r.thumbs_up === 'true')
    .map(r => r.tone)
    .filter(Boolean);
  const preferredTone = successfulTones.length > 0
    ? [...new Set(successfulTones)].join(', ')
    : null;

  // 避けるべきトーン（失敗例から抽出）
  const failedTones = rows
    .filter(r => r.reward === 0 || r.thumbs_down === 'true')
    .map(r => r.tone)
    .filter(Boolean);
  const avoidedTone = failedTones.length > 0
    ? [...new Set(failedTones)].join(', ')
    : null;

  return { successful, failed, preferredTone, avoidedTone };
}

// 言語別の文字数制限
const CHAR_LIMITS = {
  ja: { hook: 12, content: 40 },
  en: { hook: 25, content: 80 }
};

// プロンプトを構築（パーソナライズ対応）
function buildPrompt(problem, preferredLanguage = 'en', feedback = null) {
  const isJapanese = preferredLanguage === 'ja';
  const limits = CHAR_LIMITS[preferredLanguage] || CHAR_LIMITS.en;

  const problemNamesJa = {
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

  const problemNamesEn = {
    staying_up_late: 'Staying Up Late',
    cant_wake_up: 'Can\'t Wake Up',
    self_loathing: 'Self-Loathing',
    rumination: 'Rumination',
    procrastination: 'Procrastination',
    anxiety: 'Anxiety',
    lying: 'Lying',
    bad_mouthing: 'Bad-Mouthing',
    porn_addiction: 'Porn Addiction',
    alcohol_dependency: 'Alcohol Dependency',
    anger: 'Anger',
    obsessive: 'Obsessive Thoughts',
    loneliness: 'Loneliness'
  };

  const problemNames = isJapanese ? problemNamesJa : problemNamesEn;
  const problemName = problemNames[problem] || problem;

  const toneDefinitions = isJapanese
    ? `- strict: 厳しい、直接的、言い訳を許さない。例：「まだ寝てる？」
- gentle: 優しい、共感的、寄り添う。例：「大丈夫」
- logical: 論理的、データや事実ベース。例：「睡眠不足は危険」
- provocative: 挑発的、プライドを刺激。例：「また負ける？」
- philosophical: 哲学的、深い問い。例：「この5分が…」`
    : `- strict: Direct, no excuses. Example: "Still in bed?"
- gentle: Kind, empathetic. Example: "It's okay, one step at a time."
- logical: Data-driven, factual. Example: "Sleep deprivation cuts judgment by 40%."
- provocative: Challenges pride. Example: "Gonna lose again?"
- philosophical: Deep questions. Example: "These 5 minutes could change everything."`;

  const exampleOutput = isJapanese
    ? `{
  "hook": "まだ布団の中？",
  "content": "あと5分で起きたら、今日は違う1日になる。",
  "tone": "strict",
  "reasoning": "Strict tone worked 3 times for this user. Gentle was ignored."
}`
    : `{
  "hook": "Still scrolling?",
  "content": "Put the phone down. Tomorrow-you will thank you.",
  "tone": "strict",
  "reasoning": "Strict tone worked for this user. Gentle was ignored twice."
}`;

  const languageInstruction = isJapanese
    ? '4. Use Japanese. Natural, conversational, not robotic.'
    : '4. Use English. Natural, conversational, not robotic.';

  // フィードバックセクションを構築（パーソナライズの核心）
  let feedbackSection = '';
  if (feedback) {
    feedbackSection += '\n## User Profile';
    if (feedback.preferredTone) {
      feedbackSection += `\n- Preferred tone: ${feedback.preferredTone} (this person responds well to this)`;
    }
    if (feedback.avoidedTone) {
      feedbackSection += `\n- Avoided tone: ${feedback.avoidedTone} (this person ignores or dislikes this)`;
    }
    feedbackSection += '\n';

    if (feedback.successful && feedback.successful.length > 0) {
      feedbackSection += `\n## ✅ What Worked (These hooks got tapped/liked)\n`;
      feedbackSection += feedback.successful.join('\n') + '\n';
    }

    if (feedback.failed && feedback.failed.length > 0) {
      feedbackSection += `\n## ❌ What Failed (These hooks were ignored/disliked)\n`;
      feedbackSection += feedback.failed.join('\n') + '\n';
    }
  }

  return `You are Anicca, an AI that reduces human suffering through perfectly-timed nudges.

## Your Mission
Generate a notification hook and one-screen content that will make this specific person take action. The notification alone should be powerful enough to change behavior.

## Problem Type
${problemName}
${feedbackSection}
## Tone Definitions
${toneDefinitions}

## Output Requirements

### Hook (Notification)
- Maximum ${limits.hook} characters (CRITICAL - must fit in notification preview)
- Action-oriented
- Uses the tone that WORKS for this person (see User Profile above)
- AVOID the tone that failed (see What Failed above)

### Content (One-Screen)
- Maximum ${limits.content} characters
- Specific action or insight
- Directly related to the hook

## Output Format (JSON)

${exampleOutput}

## Critical Rules
1. NEVER exceed character limits. Hook ≤ ${limits.hook}, Content ≤ ${limits.content}.
2. Output a SINGLE JSON object, not an array.
3. If past hooks failed, TRY SOMETHING DIFFERENT. Learn from What Worked and What Failed.
${languageInstruction}`;
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
  console.log('✅ [GenerateNudges] Starting LLM nudge generation cron job');

  // 1. 全アクティブユーザーを取得（struggles/problemsを持っている人）
  // profile JSONBの中にstruggles（新）またはproblems（旧）として保存されている
  // preferredLanguageも取得（デフォルトは'en'）
  const usersResult = await query(`
    SELECT DISTINCT
      mp.device_id as profile_id,
      mp.user_id,
      COALESCE(mp.profile->'struggles', mp.profile->'problems', '[]'::jsonb) as problems,
      COALESCE(mp.profile->>'preferredLanguage', 'en') as preferred_language
    FROM mobile_profiles mp
    WHERE (
      (mp.profile->'struggles' IS NOT NULL AND jsonb_array_length(mp.profile->'struggles') > 0)
      OR (mp.profile->'problems' IS NOT NULL AND jsonb_array_length(mp.profile->'problems') > 0)
    )
  `);

  const users = usersResult.rows;
  console.log(`✅ [GenerateNudges] Found ${users.length} users with problems`);

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 2. 各ユーザーに対して処理
  for (const user of users) {
    const problems = user.problems || [];
    const preferredLanguage = user.preferred_language || 'en';
    const limits = CHAR_LIMITS[preferredLanguage] || CHAR_LIMITS.en;

    for (const problem of problems) {
      // ユーザーの過去フィードバックを取得（パーソナライズ）
      const feedback = await getUserFeedback(user.user_id, problem);
      if (feedback) {
        console.log(`📊 [GenerateNudges] User ${user.user_id} feedback for ${problem}: ${feedback.successful?.length || 0} success, ${feedback.failed?.length || 0} failed, preferred: ${feedback.preferredTone || 'none'}, avoided: ${feedback.avoidedTone || 'none'}`);
      }

      const prompt = buildPrompt(problem, preferredLanguage, feedback);

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
          console.error(`❌ [GenerateNudges] OpenAI API error for user ${user.user_id}, problem ${problem}: ${response.status} ${errorText}`);
          totalErrors++;
          continue;
        }

        const data = await response.json();
        const rawOutput = JSON.parse(data.choices[0].message.content);

        // LLM出力バリデーション
        const validated = validateLLMOutput(rawOutput);
        if (!validated) {
          console.warn(`⚠️ [GenerateNudges] LLM output validation failed for user ${user.user_id}, problem ${problem}`);
          totalSkipped++;
          continue;
        }

        const scheduledHour = getScheduledHourForProblem(problem);
        const nudgeId = crypto.randomUUID();

        // DBに保存（言語別の文字数制限を適用）
        await query(
          `INSERT INTO nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, timezone('utc', now()))`,
          [
            nudgeId,
            user.user_id,  // ← 修正: device_id ではなく user_id を使用（API側と一致させる）
            'problem_nudge',
            problem,
            'llm_generation',
            JSON.stringify({
              id: nudgeId,
              scheduledHour: scheduledHour,
              hook: validated.hook.slice(0, limits.hook),
              content: validated.content.slice(0, limits.content),
              tone: validated.tone,
              reasoning: validated.reasoning,
              language: preferredLanguage
            }),
            'notification',
            'push',
            false
          ]
        );

        totalGenerated++;
    const hookPreview = String(validated.hook || '').slice(0, 80).replace(/\s+/g, ' ');
    const contentLen = String(validated.content || '').length;
    console.log(`✅ [GenerateNudges] User ${user.user_id}, ${problem}, tone=${validated.tone}, hookPreview="${hookPreview}", contentLen=${contentLen}`);
    if (process.env.LOG_NUDGE_CONTENT === 'true') {
      console.log(`📝 [GenerateNudges] hook="${validated.hook}"`);
      console.log(`📝 [GenerateNudges] content="${validated.content}"`);
    }

      } catch (error) {
        console.error(`❌ [GenerateNudges] LLM generation failed for user ${user.user_id}, problem ${problem}:`, error.message);
        totalErrors++;
      }
    }
  }

  console.log(`✅ [GenerateNudges] Complete: ${totalGenerated} generated, ${totalSkipped} skipped, ${totalErrors} errors`);
}

// 実行
runGenerateNudges()
  .then(async () => {
    console.log('✅ [GenerateNudges] Cron job finished successfully');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ [GenerateNudges] Cron job failed:', error.message);
    await pool.end();
    process.exit(1);
  });
