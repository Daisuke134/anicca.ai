/**
 * 環境変数の統一管理
 * 
 * 従来の分散していた環境変数を一箇所に集約
 * デスクトップアプリとWebアプリの共通設定を管理
 */

// 環境判定
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

// プロキシサーバー設定
export const PROXY_BASE_URL = process.env.PROXY_BASE_URL || '';

// 本番では必須（未設定は即座に失敗）
if (IS_PRODUCTION && !PROXY_BASE_URL) {
  throw new Error('PROXY_BASE_URL is required in production environment');
}

// アプリケーションモード
export const DESKTOP_MODE = process.env.DESKTOP_MODE === 'true' || false;
export const USE_PROXY = process.env.USE_PROXY !== 'false'; // デフォルトはtrue

// サーバー設定
export const SERVER_CONFIG = {
  // Railwayデプロイメント判定
  IS_RAILWAY: !!process.env.RAILWAY_ENVIRONMENT,
  IS_VERCEL: !!process.env.VERCEL,
  
  // ポート設定
  PORT: process.env.PORT || 8080,
  
  // 公開ドメイン
  PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL
};

// API Keys（存在チェックのみ、実際の値は環境変数から直接参照）
export const API_KEYS = {
  ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
  OPENAI: !!process.env.OPENAI_API_KEY,
  SLACK_CLIENT_ID: !!process.env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: !!process.env.SLACK_CLIENT_SECRET,
  SLACK_TOKEN_ENCRYPTION_KEY: !!process.env.SLACK_TOKEN_ENCRYPTION_KEY,
  SUPABASE_URL: !!process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
};

const proDailyLimitRaw = process.env.PRO_DAILY_LIMIT || '';
const proDailyLimitParsed = Number.parseInt(proDailyLimitRaw, 10);
const freeDailyLimitRaw = process.env.FREE_DAILY_LIMIT || '';
const freeDailyLimitParsed = Number.parseInt(freeDailyLimitRaw, 10);

// 課金関連設定
export const BILLING_CONFIG = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  STRIPE_PRODUCT_PRO: process.env.STRIPE_PRODUCT_PRO || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  CHECKOUT_RETURN_URL: process.env.CHECKOUT_RETURN_URL || '',
  PORTAL_RETURN_URL: process.env.PORTAL_RETURN_URL || '',
  FREE_DAILY_LIMIT: Number.isFinite(freeDailyLimitParsed) ? freeDailyLimitParsed : null,
  PRO_DAILY_LIMIT: Number.isFinite(proDailyLimitParsed) ? proDailyLimitParsed : null
};

// ディレクトリ設定
export const DIRECTORIES = {
  // 一時ファイル保存先（サーバー環境に応じて自動判定）
  TEMP_BASE: SERVER_CONFIG.IS_RAILWAY || SERVER_CONFIG.IS_VERCEL
    ? '/tmp'
    : process.env.TEMP_DIR || './tmp',
  
  // ユーザーデータ保存先
  USER_DATA: process.env.USER_DATA_DIR || '~/.anicca'
};

// Webアプリ設定
export const WEB_CONFIG = {
  // WebアプリのURL
  ANICCA_WEB_URL: process.env.ANICCA_WEB_URL || (IS_PRODUCTION 
    ? 'https://app.aniccaai.com'
    : 'http://localhost:3000')
};

// デバッグ設定
export const DEBUG_CONFIG = {
  // デバッグモード
  DEBUG: process.env.DEBUG === 'true',
  
  // ログレベル
  LOG_LEVEL: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug')
};

// モデル設定（将来差替え容易に）
export const MODEL_CONFIG = {
  CLAUDE_WORKER_DEFAULT_MODEL: process.env.CLAUDE_WORKER_DEFAULT_MODEL || 'claude-4-sonnet-20250514'
};

// 環境変数の検証
export function validateEnvironment() {
  const warnings = [];
  
  // 本番環境で必須の環境変数をチェック
  if (IS_PRODUCTION) {
    if (!API_KEYS.ANTHROPIC) {
      warnings.push('ANTHROPIC_API_KEY is not set');
    }
    if (!API_KEYS.SLACK_CLIENT_ID || !API_KEYS.SLACK_CLIENT_SECRET) {
      warnings.push('Slack OAuth credentials are not set');
    }
    if (!API_KEYS.SUPABASE_URL || !API_KEYS.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('Supabase credentials are not set');
    }
    if (!BILLING_CONFIG.STRIPE_SECRET_KEY) {
      warnings.push('STRIPE_SECRET_KEY is not set');
    }
    if (!BILLING_CONFIG.STRIPE_PRICE_PRO_MONTHLY || !BILLING_CONFIG.STRIPE_PRODUCT_PRO) {
      warnings.push('Stripe Product/Price IDs are not set');
    }
    if (!BILLING_CONFIG.STRIPE_WEBHOOK_SECRET) {
      warnings.push('STRIPE_WEBHOOK_SECRET is not set');
    }
    if (!process.env.PROXY_GUEST_JWT_SECRET) {
      warnings.push('PROXY_GUEST_JWT_SECRET is not set');
    }
    if (!BILLING_CONFIG.CHECKOUT_RETURN_URL || !BILLING_CONFIG.PORTAL_RETURN_URL) {
      warnings.push('Checkout/Portal return URLs are not set');
    }
  }

  if (process.env.FREE_DAILY_LIMIT && BILLING_CONFIG.FREE_DAILY_LIMIT === null) {
    warnings.push('FREE_DAILY_LIMIT is not a valid integer');
  }
  if (process.env.PRO_DAILY_LIMIT && BILLING_CONFIG.PRO_DAILY_LIMIT === null) {
    warnings.push('PRO_DAILY_LIMIT is not a valid integer');
  }

  return warnings;
}

// 環境情報をログ出力（デバッグ用）
export function logEnvironment() {
  console.log('🔧 Environment Configuration:');
  console.log(`  - NODE_ENV: ${NODE_ENV}`);
  console.log(`  - PROXY_BASE_URL: ${PROXY_BASE_URL}`);
  console.log(`  - DESKTOP_MODE: ${DESKTOP_MODE}`);
  console.log(`  - USE_PROXY: ${USE_PROXY}`);
  console.log(`  - Server: ${SERVER_CONFIG.IS_RAILWAY ? 'Railway' : SERVER_CONFIG.IS_VERCEL ? 'Vercel' : 'Local'}`);
  console.log(`  - Stripe price: ${BILLING_CONFIG.STRIPE_PRICE_PRO_MONTHLY || 'unset'}`);
  console.log(`  - Free daily limit: ${BILLING_CONFIG.FREE_DAILY_LIMIT ?? 'unset'}`);
  console.log(`  - Pro daily limit: ${BILLING_CONFIG.PRO_DAILY_LIMIT ?? 'default(1000)'}`);
  
  const warnings = validateEnvironment();
  if (warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
}
