import express from 'express';
import cors from 'cors';
import { initDatabase, loadLatestTokensFromDB } from './services/storage/database.js';
import logger from './utils/logger.js';
import { logEnvironment } from './config/environment.js';

// Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
  import('dotenv').then(dotenv => dotenv.config());
}

// サーバー起動時の初期化処理（DB初期化のみ）
async function initializeServer() {
  await initDatabase();
  logger.info('Database initialized. Using user-based token management.');
}

initializeServer();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Import auth middleware
// import { authMiddleware } from './middleware/auth.js';

// Apply auth middleware to all routes
// app.use(authMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import all API handlers
// Removed shared openai proxy; split by desktop/web
import desktopSessionHandler from './api/proxy/realtime/desktopSession.js';
import webSessionHandler from './api/proxy/realtime/webSession.js';
import downloadHandler from './api/static/download.js';
import landingHandler from './api/static/landing.js';
import hackerNewsHandler from './api/tools/web/news.js';
import exaHandler from './api/tools/web/search.js';
import claudeCodeHandler from './api/tools/sdk/claude-code.js';
import claudeHandler from './api/proxy/claude.js';
// MCP handlers
import elevenLabsHandler from './api/mcp/elevenlabs.js';
// Auth handlers
import authGoogleHandler from './api/auth/google/oauth.js';
import authCallbackHandler from './api/auth/google/callback.js';
import authRefreshHandler from './api/auth/google/refresh.js';
import entitlementHandler from './api/auth/entitlement.js';
// New Slack OAuth handlers
import slackOauthUrlHandler from './api/auth/slack/oauth-url.js';
import slackOauthCallbackHandler from './api/auth/slack/oauth-callback.js'; // 新しいエンドポイント
import slackCheckConnectionHandler from './api/auth/slack/check-connection.js';
// Tool handlers
import slackToolHandler from './api/tools/web/slack.js';
// Preview app handler
import previewAppHandler from './api/static/preview-app.js';
// Parallel SDK REST endpoint removed in favor of /api/tools/claude_code
// Composio handlers
import gcalOauthUrlHandler from './api/mcp/gcal/oauth-url.js';
import gcalStatusHandler from './api/mcp/gcal/status.js';
import gcalCallbackHandler from './api/mcp/gcal/callback.js';
import gcalDisconnectHandler from './api/mcp/gcal/disconnect.js';

// API Routes - 完全移植
// Desktop/Web Realtime session endpoints (split)
app.all('/api/openai-proxy/desktop-session', desktopSessionHandler);
app.all('/api/openai-proxy/web-session', webSessionHandler);
app.all('/api/claude*', claudeHandler);
// 古いSlack OAuthエンドポイント（無効化）
// app.all('/api/slack-oauth', slackOauthHandler);
// app.all('/api/slack-oauth/callback', slackOauthCallbackHandlerOld);
app.all('/api/download', downloadHandler);
app.all('/api/landing', landingHandler);
// News endpoint (unified)
app.all('/api/tools/news', hackerNewsHandler);
// Exa search unified endpoint
app.all('/api/tools/search_exa', exaHandler);
app.all('/api/tools/claude_code', claudeCodeHandler);
// Auth routes
app.all('/api/auth/google', authGoogleHandler);
app.all('/api/auth/callback', authCallbackHandler);
app.all('/api/auth/refresh', authRefreshHandler);
app.all('/api/auth/entitlement', entitlementHandler);
// New Slack OAuth routes
app.all('/api/slack/oauth-url', slackOauthUrlHandler);
app.all('/api/slack/oauth-callback', slackOauthCallbackHandler);
app.all('/api/slack/check-connection', slackCheckConnectionHandler);
// Slack tool endpoints
app.all('/api/tools/slack', slackToolHandler);
// Preview app endpoint
app.all('/api/preview-app/*', previewAppHandler);

// MCP endpoints
app.all('/api/mcp/elevenlabs', elevenLabsHandler);
// Google Calendar Remote MCP endpoints
  app.all('/api/mcp/gcal/oauth-url', gcalOauthUrlHandler);
  app.all('/api/mcp/gcal/status', gcalStatusHandler);
  app.all('/api/mcp/gcal/callback', gcalCallbackHandler);
  app.all('/api/mcp/gcal/disconnect', gcalDisconnectHandler);

// Removed: /api/parallel-sdk/execute (use /api/tools/claude_code)

// Root endpoint
app.get('/', (req, res) => {
  res.redirect('/api/landing');
});

// Check required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'KMS_KEY_NAME',
  'DATABASE_URL',
  'WORKSPACE_MCP_URL',
  'SLACK_TOKEN_ENCRYPTION_KEY',
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables: %o', missingVars);
  logger.error('Please set these variables in Railway or your environment');
}

// Start server
app.listen(PORT, () => {
  logEnvironment();
  logger.info(`🚀 Anicca Proxy Server running on port ${PORT}`);
  logger.info(`📍 Health check: http://localhost:${PORT}/health`);
  logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
