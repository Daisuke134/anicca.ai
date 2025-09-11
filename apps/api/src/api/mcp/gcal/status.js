import requireAuth from '../../../middleware/requireAuth.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (auth.sub && String(auth.sub) !== String(userId)) {
      return res.status(403).json({ error: 'userId mismatch' });
    }

    const WORKSPACE_MCP_URL = process.env.WORKSPACE_MCP_URL;
    if (!WORKSPACE_MCP_URL) {
      console.error('WORKSPACE_MCP_URL not configured');
      return res.status(500).json({ connected: false, error: 'MCP service not configured' });
    }

    const { refreshAccessTokenIfNeeded } = await import('../../../services/googleTokens.js');
    const access = await refreshAccessTokenIfNeeded(userId);
    if (access) {
      return res.json({
        connected: true,
        server_url: `${WORKSPACE_MCP_URL}/mcp`,
        authorization: access,
      });
    }

    return res.json({
      connected: false,
      server_url: `${WORKSPACE_MCP_URL}/mcp`,
    });
  } catch (error) {
    console.error('MCP status error:', error);
    return res.status(500).json({ 
      connected: false, 
      error: error.message 
    });
  }
}
