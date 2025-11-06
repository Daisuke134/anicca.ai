import { query } from '../../lib/db.js';
import baseLogger from '../../utils/logger.js';

const logger = baseLogger.withContext('MobileProfileService');

/**
 * Get user profile by device ID
 * @param {string} deviceId - Device identifier
 * @returns {Promise<object|null>} Profile data or null if not found
 */
export async function getProfile(deviceId) {
  try {
    const result = await query(
      'SELECT profile, language, updated_at FROM mobile_profiles WHERE device_id = $1',
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      profile: row.profile,
      language: row.language,
      updatedAt: row.updated_at
    };
  } catch (error) {
    logger.error('Failed to get profile', error);
    throw error;
  }
}

/**
 * Upsert user profile
 * @param {object} params - Parameters
 * @param {string} params.deviceId - Device identifier
 * @param {string} params.userId - User ID from auth
 * @param {object} params.profile - Profile data object
 * @param {string} params.language - Language code
 * @returns {Promise<void>}
 */
export async function upsertProfile({ deviceId, userId, profile, language }) {
  try {
    await query(
      `INSERT INTO mobile_profiles (device_id, user_id, profile, language, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (device_id) 
       DO UPDATE SET 
         user_id = EXCLUDED.user_id,
         profile = EXCLUDED.profile,
         language = EXCLUDED.language,
         updated_at = NOW()`,
      [deviceId, userId, JSON.stringify(profile), language]
    );
    
    logger.info(`Profile upserted for device: ${deviceId}`);
  } catch (error) {
    logger.error('Failed to upsert profile', error);
    throw error;
  }
}

/**
 * Get profile by user ID (for sync across devices in future)
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} Latest profile or null
 */
export async function getProfileByUserId(userId) {
  try {
    const result = await query(
      'SELECT profile, language, updated_at FROM mobile_profiles WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      profile: row.profile,
      language: row.language,
      updatedAt: row.updated_at
    };
  } catch (error) {
    logger.error('Failed to get profile by user ID', error);
    throw error;
  }
}

