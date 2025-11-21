import crypto from 'crypto';
import logger from '../../../utils/logger.js';
import requireAuth from '../../../middleware/requireAuth.js';
import {
  getEntitlementState,
  startUsageSession,
  normalizePlanForResponse,
  canUseRealtime
} from '../../../services/subscriptionStore.js';
import {
  consumeGuestTurn,
  snapshotGuestEntitlement
} from '../../../services/guestSessions.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured on proxy' });
    }

    const WORKSPACE_MCP_URL = process.env.WORKSPACE_MCP_URL;
    const mcpAvailable = !!WORKSPACE_MCP_URL;

    let entitlementState;
    let normalizedEntitlement;
    let authorization = null;
    let authHeader = null;
    let server_url = null;
    let connected = false;
    let sessionId = null;

    if (auth.tokenType === 'guest') {
      const result = consumeGuestTurn(auth.guestSessionId);
      if (!result.allowed) {
        return res.status(402).json({
          error: 'Guest quota exceeded',
          message: 'ゲスト利用枠は終了しました。Google ログインで継続してください。'
        });
      }
      entitlementState = snapshotGuestEntitlement(result.session);
      normalizedEntitlement = normalizePlanForResponse(entitlementState);
    } else {
      entitlementState = await getEntitlementState(auth.sub);
      const allowed = canUseRealtime(entitlementState.plan, entitlementState.usageRemaining);
      if (!allowed) {
        return res.status(402).json({
          error: 'Quota exceeded',
          message: 'You have reached the free tier limit. Please upgrade to Anicca Pro.',
          entitlement: normalizePlanForResponse(entitlementState)
        });
      }

      // 分制: セッション開始を記録（終了は /api/realtime/desktop/stop で計上）
      sessionId = crypto.randomUUID();
      await startUsageSession(auth.sub, sessionId);
      entitlementState = await getEntitlementState(auth.sub);
      normalizedEntitlement = normalizePlanForResponse(entitlementState);

      if (mcpAvailable) {
        const { refreshAccessTokenIfNeeded } = await import('../../../services/googleTokens.js');
        authorization = await refreshAccessTokenIfNeeded(auth.sub);
        server_url = `${WORKSPACE_MCP_URL}/mcp`;
        authHeader = authorization && authorization.startsWith('Bearer ')
          ? authorization
          : (authorization ? `Bearer ${authorization}` : null);
      }
      connected = mcpAvailable && !!authorization;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedUserId = url.searchParams.get('userId');
    if (requestedUserId && requestedUserId !== auth.sub) {
      logger.warn('desktopSession userId mismatch', { requestedUserId, tokenSub: auth.sub });
    }

    const sessionBody = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        tools: connected ? [{
          type: 'mcp',
          server_label: 'google_calendar',
          server_url,
          headers: authHeader ? { Authorization: authHeader } : undefined,
          require_approval: 'never'
        }] : []
      }
    };

    const createResp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionBody)
    });
    if (!createResp.ok) {
      const raw = await createResp.text();
      let detail;
      try { detail = JSON.parse(raw); } catch { detail = raw; }
      return res.status(502).json({ error: 'Failed to create client secret', status: createResp.status, detail });
    }
    const clientSecret = await createResp.json();

    return res.json({
      object: 'realtime.session',
      client_secret: { value: clientSecret.value, expires_at: clientSecret.expires_at || 0 },
      model: 'gpt-realtime',
      voice: 'alloy',
      entitlement: normalizedEntitlement,
      session_id: sessionId
    });
  } catch (err) {
    logger.error(`desktop-session error: ${err?.message || String(err)}`);
    return res.status(500).json({ error: 'desktop-session internal error', message: err?.message || String(err) });
  }
}
