import { query } from '../../lib/db.js';
import baseLogger from '../../utils/logger.js';

const logger = baseLogger.withContext('UserIdResolver');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

/**
 * Resolve incoming userId (uuid or apple_user_id) into profiles.id (uuid string).
 * Returns null if not resolvable.
 */
export async function resolveProfileId(userId) {
  const raw = String(userId || '').trim();
  if (!raw) return null;
  if (isUuid(raw)) return raw;

  // Fallback: match profiles.metadata.apple_user_id
  try {
    const r = await query(
      `select id
         from profiles
        where metadata->>'apple_user_id' = $1
        limit 1`,
      [raw]
    );
    return r.rows?.[0]?.id ? String(r.rows[0].id) : null;
  } catch (e) {
    logger.warn('Failed to resolve profileId from profiles.metadata', e);
    return null;
  }
}










