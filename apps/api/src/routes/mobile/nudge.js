import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
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

const feedbackSchema = z.object({
  nudgeId: z.string(),
  outcome: z.enum(['success', 'failed', 'ignored']).optional(),
  signals: z.record(z.any()).optional()
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

function renderMessage(templateId, lang) {
  const ja = lang === 'ja';
  switch (templateId) {
    case 'gentle_sns_break':
      return ja
        ? '少しスクロールが続いてるみたい。1分だけ、目と心を休めよう。'
        : "You've been scrolling for a while. How about a one-minute pause to let your eyes and mind breathe?";
    case 'direct_sns_stop':
      return ja
        ? 'ここで一度切ろう。スマホを伏せて、次の数分を取り戻そう。'
        : "Let's cut it here. Put the phone face-down and reclaim the next few minutes.";
    case 'short_break':
      return ja
        ? '座りっぱなしが続いてるよ。立って、伸びて、数歩だけ。'
        : "You've been still for a while. Stand up, stretch, take a few steps—just one minute.";
    case 'walk_invite':
      return ja
        ? '今、5分だけ歩こう。体が動くと、気分も少し変わるよ。'
        : 'Let's walk for five minutes. When the body moves, the mind often shifts too.';
    default:
      return ja ? '今は送らないよ。' : 'No nudge for now.';
  }
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

    await query(
      `insert into nudge_events (id, user_id, domain, subtype, decision_point, state, action_template, channel, sent, created_at)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, true, timezone('utc', now()))`,
      [
        nudgeId,
        profileId,
        domain,
        subtype,
        parsed.data.eventType,
        JSON.stringify(state || {}),
        templateId,
        'notification'
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
      const mem0 = getMem0Client();
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

export default router;

