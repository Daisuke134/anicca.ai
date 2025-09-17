import crypto from 'crypto';

// HS256 JWT 検証（外部依存なし）
function verifyJwtHs256(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid jwt');
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const ok = crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
  if (!ok) throw new Error('signature mismatch');
  const payloadJson = Buffer.from(p, 'base64url').toString('utf8');
  return JSON.parse(payloadJson);
}

export default async function requireAuth(req, res) {
  try {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization bearer' });
      return null;
    }
    const token = auth.slice('Bearer '.length).trim();
    const secret = process.env.PROXY_AUTH_JWT_SECRET;
    if (!secret) {
      console.error('PROXY_AUTH_JWT_SECRET is not set');
      res.status(500).json({ error: 'Server auth misconfigured' });
      return null;
    }
    const decoded = verifyJwtHs256(token, secret);
    const sub = decoded?.sub || decoded?.uid || decoded?.user_id || decoded?.email || null;
    if (!sub) {
      res.status(401).json({ error: 'Token missing subject' });
      return null;
    }
    const email = decoded?.email || null;
    const plan = decoded?.plan || 'free';
    const status = decoded?.status || 'free';
    const usageLimit = Number.isFinite(decoded?.usage_limit) ? decoded.usage_limit : null;
    const usageRemaining = Number.isFinite(decoded?.usage_remaining) ? decoded.usage_remaining : null;
    return { sub, email, plan, status, usageLimit, usageRemaining, raw: decoded };
  } catch (e) {
    console.warn('JWT verification failed:', e?.message || String(e));
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
}

