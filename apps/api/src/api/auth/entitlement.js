import { createClient } from '@supabase/supabase-js';
import { signJwtHs256 } from '../../utils/jwt.js';

const DEFAULT_TTL_SEC = 30 * 60; // 30分

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization bearer' });
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
    // Supabaseのaccess_tokenを検証してユーザーを取得
    const { data, error } = await supabase.auth.getUser(supabaseAccessToken);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid Supabase access token' });
    }

    const user = data.user;
    // 課金導入前は暫定（将来はStripeのサブスク状態で決定）
    const plan = 'free';

    const now = Math.floor(Date.now() / 1000);
    const exp = now + DEFAULT_TTL_SEC;
    const payload = { sub: user.id, email: user.email || null, plan, iat: now, exp };
    const token = signJwtHs256(payload, proxySecret);

    return res.json({ token, expires_at: exp * 1000 });
  } catch (e) {
    console.error('entitlement error:', e);
    return res.status(500).json({ error: 'Failed to issue entitlement token' });
  }
}
