import requireAuth from '../../../middleware/requireAuth.js';
import { signState } from '../../../utils/state.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (auth.sub && String(auth.sub) !== String(userId)) {
      return res.status(403).json({ error: 'userId mismatch' });
    }

    const WORKSPACE_MCP_URL = process.env.WORKSPACE_MCP_URL;
    
    if (!WORKSPACE_MCP_URL) {
      return res.status(500).json({ error: 'MCP service not configured' });
    }
    // 代理受け（プロキシ）型: Google同意後はプロキシのcallbackに戻す
    const scheme = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proxyBase = `${scheme}://${host}`;
    const redirectUri = `${proxyBase}/api/mcp/gcal/callback`;

    // FastMCP OAuth 2.1 の認可エンドポイント（MCPがCORSとスコープマージを処理）
    const authorize = new URL(`${WORKSPACE_MCP_URL}/oauth2/authorize`);
    const nonce = Math.random().toString(36).slice(2);
    const ts = Date.now();
    const signedState = signState({ userId, nonce, ts });
    authorize.searchParams.set('state', signedState);
    authorize.searchParams.set('redirect_uri', redirectUri);
    // Ensure refresh_token is issued on first consent; do NOT merge past grants
    authorize.searchParams.set('access_type', 'offline');
    authorize.searchParams.set('prompt', 'consent');
    authorize.searchParams.set('include_granted_scopes', 'false');

    return res.json({ url: authorize.toString() });
  } catch (error) {
    console.error('OAuth URL error:', error);
    return res.status(500).json({ error: error.message });
  }
}
