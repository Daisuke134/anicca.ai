import { toLocalTimeHHMM } from '../../utils/timezone.js';
import { calculateRuminationProxy } from '../nudge/features/stateBuilder.js';  // 追加

/**
 * Build Behavior tab payload pieces from daily_metrics row.
 * This is a thin, deterministic mapper; richer insights may be generated upstream and stored into daily_metrics.insights.
 */
export function buildHighlights({ todayStats, timezone, language = 'en' }) {
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  const snsMinutesTotal = Number(todayStats?.snsMinutesTotal ?? 0);
  const steps = Number(todayStats?.steps ?? 0);
  
  // 修正: 計算式を直接使用
  const activity = todayStats?.activitySummary || {};
  const ruminationProxy = calculateRuminationProxy({
    lateNightSnsMinutes: Number(activity?.lateNightSnsMinutes ?? 0),
    snsMinutes: snsMinutesTotal,
    totalScreenTime: Number(activity?.totalScreenTime ?? snsMinutesTotal),
    sleepWindowPhoneMinutes: Number(activity?.sleepWindowPhoneMinutes ?? 0),
    longestNoUseHours: Number(activity?.longestNoUseHours ?? 0)
  });

  const isJa = language === 'ja';
  
  // ★ ラベルをローカライズ
  const wakeLabel = wakeAt 
    ? (isJa ? `起床 ${toLocalTimeHHMM(wakeAt, timezone)}` : `Wake ${toLocalTimeHHMM(wakeAt, timezone)}`)
    : (isJa ? '起床' : 'Wake');
  const wakeStatus = wakeAt ? 'on_track' : 'warning';

  // Minimal heuristics (v0.3): thresholds are placeholders until insights pipeline fills daily_metrics.insights.highlights
  const screenStatus = snsMinutesTotal >= 180 ? 'warning' : snsMinutesTotal >= 120 ? 'warning' : 'on_track';
  const screenLabel = snsMinutesTotal > 0 
    ? (isJa ? `SNS ${snsMinutesTotal}分` : `SNS ${snsMinutesTotal}m`) 
    : 'SNS';

  const workoutStatus = steps >= 8000 ? 'on_track' : steps >= 3000 ? 'warning' : 'missed';
  const workoutLabel = steps > 0 
    ? (isJa ? `歩数 ${steps.toLocaleString()}` : `Steps ${steps.toLocaleString()}`) 
    : (isJa ? '運動' : 'Workout');

  // 修正: ruminationProxy の値に基づいてラベルも表示
  const ruminationStatus = ruminationProxy >= 0.7 ? 'warning' : ruminationProxy >= 0.4 ? 'ok' : 'ok';
  const ruminationLabel = isJa 
    ? `反芻 ${Math.round(ruminationProxy * 100)}%`
    : `Rumination ${Math.round(ruminationProxy * 100)}%`;

  return {
    wake: { status: wakeStatus, label: wakeLabel },
    screen: { status: screenStatus, label: screenLabel },
    workout: { status: workoutStatus, label: workoutLabel },
    rumination: { status: ruminationStatus, label: ruminationLabel }
  };
}

export function buildTimeline({ todayStats, timezone }) {
  const timeline = [];

  const sleepStartAt = todayStats?.sleepStartAt ? new Date(todayStats.sleepStartAt) : null;
  const wakeAt = todayStats?.wakeAt ? new Date(todayStats.wakeAt) : null;
  if (sleepStartAt && wakeAt) {
    timeline.push({
      type: 'sleep',
      start: toLocalTimeHHMM(sleepStartAt, timezone),
      end: toLocalTimeHHMM(wakeAt, timezone)
    });
  }

  const snsSessions = todayStats?.activitySummary?.snsSessions;
  if (Array.isArray(snsSessions)) {
    for (const s of snsSessions) {
      if (!s?.startAt || !s?.endAt) continue;
      const startAt = new Date(s.startAt);
      const endAt = new Date(s.endAt);
      timeline.push({
        type: 'scroll',
        start: toLocalTimeHHMM(startAt, timezone),
        end: toLocalTimeHHMM(endAt, timezone)
      });
    }
  }

  const walkRun = todayStats?.activitySummary?.walkRunSessions;
  if (Array.isArray(walkRun)) {
    for (const a of walkRun) {
      if (!a?.startAt || !a?.endAt) continue;
      const startAt = new Date(a.startAt);
      const endAt = new Date(a.endAt);
      timeline.push({
        type: 'activity',
        start: toLocalTimeHHMM(startAt, timezone),
        end: toLocalTimeHHMM(endAt, timezone)
      });
    }
  }

  return timeline;
}

export function pickTodayInsight({ todayStats, language = 'en' }) {
  const insight = todayStats?.insights?.todayInsight;
  if (typeof insight === 'string' && insight.trim()) {
    return insight.trim();
  }
  // ★ 保存済みがない場合はnullを返し、呼び出し元でAI生成を促す
  return null;
}

// ★ フォールバックメッセージを取得するユーティリティを追加
export function getInsightFallback(language = 'en') {
  return language === 'ja'
    ? 'まだ十分な行動データがありません。今日の流れを一緒に整えていきましょう。'
    : 'Not enough behavior data yet. We can shape today gently from here.';
}



