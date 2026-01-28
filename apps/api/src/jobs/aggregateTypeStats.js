/**
 * 1.5.0 Cross-User Learning: Aggregate Type Stats
 *
 * Daily cron job (0 21 * * * = 6:00 JST) that aggregates
 * nudge performance by user_type × tone into type_stats table.
 *
 * Only processes nudge_events where state->>'user_type' is recorded.
 * Uses pg_try_advisory_lock on a single client to prevent concurrent execution.
 *
 * Railway Cron Schedule: 0 21 * * *
 * Environment: CRON_MODE=aggregate_type_stats
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

const LOCK_ID = 150001;

async function runAggregateTypeStats() {
  console.log('✅ [AggregateTypeStats] Starting daily aggregation');

  // Use a single dedicated client for advisory lock (session-scoped)
  const client = await pool.connect();
  try {
    // Advisory lock to prevent concurrent execution
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1)', [LOCK_ID]);
    const acquired = lockResult.rows[0].pg_try_advisory_lock;
    if (!acquired) {
      console.log('⚠️ [AggregateTypeStats] Already running, skipping');
      return;
    }

    try {
      const result = await client.query(`
        WITH aggregated AS (
          SELECT
            ne.state->>'user_type' AS type_id,
            ne.state->>'tone' AS tone,
            COUNT(*) AS total_events,
            SUM(CASE WHEN no.signals->>'outcome' = 'tapped' THEN 1 ELSE 0 END) AS tapped,
            SUM(CASE WHEN no.signals->>'outcome' IS NULL OR no.signals->>'outcome' != 'tapped' THEN 1 ELSE 0 END) AS ignored,
            SUM(CASE WHEN no.signals->>'outcome' = 'tapped' AND no.signals->>'thumbsUp' = 'true' THEN 1 ELSE 0 END) AS thumbs_up,
            SUM(CASE WHEN no.signals->>'outcome' = 'tapped' AND no.signals->>'thumbsDown' = 'true' THEN 1 ELSE 0 END) AS thumbs_down
          FROM nudge_events ne
          LEFT JOIN nudge_outcomes no ON no.nudge_event_id = ne.id
          WHERE ne.domain = 'problem_nudge'
            AND (ne.state->>'user_type') IS NOT NULL
            AND (ne.state->>'user_type') IN ('T1', 'T2', 'T3', 'T4')
            AND (ne.state->>'tone') IS NOT NULL
            AND (ne.state->>'tone') IN ('strict', 'gentle', 'logical', 'provocative', 'philosophical')
          GROUP BY ne.state->>'user_type', ne.state->>'tone'
        )
        INSERT INTO type_stats (type_id, tone, tapped_count, ignored_count, thumbs_up_count, thumbs_down_count, sample_size, updated_at)
        SELECT
          type_id,
          tone,
          tapped,
          ignored,
          thumbs_up,
          thumbs_down,
          tapped + ignored,
          NOW()
        FROM aggregated
        ON CONFLICT (type_id, tone) DO UPDATE SET
          tapped_count = EXCLUDED.tapped_count,
          ignored_count = EXCLUDED.ignored_count,
          thumbs_up_count = EXCLUDED.thumbs_up_count,
          thumbs_down_count = EXCLUDED.thumbs_down_count,
          sample_size = EXCLUDED.sample_size,
          updated_at = NOW()
      `);

      console.log(`✅ [AggregateTypeStats] Aggregation complete: ${result.rowCount} type×tone combinations updated`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

// Entry point
runAggregateTypeStats()
  .then(async () => {
    console.log('✅ [AggregateTypeStats] Cron job finished successfully');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ [AggregateTypeStats] Cron job failed:', error.message);
    await pool.end();
    process.exit(1);
  });
