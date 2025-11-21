import fetch from 'node-fetch';
import { BILLING_CONFIG } from '../../config/environment.js';

const BASE_URL = 'https://api.revenuecat.com/v2';

function parseEntitlements(json) {
  if (json?.data?.entitlements) return json.data.entitlements; // v2 shape
  if (json?.entitlements) return json.entitlements;            // fallback
  return {};
}

export async function fetchCustomerEntitlements(appUserId) {
  const project = BILLING_CONFIG.REVENUECAT_PROJECT_ID;
  const key = BILLING_CONFIG.REVENUECAT_REST_API_KEY;
  if (!project || !key) {
    return {};
  }
  const url = `${BASE_URL}/projects/${project}/customers/${encodeURIComponent(appUserId)}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!resp.ok) {
    // 認可/存在なしは未購読として扱い、同期は継続（freeへ収束）
    if (resp.status === 403 || resp.status === 404) {
      return {};
    }
    const txt = await resp.text().catch(()=>'');
    throw new Error(`RevenueCat API error: ${resp.status} ${txt}`);
  }
  const json = await resp.json();
  return parseEntitlements(json);
}


