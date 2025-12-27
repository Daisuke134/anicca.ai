import { query } from '../../lib/db.js';
import baseLogger from '../../utils/logger.js';
import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
import { getMem0Client } from '../memory/mem0Client.js';
import { toLocalDateString } from '../../utils/timezone.js';

const logger = baseLogger.withContext('ContextSnapshot');

async function getUserSettings(profileId) {
  const r = await query(
    `select language, timezone
       from user_settings
      where user_id = $1::uuid
      limit 1`,
    [profileId]
  );
  const row = r.rows?.[0] || {};
  return {
    language: row.language || 'en',
    timezone: row.timezone || 'UTC'
  };
}

async function getTraits(profileId) {
  const r = await query(
    `select ideals, struggles, big5, keywords, summary, nudge_intensity, sticky_mode
       from user_traits
      where user_id = $1::uuid
      limit 1`,
    [profileId]
  );
  const row = r.rows?.[0];
  if (!row) {
    return {
      ideals: [],
      struggles: [],
      big5: {},
      keywords: [],
      summary: '',
      nudgeIntensity: 'normal',
      stickyMode: false
    };
  }
  return {
    ideals: row.ideals || [],
    struggles: row.struggles || [],
    big5: row.big5 || {},
    keywords: row.keywords || [],
    summary: row.summary || '',
    nudgeIntensity: row.nudge_intensity || 'normal',
    stickyMode: row.sticky_mode ?? false
  };
}

async function getTodayMetrics(profileId, localDate) {
  const r = await query(
    `select user_id, date,
            sleep_duration_min, sleep_start_at, wake_at,
            sns_minutes_total, sns_minutes_night,
            steps, sedentary_minutes,
            activity_summary, mind_summary, insights
       from daily_metrics
      where user_id = $1::uuid and date = $2::date
      limit 1`,
    [profileId, localDate]
  );
  return r.rows?.[0] || null;
}

async function getLatestFeeling(profileId) {
  const r = await query(
    `select id, feeling_id, started_at, ended_at, ema_better, action_template
       from feeling_sessions
      where user_id = $1::uuid
      order by started_at desc
      limit 1`,
    [profileId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    feelingId: row.feeling_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    emaBetter: row.ema_better,
    actionTemplate: row.action_template
  };
}

async function getMem0Buckets(profileId) {
  // Best-effort. Do not fail snapshot if mem0 is unavailable.
  try {
    const mem0 = getMem0Client();
    const [profile, interaction, behaviorSummary, nudgeMeta] = await Promise.all([
      mem0.search({ userId: profileId, query: 'profile', filters: { category: 'profile' }, topK: 3 }).catch(() => null),
      mem0.search({ userId: profileId, query: 'recent', filters: { category: 'interaction' }, topK: 3 }).catch(() => null),
      mem0.search({ userId: profileId, query: 'today', filters: { category: 'behavior_summary' }, topK: 3 }).catch(() => null),
      mem0.search({ userId: profileId, query: 'nudge', filters: { category: 'nudge_meta' }, topK: 3 }).catch(() => null)
    ]);
    return {
      profile: profile?.results || profile?.results?.results || profile?.results || [],
      interaction: interaction?.results || interaction?.results?.results || [],
      behavior_summary: behaviorSummary?.results || behaviorSummary?.results?.results || [],
      nudge_meta: nudgeMeta?.results || nudgeMeta?.results?.results || []
    };
  } catch (e) {
    logger.warn('mem0 snapshot failed', e);
    return { profile: [], interaction: [], behavior_summary: [], nudge_meta: [] };
  }
}

/**
 * Build a context snapshot for Realtime tools and for /realtime/session response.
 * Input userId can be uuid or apple_user_id; snapshot uses profileId (uuid) as stable key.
 */
export async function buildContextSnapshot({ userId, deviceId, now = new Date() }) {
  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return {
      profile_id: null,
      device_id: deviceId || null,
      error: { code: 'UNRESOLVED_PROFILE_ID', message: 'Could not resolve profile_id' }
    };
  }

  const settings = await getUserSettings(profileId);
  const localDate = toLocalDateString(now, settings.timezone);

  const [traits, today, feeling, mem0] = await Promise.all([
    getTraits(profileId),
    getTodayMetrics(profileId, localDate),
    getLatestFeeling(profileId),
    getMem0Buckets(profileId)
  ]);

  return {
    profile_id: profileId,
    device_id: deviceId || null,
    timezone: settings.timezone,
    language: settings.language,
    local_date: localDate,
    traits,
    today_stats: today
      ? {
          sleepDurationMin: today.sleep_duration_min ?? null,
          sleepStartAt: today.sleep_start_at ?? null,  // ★ 追加: Timeline用
          wakeAt: today.wake_at ?? null,
          snsMinutesTotal: today.sns_minutes_total ?? 0,
          steps: today.steps ?? 0,
          sedentaryMinutes: today.sedentary_minutes ?? 0,
          mindSummary: today.mind_summary ?? {},
          activitySummary: today.activity_summary ?? {},
          insights: today.insights ?? {}
        }
      : null,
    recent_feeling: feeling,
    mem0
  };
}



