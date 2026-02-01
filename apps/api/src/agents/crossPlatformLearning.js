/**
 * Cross-Platform Learning Module (Phase 5)
 *
 * Z-Score normalization across App, TikTok, and X platforms.
 * Promotion pipeline: X → TikTok → App Nudge.
 */

// ── Z-Score Constants ───────────────────────────────────────────────────────
// Initial baselines (updated daily from actual data via refreshBaselines)
let APP_MEAN = 0.25;   // avg app tap rate
let APP_STDDEV = 0.15;
let TIK_MEAN = 0.05;   // avg TikTok like rate
let TIK_STDDEV = 0.03;
let X_MEAN = 0.02;     // avg X engagement rate
let X_STDDEV = 0.015;

// Minimum sample sizes for statistical significance
const MIN_APP_SAMPLES = 5;
const MIN_TIKTOK_SAMPLES = 3;
const MIN_X_SAMPLES = 10;

// Weights: App (most reliable signal) > TikTok > X
const W_APP = 0.5;
const W_TIK = 0.3;
const W_X = 0.2;

// Promotion thresholds
const X_TO_TIKTOK_THRESHOLD = 1.0;
const TIKTOK_TO_APP_THRESHOLD = 1.5;

// ── Z-Score Calculation ─────────────────────────────────────────────────────

/**
 * Calculate unified Z-Score for a hook candidate.
 *
 * @param {object} hook
 * @param {number} hook.appTapRate - App tap rate (0-1)
 * @param {number} hook.appSampleSize - Number of app nudge sends
 * @param {number} hook.tiktokLikeRate - TikTok like rate (0-1)
 * @param {number} hook.tiktokSampleSize - Number of TikTok posts
 * @param {number} hook.xEngagementRate - X engagement rate (0-1)
 * @param {number} hook.xSampleSize - Number of X posts
 * @returns {number} Unified Z-Score
 */
export function unifiedScore(hook) {
  const appZ = hook.appSampleSize >= MIN_APP_SAMPLES
    ? (hook.appTapRate - APP_MEAN) / (APP_STDDEV || 1) : 0;
  const tikZ = hook.tiktokSampleSize >= MIN_TIKTOK_SAMPLES
    ? (hook.tiktokLikeRate - TIK_MEAN) / (TIK_STDDEV || 1) : 0;
  const xZ = hook.xSampleSize >= MIN_X_SAMPLES
    ? (hook.xEngagementRate - X_MEAN) / (X_STDDEV || 1) : 0;

  return W_APP * appZ + W_TIK * tikZ + W_X * xZ;
}

/**
 * Calculate individual platform Z-Score.
 * @param {number} value
 * @param {number} mean
 * @param {number} stddev
 * @returns {number}
 */
export function zScore(value, mean, stddev) {
  if (!stddev || stddev === 0) return 0;
  return (value - mean) / stddev;
}

// ── Baseline Refresh ────────────────────────────────────────────────────────

/**
 * Refresh Z-Score baselines from actual DB data.
 * Called during daily cron job.
 *
 * @param {Function} query - DB query function
 */
export async function refreshBaselines(query) {
  // App baselines: from nudge_outcomes
  const appResult = await query(`
    SELECT
      AVG(CASE WHEN no.reward = 1 THEN 1.0 ELSE 0.0 END) as mean_tap_rate,
      STDDEV_POP(CASE WHEN no.reward = 1 THEN 1.0 ELSE 0.0 END) as stddev_tap_rate
    FROM nudge_events ne
    JOIN nudge_outcomes no ON no.nudge_event_id = ne.id
    WHERE ne.domain = 'problem_nudge'
      AND ne.created_at >= NOW() - INTERVAL '30 days'
  `);

  if (appResult.rows[0]?.mean_tap_rate != null) {
    APP_MEAN = Number(appResult.rows[0].mean_tap_rate);
    APP_STDDEV = Math.max(Number(appResult.rows[0].stddev_tap_rate) || 0.15, 0.01);
  }

  // TikTok baselines: from hook_candidates tiktok metrics
  const tikResult = await query(`
    SELECT
      AVG(tiktok_like_rate) as mean_like_rate,
      STDDEV_POP(tiktok_like_rate) as stddev_like_rate
    FROM hook_candidates
    WHERE tiktok_like_rate > 0
  `);

  if (tikResult.rows[0]?.mean_like_rate != null) {
    TIK_MEAN = Number(tikResult.rows[0].mean_like_rate);
    TIK_STDDEV = Math.max(Number(tikResult.rows[0].stddev_like_rate) || 0.03, 0.001);
  }

  // X baselines: from x_posts
  try {
    const xResult = await query(`
      SELECT
        AVG(engagement_rate) as mean_engagement,
        STDDEV_POP(engagement_rate) as stddev_engagement
      FROM x_posts
      WHERE engagement_rate > 0
    `);

    if (xResult.rows[0]?.mean_engagement != null) {
      X_MEAN = Number(xResult.rows[0].mean_engagement);
      X_STDDEV = Math.max(Number(xResult.rows[0].stddev_engagement) || 0.015, 0.001);
    }
  } catch {
    // x_posts table may not exist yet
  }
}

// ── Promotion Pipeline ──────────────────────────────────────────────────────

/**
 * Identify hook candidates eligible for promotion.
 *
 * @param {Function} query - DB query function
 * @returns {Promise<{ xToTiktok: Array, tiktokToApp: Array }>}
 */
export async function identifyPromotions(query) {
  // X → TikTok promotion candidates
  const xCandidates = await query(`
    SELECT
      hc.id, hc.text, hc.tone,
      hc.x_engagement_rate, hc.x_sample_size,
      hc.tiktok_like_rate, hc.tiktok_share_rate,
      hc.promoted
    FROM hook_candidates hc
    WHERE hc.x_sample_size >= $1
      AND hc.x_high_performer = true
      AND hc.promoted = false
    ORDER BY hc.x_engagement_rate DESC
    LIMIT 20
  `, [MIN_X_SAMPLES]);

  const xToTiktok = xCandidates.rows.filter((hc) => {
    const xZ = zScore(Number(hc.x_engagement_rate), X_MEAN, X_STDDEV);
    return xZ >= X_TO_TIKTOK_THRESHOLD;
  });

  // TikTok → App promotion candidates
  let tiktokToApp = [];
  try {
    const tikCandidates = await query(`
      SELECT
        hc.id, hc.text, hc.tone,
        hc.tiktok_like_rate, hc.tiktok_share_rate,
        hc.x_engagement_rate, hc.x_sample_size
      FROM hook_candidates hc
      WHERE hc.tiktok_high_performer = true
        AND hc.source != 'manual'
      ORDER BY hc.tiktok_like_rate DESC
      LIMIT 20
    `);

    tiktokToApp = tikCandidates.rows.filter((hc) => {
      const score = unifiedScore({
        appTapRate: 0, appSampleSize: 0,  // not yet in app
        tiktokLikeRate: Number(hc.tiktok_like_rate || 0),
        tiktokSampleSize: MIN_TIKTOK_SAMPLES,  // already filtered
        xEngagementRate: Number(hc.x_engagement_rate || 0),
        xSampleSize: Number(hc.x_sample_size || 0),
      });
      return score >= TIKTOK_TO_APP_THRESHOLD;
    });
  } catch {
    // columns may not exist yet
  }

  return { xToTiktok, tiktokToApp };
}

/**
 * Execute promotions: mark hook_candidates as promoted and update source.
 *
 * @param {Function} query - DB query function
 * @param {Array} hookIds - IDs of hooks to promote
 * @param {string} newSource - Source label for promoted hooks
 */
export async function executePromotions(query, hookIds, newSource) {
  if (!hookIds.length) return;

  await query(
    `UPDATE hook_candidates SET promoted = true, source = $1 WHERE id = ANY($2::uuid[])`,
    [newSource, hookIds]
  );
}

/**
 * Update X metrics on hook_candidates from x_posts data.
 * Called by daily cron to sync cross-platform metrics.
 *
 * @param {Function} query - DB query function
 */
export async function syncXMetricsToHookCandidates(query) {
  try {
    await query(`
      UPDATE hook_candidates hc SET
        x_engagement_rate = sub.avg_engagement,
        x_sample_size = sub.post_count,
        x_high_performer = (sub.avg_engagement > $1)
      FROM (
        SELECT
          xp.hook_candidate_id,
          AVG(xp.engagement_rate) as avg_engagement,
          COUNT(*) as post_count
        FROM x_posts xp
        WHERE xp.hook_candidate_id IS NOT NULL
          AND xp.metrics_fetched_at IS NOT NULL
        GROUP BY xp.hook_candidate_id
      ) sub
      WHERE hc.id = sub.hook_candidate_id
    `, [X_MEAN + X_STDDEV]);  // high performer = above 1σ
  } catch {
    // x_posts may not exist yet
  }
}

// ── Exports for testing ─────────────────────────────────────────────────────

export function _getBaselines() {
  return { APP_MEAN, APP_STDDEV, TIK_MEAN, TIK_STDDEV, X_MEAN, X_STDDEV };
}

export function _setBaselines({ appMean, appStddev, tikMean, tikStddev, xMean, xStddev }) {
  if (appMean != null) APP_MEAN = appMean;
  if (appStddev != null) APP_STDDEV = appStddev;
  if (tikMean != null) TIK_MEAN = tikMean;
  if (tikStddev != null) TIK_STDDEV = tikStddev;
  if (xMean != null) X_MEAN = xMean;
  if (xStddev != null) X_STDDEV = xStddev;
}

export {
  X_TO_TIKTOK_THRESHOLD,
  TIKTOK_TO_APP_THRESHOLD,
  MIN_APP_SAMPLES,
  MIN_TIKTOK_SAMPLES,
  MIN_X_SAMPLES,
  W_APP,
  W_TIK,
  W_X,
};
