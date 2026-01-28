import express from 'express';
import rateLimit from 'express-rate-limit';

// Realtime
import realtimeDesktopRouter from './realtime/desktop.js';
import realtimeWebRouter from './realtime/web.js';
import mobileRouter from './mobile/index.js';

// Proxy
import claudeProxyRouter from './proxy/claude.js';

// Auth
import googleAuthRouter from './auth/google/index.js';
import slackAuthRouter from './auth/slack/index.js';
import entitlementRouter from './auth/entitlement.js';
import appleAuthRouter from './auth/apple.js';
import refreshAuthRouter from './auth/refresh.js';
import logoutAuthRouter from './auth/logout.js';

// Billing
import billingRouter from './billing/index.js';

// Phase 6: LLM生成Nudge
import nudgeGenerateRouter from './nudge/generate.js';

// MCP
import mcpGcalRouter from './mcp/gcal/index.js';

// Tools
import newsRouter from './tools/news.js';
import searchExaRouter from './tools/search_exa.js';
import claudeCodeRouter from './tools/claude_code.js';
import slackToolRouter from './tools/slack.js';
import playwrightRouter from './tools/playwright.js';
import transcribeRouter from './tools/transcribe.js';

// Preview
import previewAppRouter from './preview/app.js';

// Admin (internal API for TikTok agent / GitHub Actions)
import adminTiktokRouter from './admin/tiktok.js';
import adminHookCandidatesRouter from './admin/hookCandidates.js';


const router = express.Router();

// Mount under /api prefix (kept by design)
router.use('/realtime/desktop', realtimeDesktopRouter);
router.use('/realtime/web', realtimeWebRouter);
router.use('/mobile', mobileRouter);

router.use('/proxy/claude', claudeProxyRouter);

router.use('/auth/google', googleAuthRouter);
router.use('/auth/slack', slackAuthRouter);
router.use('/auth/entitlement', entitlementRouter);
router.use('/auth/apple', appleAuthRouter);
router.use('/auth/refresh', refreshAuthRouter);
router.use('/auth/logout', logoutAuthRouter);

router.use('/billing', billingRouter);

router.use('/nudge', nudgeGenerateRouter);

router.use('/mcp/gcal', mcpGcalRouter);

router.use('/tools/news', newsRouter);
router.use('/tools/search/exa', searchExaRouter);
router.use('/tools/claude_code', claudeCodeRouter);
router.use('/tools/slack', slackToolRouter);
router.use('/tools/playwright', playwrightRouter);
router.use('/tools/transcribe', transcribeRouter);

router.use('/preview/app', previewAppRouter);

// Admin API (requireInternalAuth on each router + rate limit 30 req/min)
const adminLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
router.use('/admin/tiktok', adminLimiter, adminTiktokRouter);
router.use('/admin/hook-candidates', adminLimiter, adminHookCandidatesRouter);

export default router;
