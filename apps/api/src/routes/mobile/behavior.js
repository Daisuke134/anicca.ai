import express from 'express';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { buildContextSnapshot } from '../../modules/realtime/contextSnapshot.js';
import { buildHighlights, buildTimeline, pickTodayInsight, getInsightFallback } from '../../modules/metrics/stateBuilder.js';  // ★ getInsightFallback 追加
import { generateFutureScenario } from '../../modules/simulation/futureScenario.js';
import { generateTodayInsight } from '../../modules/insights/generateTodayInsight.js';  // ★ 追加
const router = express.Router();
const logger = baseLogger.withContext('MobileBehavior');

// GET /api/mobile/behavior/summary
router.get('/summary', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const snapshot = await buildContextSnapshot({ userId, deviceId });
    const tz = snapshot?.timezone || 'UTC';
    const lang = snapshot?.language || 'en';
    const today = snapshot?.today_stats || null;
    const profileId = snapshot?.profile_id || null;
    const localDate = snapshot?.local_date || null;

    // ★ 保存済みinsightをチェック、なければAI生成
    let todayInsight = pickTodayInsight({ todayStats: today, language: lang });
    if (!todayInsight) {
      // AI生成を試みる
      todayInsight = await generateTodayInsight({
        todayStats: today,
        traits: snapshot?.traits,
        language: lang
      });
      // 生成に失敗した場合はフォールバック
      if (!todayInsight) {
        todayInsight = getInsightFallback(lang);
      }
    }

    const highlights = buildHighlights({
      todayStats: today,
      timezone: tz,
      language: lang,
      habitSchedules: snapshot?.traits?.habitSchedules
    });
    const timeline = buildTimeline({ todayStats: today, timezone: tz });
    const futureScenario = await generateFutureScenario({
      language: lang,
      traits: snapshot?.traits || {},
      todayStats: today || {},
      now: new Date()
    });

    const streaks = await calculateStreaks(userId);
    
    return res.json({
      todayInsight,
      highlights,
      futureScenario,
      timeline,
      streaks
    });
  } catch (e) {
    logger.error('Failed to build behavior summary', e);
    // UX最優先: データが無い/一時的に失敗でもUIは出す（クライアント側で「真っ白/エラーのみ」を防止）
    const lang = (req.get('accept-language') || '').toString().toLowerCase().includes('ja') ? 'ja' : 'en';
    const todayInsight = lang === 'ja'
      ? 'データ連携は任意です。連携がなくてもTalkはいつでも使えます。'
      : 'Data integration is optional. You can always use Talk even without connected data.';
    
    // v3: futureScenarioのフォールバックを空にしない
    const fallbackFuture = lang === 'ja'
      ? { ifContinue: '十分なデータがありません', ifImprove: '十分なデータがありません' }
      : { ifContinue: 'Not enough data available', ifImprove: 'Not enough data available' };
    
    return res.json({
      todayInsight,
      highlights: {
        wake: { status: 'ok', label: '' },
        screen: { status: 'ok', label: '' },
        workout: { status: 'ok', label: '' },
        rumination: { status: 'ok', label: '' }
      },
      futureScenario: fallbackFuture,
      timeline: [],
      streaks: { wake: 0, screen: 0, workout: 0, rumination: 0 }
    });
  }
});

async function calculateStreaks(_userId) {
  // daily_metrics table is dead (iOS never writes). Return zero defaults.
  return { wake: 0, screen: 0, workout: 0, rumination: 0 };
}

export default router;

