// ★ mem0aiテレメトリーを最初に無効化（ESモジュールのimport巻き上げ対策）
process.env.MEM0_TELEMETRY = 'false';

import express from 'express';
import cors from 'cors';
import { initDatabase } from './services/tokens/slackTokens.supabase.js';
import { runMigrationsOnce } from './lib/migrate.js';
import apiRouter from './routes/index.js';
import { pool } from './lib/db.js';

// Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
  import('dotenv').then(dotenv => dotenv.config());
}

// サーバー起動時の初期化処理（DB初期化のみ）
async function initializeServer() {
  // マイグレーション（初回のみ実行）
  await runMigrationsOnce();
  await initDatabase();
  console.log('✅ Database initialized. VoIP dispatcher disabled.');
  
  // 月次クレジットジョブ（UTC 00:05 付近で起動、当月未付与のみ実行）
  const { runMonthlyCredits } = await import('./jobs/monthlyCredits.js');
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
      try {
        await runMonthlyCredits(now);
      } catch (e) {
        console.error('monthly credits failed', e);
      }
    }
  }, 60_000); // 1分ごとにチェック
}

const app = express();
app.set('trust proxy', 1); // Railway runs behind a reverse proxy
const PORT = process.env.PORT || 3000;
const controller = new AbortController();

await initializeServer().catch(err => {
  console.error('❌ Failed to initialize server', err);
  process.exit(1);
});

// mem0aiテレメトリーのETIMEDOUTエラーを無視
process.on('unhandledRejection', (reason, promise) => {
  // テレメトリーエラーは完全に無視（ログ出力もしない）
  if (reason?.message?.includes('Telemetry') ||
      reason?.message?.includes('fetch failed') ||
      reason?.stack?.includes('captureClientEvent') ||
      reason?.stack?.includes('captureEvent') ||
      reason?.cause?.code === 'ETIMEDOUT' ||
      (reason?.cause?.errors && Array.isArray(reason.cause.errors))) {
    // テレメトリーエラーは無視（アプリ動作に影響なし）
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

// Middleware
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-API-Key', 'anthropic-version', 'anthropic-beta', 'user-id', 'device-id']
};
app.use(cors(corsOptions));

const revenuecatWebhookPath = '/api/billing/webhook/revenuecat';
app.use(revenuecatWebhookPath, express.raw({ type: 'application/json' }));

const jsonParser = express.json({ limit: '50mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '50mb' });
app.use((req, res, next) => {
  if (req.originalUrl === revenuecatWebhookPath) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === revenuecatWebhookPath) return next();
  return urlencodedParser(req, res, next);
});

// Preflight 全面対応
app.options('*', cors(corsOptions));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount new routing layer under /api
app.use('/api', apiRouter);

// Root endpoint -> health
app.get('/', (req, res) => {
  res.redirect('/health');
});

// Check required environment variables
const requiredEnvVars = [];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please set these variables in Railway or your environment');
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Anicca Proxy Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`⚠️ Received ${signal}, shutting down gracefully...`);
    controller.abort();
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  });
});
