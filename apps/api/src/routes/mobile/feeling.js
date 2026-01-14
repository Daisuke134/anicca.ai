import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import baseLogger from '../../utils/logger.js';
import extractUserId from '../../middleware/extractUserId.js';
import { query } from '../../lib/db.js';
import { resolveProfileId } from '../../services/mobile/userIdResolver.js';
import { getUserTimezone, buildMentalState, normalizeBig5, getUserTraits } from '../../modules/nudge/features/stateBuilder.js';
import { loadMentalBandit, encodeMentalState, actionIdToTemplate } from '../../modules/nudge/policy/mentalBandit.js';
import { getMem0Client } from '../../modules/memory/mem0Client.js';
import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';

const router = express.Router();
const logger = baseLogger.withContext('MobileFeeling');

const startSchema = z.object({
  feelingId: z.string(),
  topic: z.string().optional()
});

const endSchema = z.object({
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  emaBetter: z.union([z.boolean(), z.null()]).optional(),
  summary: z.string().optional()
});

function opener(feelingId, lang) {
  const ja = lang === 'ja';
  switch (String(feelingId)) {
    case 'self_loathing':
      return ja
        ? 'ここにいるよ。自己嫌悪は重いよね。まずは一緒に、その痛みを少しだけゆるめよう。'
        : "I'm here. Self-loathing is heavy. Let's soften that painful voice together, just a little.";
    case 'anxiety':
      return ja
        ? '大丈夫。まず息をひとつ。肩を少しゆるめて、今この瞬間に戻ろう。'
        : "I'm with you. One breath. Let your shoulders drop a little, and come back to this moment.";
    case 'anger':
    case 'irritation':
      return ja
        ? 'その熱さ、きついよね。反応する前に、息をひとつだけ置こう。'
        : "I hear that heat. Before we react, let's place one breath of space.";
    default:
      return ja
        ? 'ここはあなたの場所。静かでも、話しても大丈夫。必要なら、最近の流れから優しく始めるよ。'
        : 'This space is yours. We can talk or be quiet. If you want, I can start gently from your recent days.';
  }
}

// POST /api/mobile/feeling/start
router.post('/start', async (req, res) => {
  const deviceId = (req.get('device-id') || '').toString().trim();
  const userId = await extractUserId(req, res);
  if (!userId) return;

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
  }

  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
  }

  try {
    const tz = await getUserTimezone(profileId);
    const state = await buildMentalState({ profileId, feelingId: parsed.data.feelingId, now: new Date(), tz });
    const bandit = await loadMentalBandit();
    const { x } = encodeMentalState(state);
    const actionId = bandit.selectAction(x);
    const actionTemplate = actionIdToTemplate(actionId);

    const sessionId = crypto.randomUUID();
    await query(
      `insert into feeling_sessions
        (id, user_id, feeling_id, topic, action_template, started_at, context, created_at)
       values
        ($1::uuid, $2::uuid, $3, $4, $5, timezone('utc', now()), $6::jsonb, timezone('utc', now()))`,
      [sessionId, profileId, parsed.data.feelingId, parsed.data.topic || null, actionTemplate, JSON.stringify(state)]
    );

    // Return minimal opening script (LLM opener can be added later)
    const settings = await query(`select language from user_settings where user_id=$1::uuid limit 1`, [profileId]);
    const lang = settings.rows?.[0]?.language || 'en';

    return res.json({
      sessionId,
      openingScript: opener(parsed.data.feelingId, lang),
      actionTemplate,
      context_snapshot: {
        mental_state: state
      }
    });
  } catch (e) {
    logger.error('Failed to start feeling session', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start feeling session' } });
  }
});

// POST /api/mobile/feeling/end
router.post('/end', async (req, res) => {
  const userId = await extractUserId(req, res);
  if (!userId) return;

  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid body', details: parsed.error.errors } });
  }

  const sessionId = parsed.data.session_id || parsed.data.sessionId;
  if (!sessionId) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'session_id is required' } });
  }

  const profileId = await resolveProfileId(userId);
  if (!profileId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Could not resolve profile_id' } });
  }

  try {
    const r = await query(
      `select id, user_id, feeling_id, action_template, context
         from feeling_sessions
        where id = $1::uuid and user_id = $2::uuid
        limit 1`,
      [sessionId, profileId]
    );
    const row = r.rows?.[0];
    if (!row) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    const emaBetter = parsed.data.emaBetter ?? null;
    await query(
      `update feeling_sessions
          set ended_at = timezone('utc', now()),
              ema_better = $3,
              summary = $4
        where id = $1::uuid and user_id = $2::uuid`,
      [sessionId, profileId, emaBetter, parsed.data.summary || null]
    );

    // Bandit update only when emaBetter is boolean
    if (typeof emaBetter === 'boolean') {
      const bandit = await loadMentalBandit();
      const state = row.context || {};
      const { x } = encodeMentalState(state);
      const actionTemplate = String(row.action_template || 'do_nothing');
      const actionId = Math.max(0, ['do_nothing','soft_self_compassion','cognitive_reframe','behavioral_activation_micro','metta_like'].indexOf(actionTemplate));
      bandit.update(x, actionId, emaBetter ? 1 : 0);
      await bandit.save({ version: 1 });
    }

    // Save to mem0 as interaction (best-effort)
    try {
      const mem0 = getMem0Client();
      await mem0.addInteraction({
        userId: profileId,
        content: `Feeling session: ${row.feeling_id}. Template: ${row.action_template}. EMA: ${emaBetter === null ? 'skipped' : emaBetter ? 'better' : 'not better'}. Summary: ${parsed.data.summary || ''}`.trim(),
        metadata: {
          sessionId,
          feelingId: row.feeling_id,
          actionTemplate: row.action_template,
          emaBetter,
          timestamp: new Date().toISOString()
        }
      });
    } catch (e) {
      logger.warn('mem0 interaction save failed', e);
    }

    const ent = await getEntitlementState(userId);
    return res.json({ success: true, entitlement: normalizePlanForResponse(ent) });
  } catch (e) {
    logger.error('Failed to end feeling session', e);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to end feeling session' } });
  }
});

export default router;








