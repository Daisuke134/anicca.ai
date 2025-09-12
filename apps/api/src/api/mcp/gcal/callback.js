import { saveTokens } from '../../../services/googleTokens.js';
import { verifyState } from '../../../utils/state.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // 署名付き
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }
    let parsedState;
    try {
      parsedState = verifyState(state);
    } catch (e) {
      console.error('Invalid state:', e?.message || e);
      return res.status(400).send('Invalid state');
    }

    const WORKSPACE_MCP_URL = process.env.WORKSPACE_MCP_URL;
    if (!WORKSPACE_MCP_URL) {
      return res.status(500).send('MCP service not configured');
    }

    const scheme = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${scheme}://${host}/api/mcp/gcal/callback`;

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', redirectUri);

    const tokenResp = await fetch(`${WORKSPACE_MCP_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson.access_token) {
      console.error('Token exchange failed', tokenResp.status, tokenJson);
      return res.status(502).send('Token exchange failed');
    }

    const userId = parsedState.userId;
    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token || null;
    const expiresIn = Number(tokenJson.expires_in || 3600);
    const expiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();
    await saveTokens({
      userId,
      providerSub: null,
      email: null,
      accessToken,
      refreshToken,
      scope: tokenJson.scope || null,
      expiry: expiryIso,
      rotationFamilyId: null,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!doctype html>
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Google Calendar 接続完了</title></head>
      <body style="font-family: system-ui; padding: 24px;">
        <h2>Google Calendar の接続が完了しました。</h2>
        <p>アプリに戻って操作を続けてください。</p>
      </body></html>
    `);
  } catch (e) {
    console.error('gcal callback error', e);
    return res.status(500).send('Internal error');
  }
}
