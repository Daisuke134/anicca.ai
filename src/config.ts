/**
 * Application configuration (strict)
 * - URLs are injected via extraMetadata at build time (CI).
 * - No hardcoded fallback. Missing config -> throw.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

const APP_VERSION_STR: string = pkg.version as string;
const appConfig = (pkg.appConfig || {}) as { proxy?: { production?: string; staging?: string } };
const proxy = appConfig.proxy || {};

if (!proxy.production || !proxy.staging) {
  throw new Error('Proxy URLs are not embedded. Ensure CI injects appConfig.proxy.{production,staging}.');
}

// チャンネル: UPDATE_CHANNELがあれば優先、なければバージョンに'-'が含まれる場合はbeta、そうでなければstable
const CHANNEL = process.env.UPDATE_CHANNEL || (/-/.test(APP_VERSION_STR) ? 'beta' : 'stable');

export const UPDATE_CONFIG = {
  CHANNEL,
  CHECK_INTERVAL: 1000 * 60 * 60 * 4 // 4時間ごと
};

export const PROXY_URL = CHANNEL === 'beta' ? proxy.staging! : proxy.production!;
export { APP_VERSION_STR };

// ポート番号設定
export const PORTS = {
  VOICE_SERVER: process.env.VOICE_SERVER_PORT ? parseInt(process.env.VOICE_SERVER_PORT) : 3838,
  OAUTH_CALLBACK: process.env.OAUTH_CALLBACK_PORT ? parseInt(process.env.OAUTH_CALLBACK_PORT) : 8085,
  PARENT_AGENT: process.env.PARENT_AGENT_PORT ? parseInt(process.env.PARENT_AGENT_PORT) : 8091
};

// API エンドポイント
export const API_ENDPOINTS = {
  // 認証関連
  AUTH: {
    GOOGLE_OAUTH: `${PROXY_URL}/api/auth/google`,
    CALLBACK: `${PROXY_URL}/api/auth/callback`,
    SESSION: `${PROXY_URL}/api/auth/session`,
    REFRESH: `${PROXY_URL}/api/auth/refresh`
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
    SESSION: `${PROXY_URL}/api/openai-proxy/session`
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
