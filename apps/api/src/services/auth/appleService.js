import baseLogger from '../../utils/logger.js';
import { query } from '../../lib/db.js';
import crypto from 'crypto';

const logger = baseLogger.withContext('AppleAuthService');

// Cache for Apple's public keys (should be refreshed periodically)
let appleKeysCache = null;
let appleKeysCacheExpiry = null;

/**
 * Verify Apple identity token
 * @param {string} identityToken - JWT from Apple
 * @param {string} nonce - Nonce used in the request
 * @param {string} appleUserId - Apple's user identifier
 * @returns {Promise<object|null>} Verified user data or null
 */
export async function verifyIdentityToken(identityToken, nonce, appleUserId) {
  try {
    // TODO: Implement full JWT verification with Apple's public keys
    // For now, basic structure - full implementation would:
    // 1. Decode JWT header and payload
    // 2. Fetch Apple's public keys from https://appleid.apple.com/auth/keys
    // 3. Verify signature
    // 4. Verify nonce hash
    // 5. Verify expiry and issuer
    
    // Placeholder: Extract basic info (in production, decode and verify JWT properly)
    const decoded = parseJWT(identityToken);
    
    if (!decoded) {
      logger.error('Failed to parse identity token');
      return null;
    }
    
    // Verify nonce (should match SHA256 hash in token's nonce claim)
    const nonceHash = crypto.createHash('sha256').update(nonce).digest('base64url');
    if (decoded.nonce && decoded.nonce !== nonceHash) {
      logger.warn('Nonce mismatch');
      return null;
    }
    
    // Extract user info
    const sub = decoded.sub || appleUserId;
    const email = decoded.email;
    const emailVerified = decoded.email_verified;
    
    // Upsert user in database
    const userId = await upsertAppleUser({
      appleUserId: sub,
      email: email,
      emailVerified: emailVerified
    });
    
    return {
      userId,
      displayName: decoded.name?.givenName || decoded.name?.familyName || 'User',
      email: email
    };
  } catch (error) {
    logger.error('Token verification failed', error);
    return null;
  }
}

/**
 * Parse JWT (basic implementation - should use proper JWT library)
 * @private
 */
function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode payload (base64url)
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    logger.error('JWT parsing failed', error);
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

/**
 * Fetch Apple's public keys (for JWT verification)
 * Should be implemented for production
 * @private
 */
async function fetchApplePublicKeys() {
  // TODO: Implement fetching from https://appleid.apple.com/auth/keys
  // Cache the keys for a reasonable period
  return null;
}

