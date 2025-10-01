import { randomUUID } from 'crypto';

const SESSION_LIMIT = 1000;
const sessions = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

export function createGuestSession(limit, ttlMs) {
  purgeExpired();
  const id = `guest:${randomUUID()}`;
  const expiresAt = Date.now() + ttlMs;
  const session = {
    id,
    limit: Math.min(limit, SESSION_LIMIT),
    used: 0,
    expiresAt
  };
  sessions.set(id, session);
  return session;
}

export function getGuestSession(id) {
  purgeExpired();
  return sessions.get(id) || null;
}

export function consumeGuestTurn(id) {
  const session = getGuestSession(id);
  if (!session) {
    return { allowed: false, reason: 'expired' };
  }
  if (session.used >= session.limit) {
    return { allowed: false, reason: 'limit' };
  }
  session.used += 1;
  return { allowed: true, session };
}

export function snapshotGuestEntitlement(session) {
  if (!session) {
    return {
      plan: 'guest',
      status: 'guest',
      currentPeriodEnd: null,
      usageLimit: 0,
      usageRemaining: 0,
      usageCount: 0
    };
  }
  const remaining = Math.max(session.limit - session.used, 0);
  return {
    plan: 'guest',
    status: 'guest',
    currentPeriodEnd: new Date(session.expiresAt).toISOString(),
    usageLimit: session.limit,
    usageRemaining: remaining,
    usageCount: session.used
  };
}
