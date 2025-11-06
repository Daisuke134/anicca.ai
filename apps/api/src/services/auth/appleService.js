import baseLogger from '../../utils/logger.js';
import { query } from '../../lib/db.js';
import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const logger = baseLogger.withContext('AppleAuthService');
const appleAudience = process.env.APPLE_SIGN_IN_AUD;
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Verify Apple identity token
 * @param {string} identityToken - JWT from Apple
 * @param {string} nonce - Nonce used in the request
 * @param {string} appleUserId - Apple's user identifier
 * @returns {Promise<object|null>} Verified user data or null
 */
export async function verifyIdentityToken(identityToken, nonce, appleUserId) {
  try {
    if (!appleAudience) {
      throw new Error('APPLE_SIGN_IN_AUD is not configured');
    }

    const { payload } = await jwtVerify(identityToken, appleJWKS, {
      issuer: 'https://appleid.apple.com',
      audience: appleAudience
    });

    const expectedNonce = crypto.createHash('sha256').update(nonce).digest('base64');
    if (!payload.nonce || payload.nonce !== expectedNonce) {
      logger.warn('Nonce mismatch');
      return null;
    }

    const sub = payload.sub || appleUserId;
    if (!sub) {
      logger.warn('Missing subject in Apple token');
      return null;
    }

    const email = payload.email || null;
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';
    
    // Upsert user in database
    const userId = await upsertAppleUser({
      appleUserId: sub,
      email: email,
      emailVerified: emailVerified
    });
    
    return {
      userId,
      displayName: payload.name?.firstName || payload.name?.lastName || 'User',
      email: email
    };
  } catch (error) {
    logger.error('Token verification failed', error);
    return null;
  }
}

/**
 * Upsert user from Apple authentication
 * @private
 */
async function upsertAppleUser({ appleUserId, email, emailVerified }) {
  try {
    // Check if user exists by apple_user_id or email
    const existingUser = await query(
      `SELECT id FROM public.profiles 
       WHERE (metadata->>'apple_user_id' = $1 OR email = $2) 
       LIMIT 1`,
      [appleUserId, email]
    );
    
    let userId;
    
    if (existingUser.rows.length > 0) {
      // Update existing user
      userId = existingUser.rows[0].id;
      await query(
        `UPDATE public.profiles 
         SET 
           email = COALESCE($2, email),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('apple_user_id', $1),
           updated_at = NOW()
         WHERE id = $3`,
        [appleUserId, email, userId]
      );
    } else {
      // Create new user (generate UUID)
      const { v4: uuidv4 } = await import('uuid');
      userId = uuidv4();
      
      await query(
        `INSERT INTO public.profiles (id, email, metadata, created_at, updated_at)
         VALUES ($1, $2, jsonb_build_object('apple_user_id', $3), NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userId, email || null, appleUserId]
      );
      
      // Create user_settings entry
      await query(
        `INSERT INTO public.user_settings (user_id, created_at, updated_at)
         VALUES ($1, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
    }
    
    logger.info(`Apple user upserted: ${userId}`);
    return userId;
  } catch (error) {
    logger.error('Failed to upsert Apple user', error);
    throw error;
  }
}

