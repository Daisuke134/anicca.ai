/**
 * Phase 7+8: LLM生成Nudge - Cron Job
 *
 * 毎朝5:00 JST (20:00 UTC) に実行
 * Day 1: ルールベース、Day 2+: LLMで生成
 *
 * Railway Cron Schedule: 0 20 * * *
 * 環境変数: CRON_MODE=nudges
 */

import pg from 'pg';
import crypto from 'crypto';
import {
  shouldUseLLM,
  buildUserStory,
  getHookContentPerformance,
  getTimingPerformance,
  getWeeklyPatterns,
  generateWithFallback,
  buildPhase78Prompt,
  generateRuleBasedNudges
} from './nudgeHelpers.js';
import { classifyUserType, TYPE_NAMES } from '../services/userTypeService.js';

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

// 1.5.0: Get user type from DB or compute on-the-fly
async function getUserTypeForNudge(userId, problems) {
  // Try DB first
  const dbResult = await query(
    `SELECT primary_type, type_scores, confidence FROM user_type_estimates WHERE user_id = $1::uuid`,
    [userId]
  );
  if (dbResult.rows.length > 0) {
    const row = dbResult.rows[0];
    return { primaryType: row.primary_type, scores: row.type_scores, confidence: Number(row.confidence) };
  }
  // Fallback: compute from problems
  return classifyUserType(problems);
}

// 1.5.0: Get cross-user patterns from type_stats (only if data exists)
async function getCrossUserPatterns(userType) {
  const result = await query(`
    SELECT type_id, tone, tapped_count, ignored_count, thumbs_up_count, sample_size, tap_rate, thumbs_up_rate
    FROM type_stats
    WHERE type_id = $1 AND sample_size >= 10
    ORDER BY tap_rate DESC
  `, [userType]);
  return result.rows;
}

// 1.5.0: Build cross-user patterns prompt section
function buildCrossUserPatternsSection(userType, typeStats) {
  const typeName = TYPE_NAMES[userType] || userType;
  let section = `\n## 📊 Cross-User Patterns (What works for similar users)\n`;
  section += `\nThis user is estimated to be Type: **${typeName} (${userType})**\n`;

  const effective = typeStats.filter(s => Number(s.tap_rate) > 0.5);
  const ineffective = typeStats.filter(s => Number(s.tap_rate) <= 0.35);

  if (effective.length > 0) {
    section += `\n### What works for ${userType} users:\n`;
    for (const s of effective) {
      section += `- Tone: ${s.tone} (tap率 ${(Number(s.tap_rate) * 100).toFixed(0)}%, 👍率 ${(Number(s.thumbs_up_rate) * 100).toFixed(0)}%)\n`;
    }
  }

  if (ineffective.length > 0) {
    section += `\n### What doesn't work for ${userType} users:\n`;
    for (const s of ineffective) {
      section += `- Tone: ${s.tone} (tap率 ${(Number(s.tap_rate) * 100).toFixed(0)}%) ❌\n`;
    }
  }

  return section;
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

// メイン処理 (Phase 7+8)
async function runGenerateNudges() {
  console.log('✅ [GenerateNudges] Starting Phase 7+8 nudge generation cron job');

  // 1. 全アクティブユーザーを取得
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
  let totalRuleBased = 0;
  let totalErrors = 0;

  // 2. 各ユーザーに対して処理
  for (const user of users) {
    const problems = user.problems || [];
    const preferredLanguage = user.preferred_language || 'en';
    const limits = CHAR_LIMITS[preferredLanguage] || CHAR_LIMITS.en;

    try {
      // 1.5.0: Get user type for cross-user learning
      const userTypeResult = await getUserTypeForNudge(user.user_id, problems);
      const userType = userTypeResult.primaryType;

      // Phase 7+8: Day 1判定
      const useLLM = await shouldUseLLM(query, user.user_id);
      let scheduleResult;

      if (useLLM) {
        // Day 2+: LLM生成
        console.log(`🤖 [GenerateNudges] User ${user.user_id}: Day 2+ → LLM mode`);

        // ストーリー形式でコンテキスト構築
        const userStory = await buildUserStory(query, user.user_id);
        const hookContentPerformance = await getHookContentPerformance(query, user.user_id, problems);
        const timingPerformance = await getTimingPerformance(query, user.user_id, problems);
        const weeklyPatterns = await getWeeklyPatterns(query, user.user_id, problems);

        // 1.5.0: Inject cross-user patterns into prompt (graceful degradation if empty)
        let crossUserSection = '';
        const typeStats = await getCrossUserPatterns(userType);
        if (typeStats.length > 0) {
          crossUserSection = buildCrossUserPatternsSection(userType, typeStats);
        }

        // 1.5.0 Track C: TikTok high-performer hooks + Wisdom patterns
        let tiktokHighPerformerSection = '';
        let wisdomSection = '';
        try {
          const highPerformers = await query(
            `SELECT text, tone, tiktok_like_rate, tiktok_share_rate, tiktok_sample_size
             FROM hook_candidates
             WHERE tiktok_high_performer = true
             ORDER BY tiktok_like_rate DESC LIMIT 5`
          );
          if (highPerformers.rows.length > 0) {
            tiktokHighPerformerSection = '\n## 🎯 TikTok High Performers\nThese hooks performed well on TikTok. Consider using similar patterns:\n';
            for (const h of highPerformers.rows) {
              tiktokHighPerformerSection += `- "${h.text}" (tone: ${h.tone}, like率: ${(Number(h.tiktok_like_rate) * 100).toFixed(0)}%, share率: ${(Number(h.tiktok_share_rate) * 100).toFixed(0)}%)\n`;
            }
          }

          const wisdomPatterns = await query(
            `SELECT pattern_name, target_user_types, effective_tone, app_evidence, tiktok_evidence
             FROM wisdom_patterns
             WHERE verified_at IS NOT NULL
             ORDER BY confidence DESC LIMIT 3`
          );
          if (wisdomPatterns.rows.length > 0) {
            wisdomSection = '\n## 🌟 Wisdom (Proven across app AND TikTok)\n';
            for (const w of wisdomPatterns.rows) {
              const appEv = typeof w.app_evidence === 'string' ? JSON.parse(w.app_evidence) : w.app_evidence;
              const tikEv = typeof w.tiktok_evidence === 'string' ? JSON.parse(w.tiktok_evidence) : w.tiktok_evidence;
              wisdomSection += `\n### Pattern: ${w.pattern_name}\n`;
              wisdomSection += `- Works for: ${(w.target_user_types || []).join(', ')}\n`;
              wisdomSection += `- Tone: ${w.effective_tone}\n`;
              wisdomSection += `- Evidence: App tap率 ${((appEv.tapRate || 0) * 100).toFixed(0)}%, TikTok like率 ${((tikEv.likeRate || 0) * 100).toFixed(0)}%\n`;
            }
          }
        } catch (err) {
          console.warn(`⚠️ [GenerateNudges] Track C injection failed (non-fatal): ${err.message}`);
        }

        const prompt = buildPhase78Prompt({
          problems,
          preferredLanguage,
          userStory,
          hookContentPerformance,
          timingPerformance,
          weeklyPatterns,
          crossUserPatterns: crossUserSection,
          tiktokHighPerformers: tiktokHighPerformerSection,
          wisdomPatterns: wisdomSection,
        });

        // 3-tier fallback
        scheduleResult = await generateWithFallback(prompt, OPENAI_API_KEY, preferredLanguage);

        if (!scheduleResult) {
          // Tier 3: ルールベースにフォールバック
          console.log(`⚠️ [GenerateNudges] User ${user.user_id}: LLM failed, falling back to rule-based`);
          scheduleResult = generateRuleBasedNudges(problems, preferredLanguage);
          totalRuleBased++;
        }
      } else {
        // Day 1: ルールベース
        console.log(`📋 [GenerateNudges] User ${user.user_id}: Day 1 → Rule-based mode`);
        scheduleResult = generateRuleBasedNudges(problems, preferredLanguage);
        totalRuleBased++;
      }

      // スケジュールをDBに保存
      for (const item of scheduleResult.schedule) {
        const nudgeId = crypto.randomUUID();
        const [hour, minute] = item.scheduledTime.split(':').map(Number);

        await query(
          `INSERT INTO nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, timezone('utc', now()))`,
          [
            nudgeId,
            user.user_id,
            'problem_nudge',
            item.problemType,
            useLLM ? 'llm_generation' : 'rule_based',
            JSON.stringify({
              id: nudgeId,
              scheduledTime: item.scheduledTime,
              scheduledHour: hour,  // 後方互換
              hook: item.hook.slice(0, limits.hook * 2),
              content: item.content.slice(0, limits.content * 2),
              tone: item.tone,
              reasoning: item.reasoning,
              rootCauseHypothesis: item.rootCauseHypothesis || null,
              language: preferredLanguage,
              overallStrategy: scheduleResult.overallStrategy,
              user_type: userType,  // 1.5.0: for aggregateTypeStats
            }),
            'notification',
            'push',
            false
          ]
        );

        totalGenerated++;

        if (process.env.LOG_NUDGE_CONTENT === 'true') {
          console.log(`📝 [GenerateNudges] ${item.scheduledTime} ${item.problemType}: "${item.hook}"`);
        }
      }

      console.log(`✅ [GenerateNudges] User ${user.user_id}: ${scheduleResult.schedule.length} nudges scheduled`);

    } catch (error) {
      console.error(`❌ [GenerateNudges] Failed for user ${user.user_id}:`, error.message);
      totalErrors++;
    }
  }

  console.log(`✅ [GenerateNudges] Complete: ${totalGenerated} generated, ${totalRuleBased} rule-based, ${totalErrors} errors`);
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
