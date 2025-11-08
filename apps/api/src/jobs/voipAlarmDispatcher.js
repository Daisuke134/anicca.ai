import cron from 'node-cron';
import { query } from '../lib/db.js';
import { sendVoIPPush } from '../services/voipPushService.js';

let cronJob = null;

/**
 * Start the VoIP alarm dispatcher cron job.
 * Should be called after database tables are initialized.
 */
export function startVoIPAlarmDispatcher() {
  if (cronJob) {
    console.log('[VoIP Alarm Dispatcher] Already started');
    return;
  }

  // Run every minute
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      console.log(`[VoIP Alarm Dispatcher] Checking alarms at ${now.toISOString()}`);

      // Find alarms within ±60 second window (Apple PushKit best practice for immediate delivery)
      const windowStart = new Date(now.getTime() - 60 * 1000);
      const windowEnd = new Date(now.getTime() + 60 * 1000);
      const result = await query(
        `SELECT id, user_id, habit_type, next_fire_at, repeat_rule
         FROM mobile_alarm_schedules
         WHERE next_fire_at BETWEEN $1 AND $2`,
        [windowStart, windowEnd]
      );

      if (result.rows.length > 0) {
        console.log(`[VoIP Alarm Dispatcher] Found ${result.rows.length} alarm(s) to fire`);
        console.log(`[VoIP Alarm Dispatcher] Alarms:`, result.rows.map(r => ({ id: r.id, habit: r.habit_type, fireAt: r.next_fire_at })));
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
             SET next_fire_at = $1,
                 updated_at = NOW()
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
      // Ignore errors if tables don't exist yet (will be retried on next run)
      if (error.code === '42P01') {
        console.debug('[VoIP Alarm Dispatcher] Tables not ready yet, will retry');
        return;
      }
      console.error('[VoIP Alarm Dispatcher] Error:', error.message);
      console.error('[VoIP Alarm Dispatcher] Stack:', error.stack);
    }
  });

  console.log('✅ VoIP alarm dispatcher started');
}

