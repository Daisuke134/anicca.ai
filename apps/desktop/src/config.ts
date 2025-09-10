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
type SupabaseMeta = { url?: string; anonKey?: string };

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
  if (embedded?.url && embedded?.anonKey) return embedded;
  return undefined;
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
const DEV_DEFAULT_CHANNEL = 'beta';
const ENV_CH = IS_PROD ? undefined : process.env.UPDATE_CHANNEL?.toLowerCase();
const UPDATE_CHANNEL = IS_PROD
  ? (VERSION_HAS_PRERELEASE ? 'beta' : 'stable')
  : (ENV_CH === 'beta' || ENV_CH === 'stable' ? ENV_CH : DEV_DEFAULT_CHANNEL);

const embedded = loadEmbeddedProxy();
const envProduction = process.env.PROXY_URL_PRODUCTION;
const envStaging = process.env.PROXY_URL_STAGING;

function resolveProxyUrl(): string {
  // 1) CI埋め込み最優先
  if (embedded?.production && embedded?.staging) {
    return UPDATE_CHANNEL === 'stable' ? embedded.production : embedded.staging;
  }
  // 2) ENV（必要な片側のみでも可）
  if (UPDATE_CHANNEL === 'stable' && envProduction) return envProduction;
  if (UPDATE_CHANNEL === 'beta' && envStaging) return envStaging;

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
    DESKTOP_SESSION: `${PROXY_URL}/api/openai-proxy/desktop-session`
  },
  SLACK: {
    OAUTH_URL: `${PROXY_URL}/api/slack/oauth-url`
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
export const SUPABASE_CONFIG = {
  URL: SUPABASE_EMBEDDED?.url || '',
  ANON_KEY: SUPABASE_EMBEDDED?.anonKey || ''
};
