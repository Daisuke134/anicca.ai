import fetch from 'node-fetch';
import { BILLING_CONFIG } from '../../config/environment.js';
import logger from '../../utils/logger.js';

const BASE_URL = 'https://api.revenuecat.com/v1';

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
  // v1エンドポイント（legacy API key対応）
  const url = `${BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`;
  logger.info('[RevenueCat] Fetching entitlements', { appUserId, url });
  
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  
  if (!resp.ok) {
    const txt = await resp.text().catch(()=>'');
    logger.warn('[RevenueCat] API error', { status: resp.status, appUserId, error: txt });
    // 認可/存在なしは未購読として扱い、同期は継続（freeへ収束）
    if (resp.status === 403 || resp.status === 404) {
      return {};
    }
    throw new Error(`RevenueCat API error: ${resp.status} ${txt}`);
  }
  
  const json = await resp.json();
  logger.info('[RevenueCat] API response', { appUserId, response: JSON.stringify(json, null, 2) });
  const entitlements = parseEntitlements(json);
  logger.info('[RevenueCat] Parsed entitlements', { appUserId, entitlements });
  return entitlements;
}


