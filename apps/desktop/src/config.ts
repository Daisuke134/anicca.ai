/**
 * Application configuration
 * 環境別の設定を管理（埋め込み → ENV → 既定URL の順で解決）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 環境変数の読み込み（.env → .env.defaults の順でマージ）
try { dotenv.config(); } catch {}
try { dotenv.config({ path: '.env.defaults', override: false }); } catch {}

// CIが埋め込む想定のメタデータ
type ProxyMeta = { production?: string; staging?: string };
type SupabaseProjectMeta = { url: string; anonKey: string };
type SupabaseMeta =
  | { url?: string; anonKey?: string }
  | { production?: SupabaseProjectMeta; staging?: SupabaseProjectMeta };

function readJsonSafe(p: string): any | undefined {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

// 近傍/asar/cwd の順で package.json を探索して情報取得
function readPkg(): any | undefined {
  const nearDist = path.resolve(__dirname, '..', 'package.json'); // app.asar/package.json を想定
  const inAsar = process?.resourcesPath
    ? path.join(process.resourcesPath, 'app.asar', 'package.json')
    : undefined;
  const inCwd = path.resolve(process.cwd(), 'package.json'); // 開発時
  const candidates = [nearDist, inAsar, inCwd].filter(Boolean) as string[];
  for (const p of candidates) {
    const v = readJsonSafe(p);
    if (v) return v;
  }
  return undefined;
}

function loadEmbeddedProxy(): ProxyMeta | undefined {
  const pkg = readPkg();
  if (!pkg) return undefined;
  const embedded = pkg.appConfig?.proxy || pkg.extraMetadata?.appConfig?.proxy;
  if (embedded?.production || embedded?.staging) return embedded;
  return undefined;
}

function loadEmbeddedSupabase(): SupabaseMeta | undefined {
  const pkg = readPkg();
  if (!pkg) return undefined;
  const embedded =
    pkg.appConfig?.supabase ||
    pkg.extraMetadata?.appConfig?.supabase;
  return embedded;
}
// アプリのバージョン文字列（ログ/推定用）
const PKG = readPkg() || {};
export const APP_VERSION_STR: string = PKG.version || '';

// チャンネル決定ルール:
// - 本番(NODE_ENV=production): ランタイムENVは無視。バージョンに '-' があれば beta、無ければ stable。
// - 開発: ランタイムENV(UPDATE_CHANNEL)で上書き可。なければバージョンで推定。
const IS_PROD = process.env.NODE_ENV === 'production';
const VERSION_HAS_PRERELEASE = /-/.test(APP_VERSION_STR);
// 開発時は既定で beta（staging）を指す
const DEV_DEFAULT_CHANNEL = process.env.NODE_ENV === 'development' ? 'beta' : 'stable';
const ENV_CH_RAW = process.env.UPDATE_CHANNEL?.toLowerCase();
const ENV_CHANNEL = ENV_CH_RAW === 'beta' || ENV_CH_RAW === 'stable' ? ENV_CH_RAW : undefined;
const EMBEDDED_CH_RAW = (() => {
  const meta = PKG.appConfig?.updateChannel ?? PKG.extraMetadata?.appConfig?.updateChannel;
  return typeof meta === 'string' ? meta.toLowerCase() : undefined;
})();
const EMBEDDED_CHANNEL = EMBEDDED_CH_RAW === 'beta' || EMBEDDED_CH_RAW === 'stable' ? EMBEDDED_CH_RAW : undefined;
const UPDATE_CHANNEL = ENV_CHANNEL
  ? ENV_CHANNEL
  : EMBEDDED_CHANNEL
    ? EMBEDDED_CHANNEL
    : IS_PROD
      ? (VERSION_HAS_PRERELEASE ? 'beta' : 'stable')
      : DEV_DEFAULT_CHANNEL;

const embedded = loadEmbeddedProxy();
const envProduction = process.env.PROXY_URL_PRODUCTION;
const envStaging = process.env.PROXY_URL_STAGING;

function normalizeProxyUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function resolveProxyUrl(): string {
  // 1) CI埋め込み最優先
  if (embedded?.production && embedded?.staging) {
    const candidate = UPDATE_CHANNEL === 'stable' ? embedded.production : embedded.staging;
    const normalized = normalizeProxyUrl(candidate);
    if (normalized) return normalized;
  }
  // 2) ENV（必要な片側のみでも可）
  if (UPDATE_CHANNEL === 'stable') {
    const normalized = normalizeProxyUrl(envProduction);
    if (normalized) return normalized;
  } else {
    const normalized = normalizeProxyUrl(envStaging);
    if (normalized) return normalized;
  }

  // 3) いずれも無い場合は明確に失敗させる
  throw new Error(
    `PROXY_URL not resolvable. Provide appConfig.proxy via CI or set ` +
    `${UPDATE_CHANNEL === 'stable' ? 'PROXY_URL_PRODUCTION' : 'PROXY_URL_STAGING'} in environment.`
  );
}

// プロキシサーバーのURL設定（堅牢化）
export const PROXY_URL = resolveProxyUrl();

// ポート番号設定
export const PORTS = {
  VOICE_SERVER: process.env.VOICE_SERVER_PORT ? parseInt(process.env.VOICE_SERVER_PORT) : 3838,
  OAUTH_CALLBACK: process.env.OAUTH_CALLBACK_PORT ? parseInt(process.env.OAUTH_CALLBACK_PORT) : 8085,
  PARENT_AGENT: process.env.PARENT_AGENT_PORT ? parseInt(process.env.PARENT_AGENT_PORT) : 8091
};

// 共通チューニング値（マジックナンバー集約）
export const AUDIO_SAMPLE_RATE = 24000;
export const NETWORK_TIMEOUT_MS = 1500;
export const NETWORK_CACHE_MS = 5000;
export const WS_RECONNECT_DELAY_MS = 3000;
export const CHECK_STATUS_INTERVAL_MS = 1500;

// API エンドポイント
export const API_ENDPOINTS = {
  // 認証関連
  AUTH: {
    GOOGLE_OAUTH: `${PROXY_URL}/api/auth/google`,
    CALLBACK: `${PROXY_URL}/api/auth/callback`,
    REFRESH: `${PROXY_URL}/api/auth/refresh`,
    ENTITLEMENT: `${PROXY_URL}/api/auth/entitlement`,
  },
  // ツール関連
  TOOLS: {
    BASE: `${PROXY_URL}/api/tools`,
    SLACK: `${PROXY_URL}/api/tools/slack`,
    CLAUDE_CODE: `${PROXY_URL}/api/tools/claude_code`,
    SEARCH_EXA: `${PROXY_URL}/api/tools/search_exa`,
    PLAYWRIGHT: `${PROXY_URL}/api/tools/playwright`,
    VOICE: `${PROXY_URL}/api/tools/voice`
  },
  // その他のAPI
  OPENAI_PROXY: {
    DESKTOP_SESSION: `${PROXY_URL}/api/realtime/desktop`
  },
  BILLING: {
    CHECKOUT_SESSION: `${PROXY_URL}/api/billing/checkout-session`,
    PORTAL_SESSION: `${PROXY_URL}/api/billing/portal-session`
  },
  SLACK: {
    OAUTH_URL: `${PROXY_URL}/api/auth/slack/oauth/url`
  }
};

// アプリケーション設定
export const APP_CONFIG = {
  IS_DEV: process.env.NODE_ENV !== 'production',
  DESKTOP_MODE: true,
  USE_PROXY: process.env.USE_PROXY !== 'false'
};

// アップデート設定
export const UPDATE_CONFIG = {
  CHANNEL: UPDATE_CHANNEL,
  CHECK_INTERVAL: 1000 * 60 * 60 * 4 // 4時間ごと
};

// Supabase（公開設定のみを「埋め込みメタ」から解決。ランタイムENVは使用しない）
const SUPABASE_EMBEDDED = loadEmbeddedSupabase();

function resolveSupabaseConfig(): SupabaseProjectMeta {
  const envProductionUrl = process.env.SUPABASE_URL_PRODUCTION;
  const envProductionAnon = process.env.SUPABASE_ANON_KEY_PRODUCTION;
  const envStagingUrl = process.env.SUPABASE_URL_STAGING;
  const envStagingAnon = process.env.SUPABASE_ANON_KEY_STAGING;

  if ('production' in (SUPABASE_EMBEDDED || {}) || 'staging' in (SUPABASE_EMBEDDED || {})) {
    const embedded = SUPABASE_EMBEDDED as { production?: SupabaseProjectMeta; staging?: SupabaseProjectMeta };
    const selected = UPDATE_CHANNEL === 'stable' ? embedded.production : embedded.staging;
    if (selected?.url && selected?.anonKey) return selected;
  }

  if (UPDATE_CHANNEL === 'stable' && envProductionUrl && envProductionAnon) {
    return { url: envProductionUrl, anonKey: envProductionAnon };
  }
  if (UPDATE_CHANNEL !== 'stable' && envStagingUrl && envStagingAnon) {
    return { url: envStagingUrl, anonKey: envStagingAnon };
  }

  if ((SUPABASE_EMBEDDED as SupabaseProjectMeta | undefined)?.url && (SUPABASE_EMBEDDED as SupabaseProjectMeta | undefined)?.anonKey) {
    return SUPABASE_EMBEDDED as SupabaseProjectMeta;
  }

  throw new Error(
    `Supabase configuration missing. Provide appConfig.supabase.${UPDATE_CHANNEL === 'stable' ? 'production' : 'staging'} or set SUPABASE_URL_${UPDATE_CHANNEL === 'stable' ? 'PRODUCTION' : 'STAGING'} / SUPABASE_ANON_KEY_${UPDATE_CHANNEL === 'stable' ? 'PRODUCTION' : 'STAGING'}.`
  );
}

const SUPABASE_PROJECT = resolveSupabaseConfig();
export const SUPABASE_CONFIG = {
  URL: SUPABASE_PROJECT.url,
  ANON_KEY: SUPABASE_PROJECT.anonKey
};
