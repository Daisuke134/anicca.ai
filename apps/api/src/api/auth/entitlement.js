/**
 * Supabase SDK — 補助サービスとして使用（メインDBではない）
 * メインDB: Railway PostgreSQL（Prisma経由）
 * 用途: Supabase Auth（ユーザー検証）
 */
import { createClient } from '@supabase/supabase-js';
import { signJwtHs256 } from '../../utils/jwt.js';
import {
  createGuestSession,
  snapshotGuestEntitlement
} from '../../services/guestSessions.js';
import { getEntitlementState, normalizePlanForResponse } from '../../services/subscriptionStore.js';

const DEFAULT_TTL_SEC = 30 * 60; // 30分
const GUEST_TTL_SEC = 24 * 60 * 60; // 24時間
const GUEST_USAGE_LIMIT = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = req.headers['authorization'] || '';
    const now = Math.floor(Date.now() / 1000);

    if (!auth.startsWith('Bearer ')) {
      const guestSecret = process.env.PROXY_GUEST_JWT_SECRET;
      if (!guestSecret) {
        return res.status(500).json({ error: 'PROXY_GUEST_JWT_SECRET not configured' });
      }
      const session = createGuestSession(GUEST_USAGE_LIMIT, GUEST_TTL_SEC * 1000);
      const exp = now + GUEST_TTL_SEC;
      const remaining = Math.max(session.limit - session.used, 0);
      const payload = {
        sub: session.id,
        guest_session_id: session.id,
        plan: 'guest',
        status: 'guest',
        guest: true,
        usage_limit: session.limit,
        usage_remaining: remaining,
        iat: now,
        exp
      };
      const token = signJwtHs256(payload, guestSecret);
      return res.json({
        token,
        expires_at: exp * 1000,
        entitlement: normalizePlanForResponse(snapshotGuestEntitlement(session))
      });
    }

    const supabaseAccessToken = auth.slice('Bearer '.length).trim();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const proxySecret = process.env.PROXY_AUTH_JWT_SECRET;
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Supabase not configured on proxy' });
    }
    if (!proxySecret) {
      return res.status(500).json({ error: 'PROXY_AUTH_JWT_SECRET not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.auth.getUser(supabaseAccessToken);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid Supabase access token' });
    }

    const user = data.user;
    const entitlementState = await getEntitlementState(user.id);
    const exp = now + DEFAULT_TTL_SEC;
    const payload = {
      sub: user.id,
      email: user.email || null,
      plan: entitlementState.plan,
      status: entitlementState.status,
      usage_limit: entitlementState.usageLimit,
      usage_remaining: entitlementState.usageRemaining,
      iat: now,
      exp
    };
    const token = signJwtHs256(payload, proxySecret);
    const response = {
      token,
      expires_at: exp * 1000,
      entitlement: normalizePlanForResponse(entitlementState)
    };
    return res.json(response);
  } catch (e) {
    console.error('entitlement error:', e);
    return res.status(500).json({ error: 'Failed to issue entitlement token' });
  }
}
