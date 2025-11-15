import fetch from 'node-fetch';
import { BILLING_CONFIG } from '../../config/environment.js';

const BASE_URL = 'https://api.revenuecat.com/v2';

export async function fetchCustomerEntitlements(appUserId) {
  const url = `${BASE_URL}/projects/${BILLING_CONFIG.REVENUECAT_PROJECT_ID}/customers/${encodeURIComponent(appUserId)}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BILLING_CONFIG.REVENUECAT_REST_API_KEY}`
    }
  });
  if (!resp.ok) {
    throw new Error(`RevenueCat API error: ${resp.status}`);
  }
  const json = await resp.json();
  return json?.data?.entitlements || {};
}


