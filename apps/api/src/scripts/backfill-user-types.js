/**
 * 1.5.0 Backfill: Classify all existing users into user types.
 *
 * Run once after migration: node apps/api/src/scripts/backfill-user-types.js
 *
 * - Cursor-based batch processing (200 users per batch)
 * - pg_try_advisory_lock(150002) on a single client to prevent concurrent execution
 * - Imports classifyUserType from userTypeService (single source of truth)
 */

import pg from 'pg';
import { classifyUserType } from '../services/userTypeService.js';

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

const BATCH_SIZE = 200;
const LOCK_ID = 150002;

async function runBackfill() {
  console.log('✅ [BackfillUserTypes] Starting backfill');

  // Use a single dedicated client for advisory lock (session-scoped)
  const client = await pool.connect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1)', [LOCK_ID]);
    if (!lockResult.rows[0].pg_try_advisory_lock) {
      console.log('⚠️ [BackfillUserTypes] Already running, skipping');
      return;
    }

    try {
      let cursor = null;
      let totalProcessed = 0;
      let totalClassified = 0;
      let totalSkipped = 0;

      while (true) {
        // Fetch batch using cursor-based pagination (ordered by user_id)
        const batchResult = cursor
          ? await client.query(`
              SELECT user_id, COALESCE(profile->'struggles', profile->'problems', '[]'::jsonb) as problems
              FROM mobile_profiles
              WHERE user_id > $1
              ORDER BY user_id
              LIMIT $2
            `, [cursor, BATCH_SIZE])
          : await client.query(`
              SELECT user_id, COALESCE(profile->'struggles', profile->'problems', '[]'::jsonb) as problems
              FROM mobile_profiles
              ORDER BY user_id
              LIMIT $1
            `, [BATCH_SIZE]);

        const batch = batchResult.rows;
        if (batch.length === 0) break;

        // Filter out users without a profiles record (FK dependency)
        const userIds = batch.map(u => u.user_id);
        const profileCheck = await client.query(
          `SELECT id FROM profiles WHERE id = ANY($1::uuid[])`,
          [userIds]
        );
        const profileIdSet = new Set(profileCheck.rows.map(r => r.id));

        // Prepare batch UPSERT values
        const values = [];
        const placeholders = [];
        let paramIdx = 1;

        for (const user of batch) {
          if (!profileIdSet.has(user.user_id)) {
            console.warn(`[backfill] Skipping user ${user.user_id}: no profile record (FK dependency)`);
            totalSkipped++;
            totalProcessed++;
            continue;
          }
          const problems = Array.isArray(user.problems) ? user.problems : JSON.parse(user.problems || '[]');
          const result = classifyUserType(problems);

          if (result.confidence > 0) {
            placeholders.push(`($${paramIdx}::uuid, $${paramIdx + 1}, $${paramIdx + 2}::jsonb, $${paramIdx + 3}::numeric, NOW(), NOW())`);
            values.push(user.user_id, result.primaryType, JSON.stringify(result.scores), result.confidence);
            paramIdx += 4;
            totalClassified++;
          } else {
            totalSkipped++;
          }
          totalProcessed++;
        }

        // Batch UPSERT
        if (placeholders.length > 0) {
          await client.query(`
            INSERT INTO user_type_estimates (user_id, primary_type, type_scores, confidence, created_at, updated_at)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (user_id) DO UPDATE SET
              primary_type = EXCLUDED.primary_type,
              type_scores = EXCLUDED.type_scores,
              confidence = EXCLUDED.confidence,
              updated_at = NOW()
          `, values);
        }

        cursor = batch[batch.length - 1].user_id;
        console.log(`📋 [BackfillUserTypes] Processed ${totalProcessed} users (${totalClassified} classified, ${totalSkipped} skipped)`);
      }

      console.log(`✅ [BackfillUserTypes] Complete: ${totalProcessed} total, ${totalClassified} classified, ${totalSkipped} skipped`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

// Entry point
runBackfill()
  .then(async () => {
    console.log('✅ [BackfillUserTypes] Script finished successfully');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ [BackfillUserTypes] Script failed:', error.message);
    await pool.end();
    process.exit(1);
  });
