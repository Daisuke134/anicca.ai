import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../lib/db.js';
import { Temporal } from '@js-temporal/polyfill';

const router = Router();

// POST /mobile/voip-token
router.post('/voip-token', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const deviceId = req.headers['device-id'];
    const { device_token } = req.body;

    if (!userId || !device_token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upsert VoIP token
    await query(
      `INSERT INTO mobile_voip_tokens (user_id, device_token, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, device_token)
       DO UPDATE SET updated_at = NOW()`,
      [userId, device_token]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error registering VoIP token:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage, details: error.stack });
  }
});

// POST /mobile/alarms
router.post('/alarms', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const { habit_type, hour, minute, timezone, repeat_rule } = req.body;

    if (!userId || !habit_type || hour === undefined || minute === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate next fire time using Temporal for proper timezone handling
    const tz = timezone || 'UTC';
    const nowZoned = Temporal.Now.zonedDateTimeISO(tz);
    let fireTimeZoned = nowZoned.with({ hour, minute, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
    
    // If time has passed today, schedule for tomorrow
    if (fireTimeZoned.epochSeconds <= nowZoned.epochSeconds) {
      fireTimeZoned = fireTimeZoned.add({ days: 1 });
    }
    
    // Convert to UTC Instant for database storage
    const fireTimeInstant = fireTimeZoned.toInstant();
    const fireTimeDate = new Date(fireTimeInstant.epochMilliseconds);

    const alarmId = crypto.randomUUID();

    await query(
      `INSERT INTO mobile_alarm_schedules 
       (id, user_id, habit_type, fire_time, timezone, repeat_rule, next_fire_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [alarmId, userId, habit_type, fireTimeDate, tz, repeat_rule || 'daily', fireTimeDate]
    );

    res.json({ id: alarmId, next_fire_at: fireTimeDate.toISOString() });
  } catch (error) {
    console.error('Error creating alarm schedule:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ error: errorMessage, details: error.stack });
  }
});

// DELETE /mobile/alarms/:id
router.delete('/alarms/:id', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const alarmId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await query(
      `DELETE FROM mobile_alarm_schedules 
       WHERE id = $1 AND user_id = $2`,
      [alarmId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alarm not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alarm schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

