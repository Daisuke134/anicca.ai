import crypto from 'crypto';

const SEP = '.';
const TTL_MS = 10 * 60 * 1000; // 10分

export function signState({ userId, nonce, ts }, secret = process.env.PROXY_STATE_SECRET) {
  if (!secret) throw new Error('PROXY_STATE_SECRET not set');
  const payload = [Buffer.from(String(userId)).toString('base64url'), String(nonce), String(ts)].join(SEP);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return [payload, sig].join(SEP);
}

export function verifyState(stateToken, secret = process.env.PROXY_STATE_SECRET) {
  if (!secret) throw new Error('PROXY_STATE_SECRET not set');
  const parts = String(stateToken || '').split(SEP);
  if (parts.length !== 4) throw new Error('invalid state format');
  const [b64UserId, nonce, ts, sig] = parts;
  const payload = [b64UserId, nonce, ts].join(SEP);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('invalid state signature');
  const userId = Buffer.from(b64UserId, 'base64url').toString('utf8');
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) throw new Error('invalid ts');
  if (Date.now() - tsNum > TTL_MS) throw new Error('state expired');
  return { userId, nonce, ts: tsNum };
}

