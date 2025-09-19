import express from 'express';
import cors from 'cors';
import { initDatabase } from './services/tokens/slackTokens.supabase.js';
import apiRouter from './routes/index.js';

// Only load dotenv in development
if (process.env.NODE_ENV !== 'production') {
  import('dotenv').then(dotenv => dotenv.config());
}

// サーバー起動時の初期化処理（DB初期化のみ）
async function initializeServer() {
  await initDatabase();
  console.log('✅ Database initialized. Using user-based token management.');
}

initializeServer();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-API-Key', 'anthropic-version', 'anthropic-beta']
};
app.use(cors(corsOptions));

const stripeWebhookPath = '/api/billing/webhook/stripe';
app.use(stripeWebhookPath, express.raw({ type: 'application/json' }));

const jsonParser = express.json({ limit: '50mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '50mb' });
app.use((req, res, next) => {
  if (req.originalUrl === stripeWebhookPath) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === stripeWebhookPath) return next();
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
app.listen(PORT, () => {
  console.log(`🚀 Anicca Proxy Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
