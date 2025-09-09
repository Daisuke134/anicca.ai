import { query } from '../lib/db.js';
import { encryptJson, decryptJson } from '../lib/crypto/envelope.js';

const TABLE = 'tokens';
const REFRESH_THRESHOLD_SEC = 1800; // 30分
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
} = process.env;

if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
  throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET must be set on proxy');
}

export async function getRow(userId) {
  const { rows } = await query(`SELECT * FROM ${TABLE} WHERE user_id=$1 AND provider='google' AND revoked_at IS NULL`, [userId]);
  return rows[0] || null;
}

export async function saveTokens({ userId, providerSub, email, accessToken, refreshToken, scope, expiry, rotationFamilyId }) {
  const now = new Date();
  const accessPayload = await encryptJson({ v: 1, accessToken });
  const refreshPayload = refreshToken ? await encryptJson({ v: 1, refreshToken }) : null;
  await query(
    `INSERT INTO ${TABLE}
     (user_id, provider, provider_sub, email, access_token_enc, refresh_token_enc, scope, expiry, rotation_family_id, created_at, updated_at)
     VALUES ($1,'google',$2,$3,$4,$5,$6,$7,$8,$9,$9)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       provider_sub=EXCLUDED.provider_sub,
       email=EXCLUDED.email,
       access_token_enc=EXCLUDED.access_token_enc,
       refresh_token_enc=COALESCE(EXCLUDED.refresh_token_enc, ${TABLE}.refresh_token_enc),
       scope=EXCLUDED.scope,
       expiry=EXCLUDED.expiry,
       rotation_family_id=COALESCE(EXCLUDED.rotation_family_id, ${TABLE}.rotation_family_id),
       updated_at=EXCLUDED.updated_at`,
    [
      userId,
      providerSub || null,
      email || null,
      accessPayload,
      refreshPayload,
      scope || null,
      expiry ? new Date(expiry) : null,
      rotationFamilyId || null,
      now,
    ],
  );
}

export async function loadDecrypted(userId) {
  const row = await getRow(userId);
  if (!row) return null;
  // JSONBはオブジェクト前提で扱う
  const access = await decryptJson(row.access_token_enc);
  const refresh = row.refresh_token_enc ? await decryptJson(row.refresh_token_enc) : null;
  return {
    userId,
    providerSub: row.provider_sub,
    email: row.email,
    accessToken: access.accessToken,
    refreshToken: refresh?.refreshToken || null,
    scope: row.scope,
    expiry: row.expiry ? new Date(row.expiry) : null,
    rotationFamilyId: row.rotation_family_id,
  };
}

export async function refreshAccessTokenIfNeeded(userId) {
  const tok = await loadDecrypted(userId);
  if (!tok) return null;
  const now = Date.now();
  const exp = tok.expiry ? tok.expiry.getTime() : 0;
  const needsRefresh = !tok.accessToken || !exp || (exp - now) < REFRESH_THRESHOLD_SEC * 1000;
  if (!needsRefresh) return tok.accessToken;
  if (!tok.refreshToken) return null;

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', tok.refreshToken);
  body.set('client_id', GOOGLE_OAUTH_CLIENT_ID);
  body.set('client_secret', GOOGLE_OAUTH_CLIENT_SECRET);

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) return null;

  const newAccess = data.access_token;
  const newRefresh = data.refresh_token || null;
  const expiresIn = data.expires_in || 3600;
  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  await saveTokens({
    userId,
    providerSub: tok.providerSub,
    email: tok.email,
    accessToken: newAccess,
    refreshToken: newRefresh,
    scope: data.scope || tok.scope,
    expiry: newExpiry,
    rotationFamilyId: tok.rotationFamilyId,
  });
  return newAccess;
}
