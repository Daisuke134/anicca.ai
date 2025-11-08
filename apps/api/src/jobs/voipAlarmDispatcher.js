import cron from 'node-cron';
import { query } from '../lib/db.js';
import { sendVoIPPush } from '../services/voipPushService.js';

// Run every minute
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const oneMinuteLater = new Date(now.getTime() + 60 * 1000);

    // Find alarms that should fire within the next minute
    const result = await query(
      `SELECT id, user_id, habit_type, next_fire_at, repeat_rule
       FROM mobile_alarm_schedules
       WHERE next_fire_at <= $1
       AND next_fire_at > $2`,
      [oneMinuteLater, now]
    );

    if (result.rows.length > 0) {
      console.log(`[VoIP Alarm Dispatcher] Found ${result.rows.length} alarm(s) to fire`);
    }

    for (const alarm of result.rows) {
      // Get all VoIP tokens for this user
      const tokensResult = await query(
        `SELECT device_token
         FROM mobile_voip_tokens
         WHERE user_id = $1`,
        [alarm.user_id]
      );

      if (tokensResult.rows.length === 0) {
        console.warn(`[VoIP Alarm Dispatcher] No VoIP tokens found for user ${alarm.user_id}`);
        continue;
      }

      const payload = {
        aps: {
          'content-available': 1
        },
        session_id: alarm.id,
        habit_type: alarm.habit_type
      };

      // Send push to all devices
      for (const tokenRow of tokensResult.rows) {
        const success = await sendVoIPPush(tokenRow.device_token, payload);
        if (success) {
          console.log(`[VoIP Alarm Dispatcher] Sent VoIP push for alarm ${alarm.id} (${alarm.habit_type})`);
        } else {
          console.error(`[VoIP Alarm Dispatcher] Failed to send VoIP push for alarm ${alarm.id}`);
        }
      }

      // Update next_fire_at based on repeat_rule
      let nextFire = new Date(alarm.next_fire_at);
      if (alarm.repeat_rule === 'daily') {
        nextFire.setDate(nextFire.getDate() + 1);
      } else {
        // Default: don't repeat
        nextFire = null;
      }

      if (nextFire) {
        await query(
          `UPDATE mobile_alarm_schedules
           SET next_fire_at = $1
           WHERE id = $2`,
          [nextFire, alarm.id]
        );
        console.log(`[VoIP Alarm Dispatcher] Updated next_fire_at for alarm ${alarm.id} to ${nextFire.toISOString()}`);
      } else {
        // Delete if not repeating
        await query(
          `DELETE FROM mobile_alarm_schedules
           WHERE id = $1`,
          [alarm.id]
        );
        console.log(`[VoIP Alarm Dispatcher] Deleted non-repeating alarm ${alarm.id}`);
      }
    }
  } catch (error) {
    console.error('[VoIP Alarm Dispatcher] Error:', error.message);
    console.error('[VoIP Alarm Dispatcher] Stack:', error.stack);
  }
});

console.log('VoIP alarm dispatcher started');

