import fetch from 'node-fetch';
import { BILLING_CONFIG } from '../../config/environment.js';
import logger from '../../utils/logger.js';

// V2 APIを使用（PROJECT_ID必須）
const BASE_URL = 'https://api.revenuecat.com/v2';
const PROJECT_ID = BILLING_CONFIG.REVENUECAT_PROJECT_ID;

function parseEntitlements(json) {
  // v1 shape: { subscriber: { entitlements: {...} } }
  if (json?.subscriber?.entitlements) return json.subscriber.entitlements;
  // v2 shape: { data: { entitlements: {...} } }
  if (json?.data?.entitlements) return json.data.entitlements;
  // fallback
  if (json?.entitlements) return json.entitlements;
  return {};
}

export async function fetchCustomerEntitlements(appUserId) {
  const key = BILLING_CONFIG.REVENUECAT_REST_API_KEY;
  if (!key) {
    logger.warn('[RevenueCat] Missing API key');
    return {};
  }
  
  // v2エンドポイント（PROJECT_ID必須）
  if (!PROJECT_ID) {
    logger.warn('[RevenueCat] PROJECT_ID not set, falling back to v1');
    // フォールバック: V1 APIを使用
    const v1Url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
    const resp = await fetch(v1Url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      }
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(()=>'');
      logger.warn('[RevenueCat] V1 API error', { status: resp.status, appUserId, error: txt });
      if (resp.status === 403 || resp.status === 404) {
        return {};
      }
      throw new Error(`RevenueCat API error: ${resp.status} ${txt}`);
    }
    const json = await resp.json();
    const entitlements = parseEntitlements(json);
    logger.info('[RevenueCat] Parsed entitlements (V1 fallback)', { appUserId, entitlements });
    return entitlements;
  }
  
  const url = `${BASE_URL}/projects/${PROJECT_ID}/customers/${encodeURIComponent(appUserId)}`;
  logger.info('[RevenueCat] Fetching entitlements (V2)', { appUserId, url });
  
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  
  if (!resp.ok) {
    const txt = await resp.text().catch(()=>'');
    logger.warn('[RevenueCat] V2 API error', { status: resp.status, appUserId, error: txt });
    // 認可/存在なしは未購読として扱い、同期は継続（freeへ収束）
    if (resp.status === 403 || resp.status === 404) {
      return {};
    }
    throw new Error(`RevenueCat API error: ${resp.status} ${txt}`);
  }
  
  const json = await resp.json();
  logger.info('[RevenueCat] API response (V2)', { appUserId, response: JSON.stringify(json, null, 2) });
  const entitlements = parseEntitlements(json);
  logger.info('[RevenueCat] Parsed entitlements (V2)', { appUserId, entitlements });
  return entitlements;
}


