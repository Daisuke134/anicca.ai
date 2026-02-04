import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { fetch } from 'undici';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import requireInternalAuth from '../../middleware/requireInternalAuth.js';
import { query } from '../../lib/db.js';
import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
import { getUserTimezone, buildScreenState, buildMovementState, getUserTraits } from '../../modules/nudge/features/stateBuilder.js';
import { computeReward } from '../../modules/nudge/reward/rewardCalculator.js';
import { getMem0Client } from '../../modules/memory/mem0Client.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileNudge');

const triggerSchema = z.object({
  eventType: z.string(),
  timestamp: z.string().optional(),
  payload: z.any().optional()
});

// Phase 7+8: hookFeedback/contentFeedback分離対応
const feedbackSchema = z.object({
  nudgeId: z.string(),
  outcome: z.enum(['success', 'failed', 'ignored']).optional(),
  signals: z.object({
    hookFeedback: z.enum(['tapped', 'ignored']).optional(),
    contentFeedback: z.enum(['thumbsUp', 'thumbsDown']).nullish(),
    timeSpentSeconds: z.number().optional(),
    // 後方互換: 旧フィールド
    thumbsUp: z.boolean().optional(),
    thumbsDown: z.boolean().optional(),
    outcome: z.string().optional()
  }).passthrough().optional()
});

function pickTemplate({ domain, eventType, intensity }) {
  // Minimal mapping per prompts-v3.md examples.
  if (domain === 'screen') {
    if (String(eventType).includes('60')) return 'direct_sns_stop';
    return intensity === 'active' ? 'direct_sns_stop' : 'gentle_sns_break';
  }
  if (domain === 'movement') {
    return intensity === 'active' ? 'walk_invite' : 'short_break';
  }
  return 'do_nothing';
}

const TRIGGER_MESSAGES = {
  gentle_sns_break: {
    en: "You've been scrolling for a while. How about a one-minute pause to let your eyes and mind breathe?",
    ja: '少しスクロールが続いてるみたい。1分だけ、目と心を休めよう。',
    es: 'Llevas un rato deslizando. ¿Qué tal una pausa de un minuto para descansar los ojos y la mente?',
    fr: 'Tu scrolles depuis un moment. Et si tu faisais une pause d\'une minute pour reposer tes yeux et ton esprit ?',
    de: 'Du scrollst schon eine Weile. Wie wäre es mit einer einminütigen Pause für Augen und Geist?',
    pt: 'Você está rolando há um tempo. Que tal uma pausa de um minuto para descansar os olhos e a mente?'
  },
  direct_sns_stop: {
    en: "Let's cut it here. Put the phone face-down and reclaim the next few minutes.",
    ja: 'ここで一度切ろう。スマホを伏せて、次の数分を取り戻そう。',
    es: 'Cortemos aquí. Pon el teléfono boca abajo y recupera los próximos minutos.',
    fr: 'Coupons ici. Pose le téléphone face cachée et récupère les prochaines minutes.',
    de: 'Lass uns hier aufhören. Leg das Handy mit dem Display nach unten und nimm dir die nächsten Minuten zurück.',
    pt: 'Vamos parar aqui. Coloque o celular virado para baixo e recupere os próximos minutos.'
  },
  short_break: {
    en: "You've been still for a while. Stand up, stretch, take a few steps—just one minute.",
    ja: '座りっぱなしが続いてるよ。立って、伸びて、数歩だけ。',
    es: 'Llevas un rato quieto. Levántate, estírate, da unos pasos—solo un minuto.',
    fr: 'Tu es resté immobile un moment. Lève-toi, étire-toi, fais quelques pas—juste une minute.',
    de: 'Du sitzt schon eine Weile still. Steh auf, streck dich, mach ein paar Schritte—nur eine Minute.',
    pt: 'Você está parado há um tempo. Levante-se, alongue-se, dê alguns passos—só um minuto.'
  },
  walk_invite: {
    en: "Let's walk for five minutes. When the body moves, the mind often shifts too.",
    ja: '今、5分だけ歩こう。体が動くと、気分も少し変わるよ。',
    es: 'Caminemos cinco minutos. Cuando el cuerpo se mueve, la mente también cambia.',
    fr: 'Marchons cinq minutes. Quand le corps bouge, l\'esprit suit souvent.',
    de: 'Lass uns fünf Minuten gehen. Wenn der Körper sich bewegt, verändert sich oft auch der Geist.',
    pt: 'Vamos caminhar cinco minutos. Quando o corpo se move, a mente também muda.'
  }
};

function normalizeLangKey(lang) {
  if (!lang) return 'en';
  const l = String(lang).toLowerCase().slice(0, 2);
  if (TRIGGER_MESSAGES.gentle_sns_break[l]) return l;
  return 'en';
}

function renderMessage(templateId, lang) {
  const msgs = TRIGGER_MESSAGES[templateId];
  if (!msgs) return '';
  return msgs[normalizeLangKey(lang)] || msgs.en;
}

function classifyDomain(eventType) {
  const t = String(eventType);
  if (t.includes('sns') || t.includes('screen')) return { domain: 'screen', subtype: t };
  if (t.includes('sedentary') || t.includes('movement')) return { domain: 'movement', subtype: t };
  return { domain: 'unknown', subtype: t };
}

// POST /api/mobile/nudge/trigger
router.post('/trigger', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;
  const deviceId = (req.get('device-id') || '').toString().trim();

  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
  }

  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
  }

  try {
    const tz = await getUserTimezone(profileId);
    const traits = await getUserTraits(profileId);
    const { domain, subtype } = classifyDomain(parsed.data.eventType);

    let state = null;
    if (domain === 'screen') state = await buildScreenState({ profileId, now: new Date(), tz });
    if (domain === 'movement') state = await buildMovementState({ profileId, now: new Date(), tz });

    const templateId = pickTemplate({ domain, eventType: parsed.data.eventType, intensity: traits.nudgeIntensity || 'normal' });
    const langR = await query(`select language from user_settings where user_id = $1::uuid limit 1`, [profileId]);
    const lang = langR.rows?.[0]?.language || 'en';
    const message = renderMessage(templateId, lang);
    const nudgeId = crypto.randomUUID();
    const sent = Boolean(message && String(message).trim());

    await query(
      `insert into nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9, timezone('utc', now()))`,
      [
        nudgeId,
        profileId,
        domain,
        subtype,
        parsed.data.eventType,
        JSON.stringify(state || {}),
        templateId,
        'notification',
        sent
      ]
    );

    return res.json({ nudgeId, templateId, message });
  } catch (e) {
    logger.error('Failed to trigger nudge', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to trigger nudge' } });
  }
});

// POST /api/mobile/nudge/feedback
router.post('/feedback', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
  }

  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
  }

  try {
    const ev = await query(
      `select id, domain, subtype, action_template
         from nudge_events
        where id = $1::uuid and user_id = $2::uuid
        limit 1`,
      [parsed.data.nudgeId, profileId]
    );
    const row = ev.rows?.[0];
    if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Nudge not found' } });

    const signals = parsed.data.signals || {};
    const reward = computeReward({ domain: row.domain, subtype: row.subtype, signals });

    await query(
      `insert into nudge_outcomes (id, nudge_event_id, reward, short_term, ema_score, signals, created_at)
       values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb, timezone('utc', now()))`,
      [
        crypto.randomUUID(),
        row.id,
        reward,
        JSON.stringify({ outcome: parsed.data.outcome || null }),
        null,
        JSON.stringify(signals)
      ]
    );

    // Save nudge_meta to mem0 (best-effort)
    try {
      const mem0 = await getMem0Client();
      await mem0.addNudgeMeta({
        userId: profileId,
        content: `Nudge ${row.action_template} outcome=${parsed.data.outcome || ''} reward=${reward}`,
        metadata: {
          nudgeId: row.id,
          templateId: row.action_template,
          reward,
          timestamp: new Date().toISOString()
        }
      });
    } catch (e) {
      logger.warn('mem0 nudge_meta save failed', e);
    }

    return res.json({ recorded: true, reward });
  } catch (e) {
    logger.error('Failed to record nudge feedback', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to record nudge feedback' } });
  }
});

// Phase 7+8: LLM生成Nudge

// GET /api/nudge/today - 今日生成されたNudgeを取得
router.get('/today', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  try {
    const profileId = await resolveProfileId(userId);
    if (!profileId) {
      return res.json({ nudges: [], version: '2' });
    }

    // 今日の00:00 JST以降に生成されたNudgeを取得
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStartJST = new Date(Date.UTC(
      nowJST.getUTCFullYear(),
      nowJST.getUTCMonth(),
      nowJST.getUTCDate(),
      0, 0, 0, 0
    ) - 9 * 60 * 60 * 1000);

    const result = await query(
      `SELECT state, subtype, created_at
       FROM nudge_events
       WHERE user_id = $1::uuid
         AND domain = 'problem_nudge'
         AND decision_point IN ('llm_generation', 'rule_based')
         AND created_at >= $2::timestamp
       ORDER BY created_at DESC`,
      [profileId, todayStartJST]
    );

    // Phase 7+8: overallStrategyを取得（最初のレコードから）
    const overallStrategy = result.rows[0]?.state?.overallStrategy || null;

    // LLMGeneratedNudge形式に変換（1.6.0: slotIndex + enabled 追加）
    const nudges = result.rows.map(row => {
      const scheduledTime = row.state.scheduledTime || `${String(row.state.scheduledHour || 9).padStart(2, '0')}:00`;
      const [h, m] = scheduledTime.split(':').map(Number);
      return {
        id: row.state.id,
        problemType: row.subtype,
        scheduledTime,
        scheduledHour: h,
        scheduledMinute: m,
        // 1.6.0: slotIndex（フラット化テーブルのインデックス、iOS完全一致マッチ用）
        slotIndex: row.state.slotIndex ?? null,
        // 1.6.0: enabled（Phase 7 Dynamic Frequency用、デフォルトtrue）
        enabled: row.state.enabled ?? true,
        hook: row.state.hook,
        content: row.state.content,
        tone: row.state.tone,
        reasoning: row.state.reasoning,
        rootCauseHypothesis: row.state.rootCauseHypothesis || null,
        createdAt: row.created_at.toISOString(),
      };
    });

    return res.json({
      nudges,
      overallStrategy,
      version: '3',  // 1.6.0: slotIndex + enabled
    });
  } catch (e) {
    logger.error('Failed to fetch today\'s nudges', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch today\'s nudges' } });
  }
});

export default router;
