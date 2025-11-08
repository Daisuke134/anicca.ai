import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../lib/db.js';

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

    // Calculate next fire time
    const now = new Date();
    const tz = timezone || 'UTC';
    const today = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const fireTime = new Date(today);
    fireTime.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (fireTime <= now) {
      fireTime.setDate(fireTime.getDate() + 1);
    }

    const alarmId = crypto.randomUUID();

    await query(
      `INSERT INTO mobile_alarm_schedules 
       (id, user_id, habit_type, fire_time, timezone, repeat_rule, next_fire_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [alarmId, userId, habit_type, fireTime, tz, repeat_rule || 'daily', fireTime]
    );

    res.json({ id: alarmId, next_fire_at: fireTime.toISOString() });
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

