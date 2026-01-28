import baseLogger from '../utils/logger.js';

const logger = baseLogger.withContext('RequireInternalAuth');

/**
 * 内部API用認証ミドルウェア（cron job専用）
 * INTERNAL_API_TOKEN環境変数と一致するBearerトークンを要求
 */
export default function requireInternalAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) {
    logger.warn('Missing Authorization bearer for internal API');
    return res.status(401).json({ error: 'Missing Authorization bearer' });
  }

  const token = auth.slice('Bearer '.length).trim();
  const expectedToken = process.env.INTERNAL_API_TOKEN;

  if (!expectedToken) {
    logger.error('INTERNAL_API_TOKEN not configured');
    return res.status(500).json({ error: 'Internal API token not configured' });
  }

  if (token !== expectedToken) {
    logger.warn('Invalid internal API token');
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

