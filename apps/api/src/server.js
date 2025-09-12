import express from 'express';
import cors from 'cors';
import { initDatabase, loadLatestTokensFromDB } from './services/tokens/slackTokens.supabase.js';
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
  // console.log(`🔑 ACI_API_KEY: ${process.env.ACI_API_KEY ? 'Set' : '❌ Not set'}`);
});
