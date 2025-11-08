import { query } from '../../lib/db.js';

/**
 * Ensure mobile VoIP-related tables exist.
 * Called during server initialization to create tables if they don't exist.
 */
export async function ensureMobileTables() {
  try {
    // Create mobile_voip_tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS mobile_voip_tokens (
        user_id TEXT NOT NULL,
        device_token TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, device_token)
      );
    `);

    // Create mobile_alarm_schedules table
    await query(`
      CREATE TABLE IF NOT EXISTS mobile_alarm_schedules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        habit_type TEXT NOT NULL,
        fire_time TIMESTAMPTZ NOT NULL,
        timezone TEXT NOT NULL,
        repeat_rule TEXT NOT NULL DEFAULT 'daily',
        next_fire_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create indexes for better query performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_mobile_alarm_schedules_user 
      ON mobile_alarm_schedules(user_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_mobile_alarm_schedules_next_fire 
      ON mobile_alarm_schedules(next_fire_at);
    `);

    console.log('✅ Mobile VoIP tables ensured.');
  } catch (error) {
    console.error('❌ Error ensuring mobile tables:', error);
    throw error;
  }
}

