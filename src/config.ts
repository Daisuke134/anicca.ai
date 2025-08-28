/**
 * Application configuration
 * 環境別の設定を管理（埋め込み → ENV → 既定URL の順で解決）
 */

import * as fs from 'fs';
import * as path from 'path';

// CIが埋め込む想定のメタデータ
type ProxyMeta = { production?: string; staging?: string };

function readJsonSafe(p: string): any | undefined {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
}

// app.asar 内/開発時の両方で package.json を探す
function loadEmbeddedProxy(): ProxyMeta | undefined {
  // dist/config.js から見たルートの package.json
  const nearDist = path.resolve(__dirname, '..', 'package.json');
  // asar 直下の package.json（仮想FS経由で読める環境用）
  const inAsar = process?.resourcesPath
    ? path.join(process.resourcesPath, 'app.asar', 'package.json')
    : undefined;
  // 開発カレントの package.json
  const inCwd = path.resolve(process.cwd(), 'package.json');

  const candidates = [nearDist, inAsar, inCwd].filter(Boolean) as string[];
  for (const p of candidates) {
    const pkg = readJsonSafe(p);
    if (!pkg) continue;
    const embedded = pkg.appConfig?.proxy || pkg.extraMetadata?.appConfig?.proxy;
    if (embedded?.production || embedded?.staging) return embedded;
  }
  return undefined;
}

// UPDATE_CHANNEL を最優先（beta/stable）。未指定時は NODE_ENV で推定。
const UPDATE_CHANNEL =
  (process.env.UPDATE_CHANNEL?.toLowerCase() === 'beta' && 'beta') ||
  (process.env.UPDATE_CHANNEL?.toLowerCase() === 'stable' && 'stable') ||
  (process.env.NODE_ENV === 'production' ? 'stable' : 'beta');

const embedded = loadEmbeddedProxy();
const envProduction = process.env.PROXY_URL_PRODUCTION;
const envStaging = process.env.PROXY_URL_STAGING;

function resolveProxyUrl(): string {
  // 1) CI埋め込み最優先
  if (embedded?.production && embedded?.staging) {
    return UPDATE_CHANNEL === 'stable' ? embedded.production : embedded.staging;
  }
  // 2) ENV フォールバック
  if (envProduction && envStaging) {
    return UPDATE_CHANNEL === 'stable' ? envProduction : envStaging;
  }
  // 3) 既定URL（最後の砦）
  return UPDATE_CHANNEL === 'stable'
    ? 'https://anicca-proxy-production.up.railway.app'
    : 'https://anicca-proxy-staging.up.railway.app';
}

// プロキシサーバーのURL設定（堅牢化）
export const PROXY_URL = resolveProxyUrl();

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
  CHANNEL: UPDATE_CHANNEL,
  CHECK_INTERVAL: 1000 * 60 * 60 * 4 // 4時間ごと
};
