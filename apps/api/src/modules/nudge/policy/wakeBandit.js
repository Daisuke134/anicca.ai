import { LinTSModel, generateFeatureOrderHash } from './linTS.js';
import { STRUGGLE_ORDER } from '../features/stateBuilder.js';

// Action mapping (v3-data.md / tech-bandit-v3.md)
export const WAKE_ACTIONS = [
  'do_nothing',
  'gentle_wake',
  'direct_wake',
  'future_ref_wake'
];

export const BEDTIME_ACTIONS = [
  'do_nothing',
  'gentle_bedtime',
  'firm_bedtime',
  'psychoedu_bedtime'
];

function commonFeatureFields() {
  return [
    'bias',
    'localHour_sin', 'localHour_cos',
    'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6',
    'sleepDebtHours',
    'snsMinutesToday_norm',
    'stepsToday_norm',
    'sedentaryMinutesToday_norm',
    'big5_O', 'big5_C', 'big5_E', 'big5_A', 'big5_N',
    ...STRUGGLE_ORDER.map(s => `struggle_${s}`),
    'nudge_quiet', 'nudge_normal', 'nudge_active',
    'feeling_self_loathing_norm', 'feeling_anxiety_norm'
  ];
}

function domainFields() {
  return [
    'avgWake7d_norm',
    'avgBedtime7d_norm',
    'wakeSuccessRate7d',
    'bedtimeSuccessRate7d',
    'snsMinutesLast60_norm',
    'snsLongUseAtNight'
  ];
}

export function encodeWakeState(state) {
  const fields = [];
  const x = [];

  // bias
  fields.push('bias'); x.push(1);

  const hour = Number(state.localHour ?? 0);
  const sin = Math.sin((2 * Math.PI * hour) / 24);
  const cos = Math.cos((2 * Math.PI * hour) / 24);
  fields.push('localHour_sin'); x.push(sin);
  fields.push('localHour_cos'); x.push(cos);

  const dow = Number(state.dayOfWeek ?? 0);
  for (let i = 0; i < 7; i++) {
    fields.push(`dow_${i}`);
    x.push(i === dow ? 1 : 0);
  }

  // clip [-5,5] (kept as raw per tech-bandit; model learns scale)
  fields.push('sleepDebtHours'); x.push(Math.max(-5, Math.min(5, Number(state.sleepDebtHours ?? 0))));

  // day totals (normalize)
  fields.push('snsMinutesToday_norm'); x.push(Math.min(Number(state.snsMinutesToday ?? 0), 600) / 600);
  fields.push('stepsToday_norm'); x.push(Math.min(Number(state.stepsToday ?? 0), 15000) / 15000);
  fields.push('sedentaryMinutesToday_norm'); x.push(Math.min(Number(state.sedentaryMinutesToday ?? 0), 180) / 180);

  const b = state.big5 || {};
  fields.push('big5_O'); x.push(Number(b.O ?? 0));
  fields.push('big5_C'); x.push(Number(b.C ?? 0));
  fields.push('big5_E'); x.push(Number(b.E ?? 0));
  fields.push('big5_A'); x.push(Number(b.A ?? 0));
  fields.push('big5_N'); x.push(Number(b.N ?? 0));

  const struggles = Array.isArray(state.struggles) ? state.struggles : [];
  for (const s of STRUGGLE_ORDER) {
    fields.push(`struggle_${s}`);
    x.push(struggles.includes(s) ? 1 : 0);
  }

  const intensity = String(state.nudgeIntensity || 'normal');
  fields.push('nudge_quiet'); x.push(intensity === 'quiet' ? 1 : 0);
  fields.push('nudge_normal'); x.push(intensity === 'normal' ? 1 : 0);
  fields.push('nudge_active'); x.push(intensity === 'active' ? 1 : 0);

  const counts = state.recentFeelingCounts || {};
  fields.push('feeling_self_loathing_norm'); x.push(Math.min(Number(counts.self_loathing ?? 0), 10) / 10);
  fields.push('feeling_anxiety_norm'); x.push(Math.min(Number(counts.anxiety ?? 0), 10) / 10);

  // domain fields
  fields.push('avgWake7d_norm'); x.push(state.avgWake7d != null ? Math.max(0, Math.min(1, Number(state.avgWake7d) / 24)) : 0);
  fields.push('avgBedtime7d_norm'); x.push(state.avgBedtime7d != null ? Math.max(0, Math.min(1, Number(state.avgBedtime7d) / 24)) : 0);
  fields.push('wakeSuccessRate7d'); x.push(Math.max(0, Math.min(1, Number(state.wakeSuccessRate7d ?? 0))));
  fields.push('bedtimeSuccessRate7d'); x.push(Math.max(0, Math.min(1, Number(state.bedtimeSuccessRate7d ?? 0))));
  fields.push('snsMinutesLast60_norm'); x.push(Math.min(Number(state.snsMinutesLast60min ?? 0), 90) / 90);
  fields.push('snsLongUseAtNight'); x.push(state.snsLongUseAtNight ? 1 : 0);

  return { x, fields };
}

export async function loadWakeBandit({ domain = 'rhythm_wake' }) {
  const { x, fields } = encodeWakeState({
    localHour: 0,
    dayOfWeek: 0,
    sleepDebtHours: 0,
    snsMinutesToday: 0,
    stepsToday: 0,
    sedentaryMinutesToday: 0,
    big5: { O: 0, C: 0, E: 0, A: 0, N: 0 },
    struggles: [],
    nudgeIntensity: 'normal',
    recentFeelingCounts: {},
    avgWake7d: 0,
    avgBedtime7d: 0,
    wakeSuccessRate7d: 0,
    bedtimeSuccessRate7d: 0,
    snsMinutesLast60min: 0,
    snsLongUseAtNight: false
  });
  const featureOrderHash = generateFeatureOrderHash(fields);
  return LinTSModel.loadOrInit({
    domain,
    version: 1,
    featureDim: x.length,
    actionCount: 4,
    lambda: 1.0,
    v: 0.5,
    featureOrderHash
  });
}

export function actionIdToTemplate(domain, actionId) {
  const list = domain === 'rhythm_bedtime' ? BEDTIME_ACTIONS : WAKE_ACTIONS;
  return list[actionId] || 'do_nothing';
}




