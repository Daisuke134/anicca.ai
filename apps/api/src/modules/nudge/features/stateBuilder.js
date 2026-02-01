import { query } from '../../../lib/db.js';
import { getLocalHour, getLocalDayOfWeek } from '../../../utils/timezone.js';

// Struggles fixed order (tech-bandit-v3.md)
export const STRUGGLE_ORDER = [
  'late_sleep',
  'sns_addiction',
  'self_loathing',
  'anxiety',
  'anger',
  'jealousy',
  'sedentary',
  'procrastination',
  'perfectionism',
  'burnout'
];

export function normalizeBig5(big5) {
  const src = big5 && typeof big5 === 'object' ? big5 : {};
  const to01 = (v) => {
    if (v == null) return 0;
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    // Accept 0-1 or 0-100
    return n > 1 ? Math.max(0, Math.min(1, n / 100)) : Math.max(0, Math.min(1, n));
  };
  return {
    O: to01(src.O),
    C: to01(src.C),
    E: to01(src.E),
    A: to01(src.A),
    N: to01(src.N)
  };
}

export async function getUserTimezone(profileId) {
  const r = await query(
    `select timezone
       from user_settings
      where user_id = $1::uuid
      limit 1`,
    [profileId]
  );
  return r.rows?.[0]?.timezone || 'UTC';
}

export async function getUserTraits(profileId) {
  const r = await query(
    `select ideals, struggles, big5, nudge_intensity, sticky_mode
       from user_traits
      where user_id = $1::uuid
      limit 1`,
    [profileId]
  );
  const row = r.rows?.[0] || {};
  return {
    ideals: row.ideals || [],
    struggles: row.struggles || [],
    big5: row.big5 || {},
    nudgeIntensity: row.nudge_intensity || 'normal',
    stickyMode: row.sticky_mode ?? false
  };
}

export function calculateRuminationProxy(data) {
  const lateNight = Math.min(Number(data?.lateNightSnsMinutes ?? 0) / 60, 1.0) * 0.4;
  const total = Number(data?.totalScreenTime ?? 0);
  const sns = Number(data?.snsMinutes ?? 0);
  const ratio = total > 0 ? sns / total : 0;
  const snsScore = Math.max(0, Math.min(1, ratio)) * 0.3;
  const sleepWindow = Math.min(Number(data?.sleepWindowPhoneMinutes ?? 0) / 30, 1.0) * 0.3;
  const longest = Number(data?.longestNoUseHours ?? 0);
  const restBonus = longest >= 7 && longest <= 9 ? -0.2 : 0;
  return Math.max(0, Math.min(1, lateNight + snsScore + sleepWindow + restBonus));
}

export async function buildScreenState({ profileId, now = new Date(), tz }) {
  const timezone = tz || 'UTC';
  const traits = await getUserTraits(profileId);
  // daily_metrics table is dead (iOS never writes). Return null-safe defaults.
  return {
    localHour: getLocalHour(now, timezone),
    dayOfWeek: getLocalDayOfWeek(now, timezone),
    snsCurrentSessionMinutes: 0,
    snsMinutesToday: 0,
    sleepDebtHours: 0,
    big5: normalizeBig5(traits.big5),
    struggles: traits.struggles || [],
    nudgeIntensity: traits.nudgeIntensity || 'normal',
    recentFeelingCounts: {}
  };
}

export async function buildMovementState({ profileId, now = new Date(), tz }) {
  const timezone = tz || 'UTC';
  const traits = await getUserTraits(profileId);
  // daily_metrics table is dead (iOS never writes). Return null-safe defaults.
  return {
    localHour: getLocalHour(now, timezone),
    dayOfWeek: getLocalDayOfWeek(now, timezone),
    sedentaryMinutesCurrent: 0,
    sedentaryMinutesToday: 0,
    stepsToday: 0,
    recentActivityEvents: [],
    sleepDebtHours: 0,
    big5: normalizeBig5(traits.big5),
    struggles: traits.struggles || [],
    nudgeIntensity: traits.nudgeIntensity || 'normal'
  };
}










