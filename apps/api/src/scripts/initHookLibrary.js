/**
 * Track B: Initialize Hook Library
 *
 * One-time script to populate hook_candidates from:
 * 1. Existing nudge_events data (extract top-performing hooks)
 * 2. Seed data (20 records based on persona, if extracted < 5)
 *
 * Run manually before Track B release:
 *   node apps/api/src/scripts/initHookLibrary.js
 *
 * Idempotent: Uses ON CONFLICT (text, tone) DO NOTHING
 */

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

// Persona-based seed hooks (Spec 11.4)
// Target: 25-35歳、6-7年間習慣化に失敗し続けている人
const SEED_HOOKS = [
  // strict tone
  { text: '6年間、何も変われなかった', tone: 'strict', problems: ['self_loathing', 'procrastination'], types: ['T1', 'T2'] },
  { text: '習慣アプリ10個全部挫折した人へ', tone: 'strict', problems: ['procrastination', 'self_loathing'], types: ['T1', 'T3'] },
  { text: 'また3日坊主で終わる？', tone: 'strict', problems: ['procrastination'], types: ['T3'] },
  { text: '「明日から本気出す」を何回言った？', tone: 'strict', problems: ['procrastination', 'staying_up_late'], types: ['T3', 'T4'] },
  { text: '自分との約束を何百回破った？', tone: 'strict', problems: ['self_loathing'], types: ['T1', 'T2'] },

  // gentle tone (DB constraint: strict, gentle, logical, provocative, philosophical)
  { text: '変われないのは、あなたのせいじゃない', tone: 'gentle', problems: ['self_loathing', 'anxiety'], types: ['T2', 'T4'] },
  { text: '挫折は失敗じゃなくて、まだ途中', tone: 'gentle', problems: ['self_loathing'], types: ['T1', 'T2'] },
  { text: '完璧じゃなくていい、1%だけ', tone: 'gentle', problems: ['procrastination', 'anxiety'], types: ['T1', 'T4'] },
  { text: '自分を責めるのをやめた日から変わった', tone: 'gentle', problems: ['self_loathing', 'rumination'], types: ['T2'] },
  { text: '7年間同じ苦しみを抱えてるあなたへ', tone: 'gentle', problems: ['self_loathing', 'anxiety'], types: ['T2', 'T4'] },

  // philosophical tone
  { text: '苦しみの原因は「変わりたい」という執着', tone: 'philosophical', problems: ['anxiety', 'rumination'], types: ['T1', 'T4'] },
  { text: '習慣化の本当の敵は意志力じゃない', tone: 'philosophical', problems: ['procrastination'], types: ['T1', 'T3'] },
  { text: '仏教が教える行動変容の科学', tone: 'philosophical', problems: ['anxiety', 'self_loathing'], types: ['T4'] },
  { text: 'なぜ「頑張る」では変われないのか', tone: 'philosophical', problems: ['procrastination', 'self_loathing'], types: ['T1', 'T3'] },
  { text: '諸行無常：変化は避けられない', tone: 'philosophical', problems: ['anxiety', 'rumination'], types: ['T4'] },

  // provocative tone
  { text: '習慣アプリが全部失敗する本当の理由', tone: 'provocative', problems: ['procrastination'], types: ['T3'] },
  { text: 'あなたの意志力は問題じゃない', tone: 'provocative', problems: ['self_loathing', 'procrastination'], types: ['T1', 'T3'] },
  { text: '95%の人が知らない挫折のメカニズム', tone: 'provocative', problems: ['procrastination', 'anxiety'], types: ['T3', 'T4'] },
  { text: 'セラピストが教えない行動変容の真実', tone: 'provocative', problems: ['anxiety', 'rumination'], types: ['T3'] },
  { text: '3日坊主は「仕様」です', tone: 'provocative', problems: ['procrastination', 'self_loathing'], types: ['T3', 'T1'] },
];

async function extractFromNudgeEvents(client) {
  // Extract top-performing hooks from existing nudge_events
  // Group by notification text + tone, calculate tap/thumbs_up rates
  const result = await client.query(`
    SELECT
      ne.state->>'hook' AS text,
      COALESCE(ne.tone, 'gentle') AS tone,
      ne.problem_type,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ne.state->>'tapped' = 'true') AS tapped,
      COUNT(*) FILTER (WHERE ne.state->>'thumbsUp' = 'true') AS thumbs_up
    FROM nudge_events ne
    WHERE ne.state->>'hook' IS NOT NULL
      AND ne.state->>'hook' != ''
      AND LENGTH(ne.state->>'hook') <= 100
    GROUP BY ne.state->>'hook', COALESCE(ne.tone, 'gentle'), ne.problem_type
    HAVING COUNT(*) >= 5
    ORDER BY
      COUNT(*) FILTER (WHERE ne.state->>'tapped' = 'true')::numeric / COUNT(*)::numeric DESC
    LIMIT 30
  `);

  return result.rows;
}

async function insertHooks(client, hooks) {
  let inserted = 0;
  for (const hook of hooks) {
    const result = await client.query(`
      INSERT INTO hook_candidates (
        id, text, tone, target_problem_types, target_user_types,
        app_tap_rate, app_thumbs_up_rate, app_sample_size,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7,
        NOW(), NOW()
      )
      ON CONFLICT (text, tone) DO NOTHING
      RETURNING id
    `, [
      hook.text,
      hook.tone,
      hook.problems || [],
      hook.types || [],
      hook.tapRate || 0,
      hook.thumbsUpRate || 0,
      hook.sampleSize || 0,
    ]);
    if (result.rowCount > 0) inserted++;
  }
  return inserted;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 [InitHookLibrary] Starting hook library initialization');

    // Step 1: Check existing hook_candidates count
    const existing = await client.query('SELECT COUNT(*) AS count FROM hook_candidates');
    const existingCount = parseInt(existing.rows[0].count);
    console.log(`📊 Existing hook_candidates: ${existingCount}`);

    if (existingCount >= 20) {
      console.log('✅ Hook library already initialized (>= 20 records). Skipping.');
      return;
    }

    // Step 2: Extract from nudge_events
    let extracted = [];
    try {
      extracted = await extractFromNudgeEvents(client);
      console.log(`📊 Extracted ${extracted.length} hooks from nudge_events`);
    } catch (err) {
      console.warn(`⚠️ Failed to extract from nudge_events (table may not exist): ${err.message}`);
    }

    // Step 3: Insert extracted hooks
    if (extracted.length > 0) {
      const extractedHooks = extracted.map((row) => ({
        text: row.text,
        tone: row.tone,
        problems: row.problem_type ? [row.problem_type] : [],
        types: [],
        tapRate: row.total > 0 ? row.tapped / row.total : 0,
        thumbsUpRate: row.total > 0 ? row.thumbs_up / row.total : 0,
        sampleSize: parseInt(row.total),
      }));
      const insertedExtracted = await insertHooks(client, extractedHooks);
      console.log(`✅ Inserted ${insertedExtracted} hooks from nudge_events`);
    }

    // Step 4: If total < 5, insert seed data
    const afterExtract = await client.query('SELECT COUNT(*) AS count FROM hook_candidates');
    const afterCount = parseInt(afterExtract.rows[0].count);

    if (afterCount < 5) {
      console.log(`📊 Only ${afterCount} hooks after extraction. Inserting seed data...`);
      const seedHooks = SEED_HOOKS.map((s) => ({
        text: s.text,
        tone: s.tone,
        problems: s.problems,
        types: s.types,
        tapRate: 0,
        thumbsUpRate: 0,
        sampleSize: 0,
      }));
      const insertedSeeds = await insertHooks(client, seedHooks);
      console.log(`✅ Inserted ${insertedSeeds} seed hooks`);
    }

    // Final count
    const finalCount = await client.query('SELECT COUNT(*) AS count FROM hook_candidates');
    console.log(`✅ [InitHookLibrary] Complete. Total hook_candidates: ${finalCount.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ [InitHookLibrary] Fatal error:', err);
  process.exit(1);
});
