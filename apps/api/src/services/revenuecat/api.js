import fetch from 'node-fetch';
import { BILLING_CONFIG } from '../../config/environment.js';
import logger from '../../utils/logger.js';

// V2 APIを使用（PROJECT_ID必須）
const BASE_URL = 'https://api.revenuecat.com/v2';
const PROJECT_ID = BILLING_CONFIG.REVENUECAT_PROJECT_ID;

function parseEntitlements(json) {
  // V2 API Response: { active_entitlements: { object: "list", items: [...] }, ... }
  // CustomerEntitlementスキーマ: { object: "customer.active_entitlement", entitlement_id: string, expires_at: integer (ms) }
  if (json?.active_entitlements?.items && Array.isArray(json.active_entitlements.items)) {
    const result = {};
    const now = Date.now(); // ミリ秒単位の現在時刻
    
    for (const item of json.active_entitlements.items) {
      // 必須フィールドの検証
      if (!item.entitlement_id || item.object !== 'customer.active_entitlement') {
        logger.warn('[RevenueCat] Invalid entitlement item format', { item });
        continue;
      }
      
      const entitlementId = item.entitlement_id;
      const expiresAt = item.expires_at; // ミリ秒単位のタイムスタンプ（nullable）
      
      // expires_atがnullの場合は有効期限なし（ライフタイム）
      // expires_atが現在時刻より後なら有効
      const isActive = expiresAt == null || expiresAt > now;
      
      result[entitlementId] = {
        entitlement_id: entitlementId,
        is_active: isActive, // expires_atから計算
        expires_at: expiresAt, // ミリ秒単位のタイムスタンプ
        expires_date: expiresAt ? new Date(expiresAt).toISOString() : null, // ISO文字列に変換
        // 注意: V2 APIのCustomerEntitlementには以下のフィールドは存在しない
        // product_identifier, original_transaction_id, period_type は別エンドポイントから取得が必要
      };
    }
    
    logger.info('[RevenueCat] Parsed V2 entitlements', { 
      count: Object.keys(result).length,
      entitlementIds: Object.keys(result)
    });
    return result;
  }
  
  logger.warn('[RevenueCat] Unexpected V2 response format or missing active_entitlements', { 
    hasActiveEntitlements: !!json?.active_entitlements,
    hasItems: !!json?.active_entitlements?.items 
  });
  return {};
}

export async function fetchCustomerEntitlements(appUserId) {
  const key = BILLING_CONFIG.REVENUECAT_REST_API_KEY;
  const projectId = BILLING_CONFIG.REVENUECAT_PROJECT_ID;
  
  if (!key || !projectId) {
    logger.error('[RevenueCat] Missing API Key or Project ID', { 
      hasKey: !!key, 
      hasProjectId: !!projectId 
    });
    return {};
  }
  
  // V2 Endpoint: GET /v2/projects/{project_id}/customers/{customer_id}
  const url = `${BASE_URL}/projects/${projectId}/customers/${encodeURIComponent(appUserId)}`;
  
  logger.info('[RevenueCat] Fetching entitlements (V2)', { appUserId, url });
  
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`, // V2 APIはBearer必須
        Accept: 'application/json'
      }
    });
    
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      logger.warn('[RevenueCat] API error', { 
        status: resp.status, 
        appUserId, 
        error: txt 
      });
      // 404/403は未購読として扱う（エラーをthrowしない）
      if (resp.status === 403 || resp.status === 404) {
        return {};
      }
      throw new Error(`RevenueCat API error: ${resp.status} ${txt}`);
    }
    
    const json = await resp.json();
    logger.debug('[RevenueCat] API response (V2)', { 
      appUserId, 
      hasActiveEntitlements: !!json?.active_entitlements 
    });
    
    return parseEntitlements(json);
    
  } catch (err) {
    logger.error('[RevenueCat] Network/Parse error', { 
      error: err.message, 
      appUserId 
    });
    return {};
  }
}


