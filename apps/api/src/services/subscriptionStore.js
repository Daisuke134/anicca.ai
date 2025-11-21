import { BILLING_CONFIG } from '../config/environment.js';
import { getStripeClient } from './stripe/client.js';
import { query } from '../lib/db.js';
import { debitMinutes, VC_CURRENCY_CODE } from './revenuecat/virtualCurrency.js';

export const ENTITLEMENT_SOURCE = {
  STRIPE: 'stripe',
  REVENUECAT: 'revenuecat'
};

// Supabase依存は撤去

export async function fetchSubscriptionRow(userId) {
  const r = await query(
    'select * from user_subscriptions where user_id = $1 limit 1',
    [userId]
  );
  return r.rows[0] || null;
}

export async function ensureSubscriptionRow(userId) {
  const existing = await fetchSubscriptionRow(userId);
  if (existing) return existing;
  const r = await query(
    `insert into user_subscriptions (user_id, updated_at)
     values ($1, timezone('utc', now()))
     on conflict (user_id)
     do update set updated_at = excluded.updated_at
     returning *`,
    [userId]
  );
  return r.rows[0];
}

export async function ensureStripeCustomer(userId, email) {
  const stripe = getStripeClient();
  const existing = await ensureSubscriptionRow(userId);
  if (existing?.stripe_customer_id) {
    try {
      const current = await stripe.customers.retrieve(existing.stripe_customer_id);
      if (!current?.deleted) {
        return existing.stripe_customer_id;
      }
    } catch (error) {
      if (error?.statusCode !== 404 && error?.code !== 'resource_missing') {
        throw error;
      }
    }
  }
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { userId }
  });
  await query(
    `insert into user_subscriptions (user_id, stripe_customer_id, updated_at)
     values ($1, $2, timezone('utc', now()))
     on conflict (user_id)
     do update set stripe_customer_id = excluded.stripe_customer_id,
                   updated_at = excluded.updated_at`,
    [userId, customer.id]
  );
  return customer.id;
}

export async function recordStripeEvent(event) {
  const metadataUserId = event?.data?.object?.metadata?.userId || null;
  const resolvedUserId = metadataUserId || null;
  const payload = {
    event_id: event.id,
    user_id: resolvedUserId,
    type: event.type,
    payload: event.data?.object || null,
    created_at: new Date().toISOString()
  };
  try {
    await query(
      `insert into subscription_events (event_id, user_id, type, payload, created_at)
       values ($1,$2,$3,$4, timezone('utc', now()))`,
      [payload.event_id, payload.user_id, payload.type, payload.payload]
    );
    return true;
  } catch (e) {
    if (String(e.code) === '23505') return false;
    throw e;
  }
}

function normalizeStatus(provider, rawStatus) {
  if (provider === ENTITLEMENT_SOURCE.REVENUECAT) {
    switch (rawStatus) {
      case 'active':
      case 'renewal':
      case 'unlimited':
        return { plan: 'pro', status: rawStatus };
      case 'grace_period':
      case 'billing_issue':
        return { plan: 'grace', status: rawStatus };
      default:
        return { plan: 'free', status: rawStatus || 'expired' };
    }
  }
  switch (rawStatus) {
    case 'active':
    case 'trialing':
      return { plan: 'pro', status: rawStatus };
    case 'past_due':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
      return { plan: 'grace', status: rawStatus };
    default:
      return { plan: 'free', status: rawStatus || 'canceled' };
  }
}

export async function updateSubscriptionFromStripe(userId, stripeCustomerId, subscription) {
  const { plan, status } = normalizeStatus(ENTITLEMENT_SOURCE.STRIPE, subscription?.status);
  const payload = {
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription?.id || null,
    plan,
    status,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    trial_end: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    metadata: subscription?.metadata || {},
    entitlement_source: ENTITLEMENT_SOURCE.STRIPE,
    revenuecat_entitlement_id: null,
    revenuecat_original_transaction_id: null,
    updated_at: new Date().toISOString()
  };
  await query(
    `insert into user_subscriptions
     (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, trial_end, metadata, entitlement_source, revenuecat_entitlement_id, revenuecat_original_transaction_id, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, timezone('utc', now()))
     on conflict (user_id)
     do update set
       stripe_customer_id=excluded.stripe_customer_id,
       stripe_subscription_id=excluded.stripe_subscription_id,
       plan=excluded.plan,
       status=excluded.status,
       current_period_end=excluded.current_period_end,
       trial_end=excluded.trial_end,
       metadata=excluded.metadata,
       entitlement_source=excluded.entitlement_source,
       revenuecat_entitlement_id=excluded.revenuecat_entitlement_id,
       revenuecat_original_transaction_id=excluded.revenuecat_original_transaction_id,
       updated_at=excluded.updated_at`,
    [
      payload.user_id, payload.stripe_customer_id, payload.stripe_subscription_id,
      payload.plan, payload.status, payload.current_period_end, payload.trial_end,
      payload.metadata, payload.entitlement_source, payload.revenuecat_entitlement_id,
      payload.revenuecat_original_transaction_id
    ]
  );
  return payload;
}

export async function clearSubscription(userId) {
  await query(
    `insert into user_subscriptions (user_id, plan, status, stripe_subscription_id, entitlement_source, revenuecat_entitlement_id, revenuecat_original_transaction_id, updated_at)
     values ($1,'free','canceled', null, $2, null, null, timezone('utc', now()))
     on conflict (user_id)
     do update set
       plan='free', status='canceled', stripe_subscription_id=null,
       entitlement_source=$2, revenuecat_entitlement_id=null, revenuecat_original_transaction_id=null,
       updated_at=timezone('utc', now())`,
    [userId, ENTITLEMENT_SOURCE.STRIPE]
  );
}

export async function getTodayUsage(userId) {
  const r = await query(
    `select user_id, usage_date, count
     from realtime_usage_daily
     where user_id = $1 and usage_date = (current_date)`,
    [userId]
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  return r.rows[0] || { user_id: userId, usage_date: todayIso, count: 0 };
}

export async function startUsageSession(userId, sessionId) {
  await ensureSubscriptionRow(userId);
  await query(
    `insert into usage_sessions (session_id, user_id, started_at)
     values ($1, $2, timezone('utc', now()))
     on conflict (session_id) do nothing`,
    [sessionId, userId]
  );
}

export async function finishUsageSessionAndBill(userId, sessionId) {
  const r = await query(
    `update usage_sessions
     set ended_at = timezone('utc', now()),
         billed_seconds = extract(epoch from timezone('utc', now()) - started_at),
         billed_minutes = ceil(extract(epoch from timezone('utc', now()) - started_at) / 60.0)::int,
         updated_at = timezone('utc', now())
     where session_id=$1 and user_id=$2
     returning billed_minutes`,
    [sessionId, userId]
  );
  const minutes = Number(r.rows[0]?.billed_minutes || 0);
  if (minutes > 0) {
    // RevenueCatの残高をデビット（サーバ権威）
    await debitMinutes({
      appUserId: userId,
      minutes,
      currency: VC_CURRENCY_CODE,
      context: { type: 'realtime', sessionId }
    });
  }
  return minutes;
}

export async function getMonthlyUsage(userId) {
  const r = await query(
    `select coalesce(sum(billed_minutes),0) as total
     from usage_sessions
     where user_id=$1
       and started_at >= date_trunc('month', (now() at time zone 'utc'))`,
    [userId]
  );
  return Number(r.rows[0]?.total || 0);
}

function resolveMonthlyLimit(plan) {
  if (plan === 'pro') {
    const proLimit = BILLING_CONFIG.PRO_MONTHLY_LIMIT;
    return Number.isFinite(proLimit) && proLimit > 0 ? proLimit : 0; // Railway未設定=0でブロック
  }
  const freeLimit = BILLING_CONFIG.FREE_MONTHLY_LIMIT;
  return Number.isFinite(freeLimit) && freeLimit > 0 ? freeLimit : 0; // Railway未設定=0でブロック
}

export async function getEntitlementState(userId) {
  const [subscription, monthlyUsage] = await Promise.all([
    fetchSubscriptionRow(userId),
    getMonthlyUsage(userId)
  ]);
  
  // RevenueCatの場合、entitlement_payloadを直接確認
  let statusInfo = normalizeStatus(
    subscription?.entitlement_source || ENTITLEMENT_SOURCE.STRIPE,
    subscription?.status
  );
  
  // RevenueCatのentitlement_payloadから直接isActiveを確認
  if (subscription?.entitlement_source === 'revenuecat') {
    // entitlement_payloadが文字列の場合はパース、オブジェクトの場合はそのまま使用
    let payload = subscription?.entitlement_payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        payload = null;
      }
    }
    
    if (payload && typeof payload === 'object') {
      const isActive = payload.is_active === true;
      const expiresDate = payload.expires_date ? new Date(payload.expires_date) : null;
      const isExpired = expiresDate ? expiresDate <= new Date() : false;
      
      if (isActive && !isExpired) {
        statusInfo = { 
          plan: 'pro', 
          status: payload.period_type === 'trial' ? 'trialing' : 'active' 
        };
      } else if (expiresDate && expiresDate > new Date()) {
        // 有効期限内だがisActiveがfalse（grace期間）
        statusInfo = { plan: 'pro', status: 'grace_period' };
      } else {
        statusInfo = { plan: 'free', status: 'expired' };
      }
    } else if (
      subscription?.current_period_end &&
      new Date(subscription.current_period_end) > new Date() &&
      statusInfo.plan === 'free'
    ) {
      // フォールバック: current_period_endが未来ならproとして扱う
      statusInfo = { ...statusInfo, plan: 'pro' };
    }
  }
  
  const limit = resolveMonthlyLimit(statusInfo.plan);
  const count = monthlyUsage || 0;
  const remaining = Math.max(limit - count, 0);

  const status = statusInfo;
  const currentPeriodEnd = subscription?.current_period_end || null;

  return {
    plan: status.plan,
    status: status.status,
    currentPeriodEnd,
    usageCount: count,
    usageLimit: limit,
    usageRemaining: remaining,
    stripeCustomerId: subscription?.stripe_customer_id || null,
    stripeSubscriptionId: subscription?.stripe_subscription_id || null
  };
}

export function canUseRealtime(plan, remaining) {
  // 月次残枠ベースで一律判定（Proも枠超過で停止）
  return (remaining ?? 0) > 0;
}

export function normalizePlanForResponse(state) {
  return {
    plan: state.plan,
    status: state.status,
    current_period_end: state.currentPeriodEnd,
    monthly_usage_limit: state.usageLimit,
    monthly_usage_remaining: state.usageRemaining,
    monthly_usage_count: state.usageCount
  };
}
