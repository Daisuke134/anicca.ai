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
      `SELECT mp.profile, mp.language, mp.user_id, mp.updated_at, 
              COALESCE(us.language, 'en') as user_settings_language
       FROM mobile_profiles mp
       LEFT JOIN user_settings us ON mp.user_id = us.user_id
       WHERE mp.device_id = $1`,
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      profile: row.profile,
      language: row.language,
      userSettingsLanguage: row.user_settings_language,
      userId: row.user_id,
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
    // Upsert mobile_profiles
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
    
    // Update user_settings.language if preferredLanguage is provided
    if (language && (language === 'ja' || language === 'en')) {
      await query(
        `INSERT INTO user_settings (user_id, language, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           language = EXCLUDED.language,
           updated_at = NOW()`,
        [userId, language]
      );
    }
    
    logger.info(`Profile upserted for device: ${deviceId}, language: ${language}`);
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
      `SELECT mp.profile,
              mp.language,
              mp.updated_at,
              COALESCE(us.language, 'en') AS user_settings_language
       FROM mobile_profiles mp
       LEFT JOIN user_settings us ON mp.user_id = us.user_id
       WHERE mp.user_id = $1
       ORDER BY mp.updated_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      profile: row.profile,
      language: row.language,
      userSettingsLanguage: row.user_settings_language,
      updatedAt: row.updated_at
    };
  } catch (error) {
    logger.error('Failed to get profile by user ID', error);
    throw error;
  }
}

