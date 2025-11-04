import express from 'express';

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

// Billing
import billingRouter from './billing/index.js';

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


const router = express.Router();

// Mount under /api prefix (kept by design)
router.use('/realtime/desktop', realtimeDesktopRouter);
router.use('/realtime/web', realtimeWebRouter);
router.use('/mobile', mobileRouter);

router.use('/proxy/claude', claudeProxyRouter);

router.use('/auth/google', googleAuthRouter);
router.use('/auth/slack', slackAuthRouter);
router.use('/auth/entitlement', entitlementRouter);

router.use('/billing', billingRouter);

router.use('/mcp/gcal', mcpGcalRouter);

router.use('/tools/news', newsRouter);
router.use('/tools/search/exa', searchExaRouter);
router.use('/tools/claude_code', claudeCodeRouter);
router.use('/tools/slack', slackToolRouter);
router.use('/tools/playwright', playwrightRouter);
router.use('/tools/transcribe', transcribeRouter);

router.use('/preview/app', previewAppRouter);

export default router;
