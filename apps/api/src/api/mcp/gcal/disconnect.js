import requireAuth from '../../../middleware/requireAuth.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (auth.sub && String(auth.sub) !== String(userId)) {
      return res.status(403).json({ error: 'userId mismatch' });
    }

    const { query } = await import('../../../lib/db.js');
    // 1) 現行トークン取得
    const { rows } = await query("SELECT email, access_token_enc, refresh_token_enc FROM tokens WHERE user_id=$1 AND provider='google' AND revoked_at IS NULL", [userId]);
    const row = rows?.[0] || null;
    // 2) Google revoke（best-effort）
    try {
      if (row) {
        const { decryptJson } = await import('../../../lib/crypto/envelope.js');
        const access = await decryptJson(row.access_token_enc).catch(()=>null);
        const refresh = row.refresh_token_enc ? await decryptJson(row.refresh_token_enc).catch(()=>null) : null;
        const tokenToRevoke = refresh?.refreshToken || access?.accessToken || null;
        if (tokenToRevoke) {
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokenToRevoke }).toString()
          }).catch(()=>{});
        }
      }
    } catch (e) {
      console.warn('Google revoke skipped:', e?.message || e);
    }
    // 3) Workspace purge（best-effort）
    try {
      const WORKSPACE_MCP_URL = process.env.WORKSPACE_MCP_URL;
      const ADMIN_SHARED_SECRET = process.env.ADMIN_SHARED_SECRET;
      if (WORKSPACE_MCP_URL && ADMIN_SHARED_SECRET && row?.email) {
        await fetch(`${WORKSPACE_MCP_URL}/oauth21/session/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': ADMIN_SHARED_SECRET
          },
          body: JSON.stringify({ email: row.email })
        }).catch(()=>{});
      }
    } catch (e) {
      console.warn('Workspace purge skipped:', e?.message || e);
    }
    // 4) DB削除
    await query("DELETE FROM tokens WHERE user_id=$1 AND provider='google'", [userId]);

    // Optionally try to revoke at Google here if needed (best-effort)
    return res.json({ success: true });
  } catch (e) {
    console.error('gcal disconnect error', e);
    return res.status(500).json({ success: false, error: e?.message || 'Internal error' });
  }
}
