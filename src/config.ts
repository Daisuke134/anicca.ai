/**
 * Application configuration
 * 環境別の設定を管理
 */

// アプリバージョン（ビルド時に固定化される）
// package.json はビルド成果物に同梱される設定（electron-builder-voice.ymlのfiles）
// これにより、配布時も正確なバージョンを参照できる
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: APP_VERSION } = require('../package.json');
export const APP_VERSION_STR: string = APP_VERSION;

// チャンネル判定：環境変数UPDATE_CHANNELがあれば最優先、なければバージョンのプレリリース有無で決定
const IS_PRERELEASE = /-/.test(APP_VERSION_STR);
const RUNTIME_CHANNEL = process.env.UPDATE_CHANNEL || (IS_PRERELEASE ? 'beta' : 'stable');

// プロキシサーバーのURL設定（チャンネルで接続先を分岐）
const PRODUCTION_PROXY = 'https://anicca-proxy-production.up.railway.app';
const STAGING_PROXY = 'https://anicca-proxy-staging.up.railway.app';
export const PROXY_URL = RUNTIME_CHANNEL === 'beta' ? STAGING_PROXY : PRODUCTION_PROXY;

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
  // 開発モード判定
  IS_DEV: process.env.NODE_ENV !== 'production',
  // デスクトップモード
  DESKTOP_MODE: true,
  // プロキシ使用設定
  USE_PROXY: process.env.USE_PROXY !== 'false'
};

// アップデート設定
export const UPDATE_CONFIG = {
  CHANNEL: RUNTIME_CHANNEL,
  CHECK_INTERVAL: 1000 * 60 * 60 * 4 // 4時間ごと
};
