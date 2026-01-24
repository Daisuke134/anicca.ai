import { LinTSModel, generateFeatureOrderHash } from './linTS.js';
import { STRUGGLE_ORDER } from '../features/stateBuilder.js';

export const MENTAL_ACTIONS = [
  'do_nothing',
  'soft_self_compassion',
  'cognitive_reframe',
  'behavioral_activation_micro',
  'metta_like'
];

function featureFields() {
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
    'feelingId_self_loathing', 'feelingId_anxiety', 'feelingId_anger', 'feelingId_jealousy', 'feelingId_other',
    'recentFeelingCount_norm',
    'recentFeelingCount7d_norm',
    'ruminationProxy_norm'
  ];
}

export function encodeMentalState(state) {
  const fields = [];
  const x = [];

  fields.push('bias'); x.push(1);
  const hour = Number(state.localHour ?? 0);
  fields.push('localHour_sin'); x.push(Math.sin((2 * Math.PI * hour) / 24));
  fields.push('localHour_cos'); x.push(Math.cos((2 * Math.PI * hour) / 24));

  const dow = Number(state.dayOfWeek ?? 0);
  for (let i = 0; i < 7; i++) {
    fields.push(`dow_${i}`);
    x.push(i === dow ? 1 : 0);
  }

  fields.push('sleepDebtHours'); x.push(Math.max(-5, Math.min(5, Number(state.sleepDebtHours ?? 0))));
  fields.push('snsMinutesToday_norm'); x.push(Math.min(Number(state.snsMinutesToday ?? 0), 600) / 600);

  // Unused in mental but kept for shared vector shape stability
  fields.push('stepsToday_norm'); x.push(0);
  fields.push('sedentaryMinutesToday_norm'); x.push(0);

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

  const fid = String(state.feelingId || 'other');
  fields.push('feelingId_self_loathing'); x.push(fid === 'self_loathing' ? 1 : 0);
  fields.push('feelingId_anxiety'); x.push(fid === 'anxiety' ? 1 : 0);
  fields.push('feelingId_anger'); x.push(fid === 'anger' ? 1 : 0);
  fields.push('feelingId_jealousy'); x.push(fid === 'jealousy' ? 1 : 0);
  fields.push('feelingId_other'); x.push(['self_loathing','anxiety','anger','jealousy'].includes(fid) ? 0 : 1);

  fields.push('recentFeelingCount_norm'); x.push(Math.min(Number(state.recentFeelingCount ?? 0), 10) / 10);
  fields.push('recentFeelingCount7d_norm'); x.push(Math.min(Number(state.recentFeelingCount7d ?? 0), 20) / 20);
  fields.push('ruminationProxy_norm'); x.push(Math.max(0, Math.min(1, Number(state.ruminationProxy ?? 0))));

  return { x, fields };
}

export async function loadMentalBandit() {
  const { x, fields } = encodeMentalState({
    localHour: 0,
    dayOfWeek: 0,
    feelingId: 'other',
    recentFeelingCount: 0,
    recentFeelingCount7d: 0,
    sleepDebtHours: 0,
    snsMinutesToday: 0,
    ruminationProxy: 0,
    big5: { O: 0, C: 0, E: 0, A: 0, N: 0 },
    struggles: [],
    nudgeIntensity: 'normal'
  });
  const featureOrderHash = generateFeatureOrderHash(fields);
  return LinTSModel.loadOrInit({
    domain: 'mental',
    version: 1,
    featureDim: x.length,
    actionCount: 5,
    lambda: 1.0,
    v: 0.7,
    featureOrderHash
  });
}

export function actionIdToTemplate(actionId) {
  return MENTAL_ACTIONS[actionId] || 'do_nothing';
}










