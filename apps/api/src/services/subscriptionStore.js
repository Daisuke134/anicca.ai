import { createClient } from '@supabase/supabase-js';
import { BILLING_CONFIG } from '../config/environment.js';
import { getStripeClient } from './stripe/client.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const DEFAULT_PRO_DAILY_LIMIT = 1000;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase service role client is not configured');
  }
  return supabase;
}

export async function supabaseUserExists(userId) {
  if (!userId) return false;
  const client = requireSupabase();
  try {
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) {
      return false;
    }
    return !!data?.user;
  } catch {
    return false;
  }
}

export async function fetchSubscriptionRow(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}

export async function ensureSubscriptionRow(userId) {
  const existing = await fetchSubscriptionRow(userId);
  if (existing) return existing;
  const client = requireSupabase();
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('user_subscriptions')
    .insert({ user_id: userId, updated_at: nowIso })
    .select('*')
    .single();
  if (error) throw error;
  return data;
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
  const client = requireSupabase();
  const { error } = await client
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  if (error) throw error;
  return customer.id;
}

export async function recordStripeEvent(event) {
  const client = requireSupabase();
  const metadataUserId = event?.data?.object?.metadata?.userId || null;
  const resolvedUserId =
    metadataUserId && await supabaseUserExists(metadataUserId)
      ? metadataUserId
      : null;
  const payload = {
    event_id: event.id,
    user_id: resolvedUserId,
    type: event.type,
    payload: event.data?.object || null,
    created_at: new Date().toISOString()
  };
  const { error } = await client
    .from('subscription_events')
    .insert(payload);
  if (error) {
    if (error.code === '23505') {
      // Duplicate event – already processed
      return false;
    }
    throw error;
  }
  return true;
}

function normalizeStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return { plan: 'pro', status: stripeStatus };
    case 'past_due':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
      return { plan: 'grace', status: stripeStatus };
    default:
      return { plan: 'free', status: stripeStatus || 'canceled' };
  }
}

export async function updateSubscriptionFromStripe(userId, stripeCustomerId, subscription) {
  const client = requireSupabase();
  const { plan, status } = normalizeStripeStatus(subscription?.status);
  const payload = {
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription?.id || null,
    plan,
    status,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    trial_end: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    metadata: subscription?.metadata || {},
    updated_at: new Date().toISOString()
  };
  const { error } = await client
    .from('user_subscriptions')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  return payload;
}

export async function clearSubscription(userId) {
  const client = requireSupabase();
  const { error } = await client
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function getTodayUsage(userId) {
  const client = requireSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from('realtime_usage_daily')
    .select('*')
    .eq('user_id', userId)
    .eq('usage_date', todayIso)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || { user_id: userId, usage_date: todayIso, count: 0 };
}

export async function incrementTodayUsage(userId) {
  const client = requireSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);
  const existing = await getTodayUsage(userId);
  const nextCount = (existing?.count || 0) + 1;
  const { error } = await client
    .from('realtime_usage_daily')
    .upsert({
      user_id: userId,
      usage_date: todayIso,
      count: nextCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,usage_date' });
  if (error) throw error;
  return nextCount;
}

function resolveLimit(plan) {
  if (plan === 'pro') {
    const proLimit = BILLING_CONFIG.PRO_DAILY_LIMIT;
    if (Number.isFinite(proLimit) && proLimit > 0) {
      return proLimit;
    }
    return DEFAULT_PRO_DAILY_LIMIT;
  }

  const freeLimit = BILLING_CONFIG.FREE_DAILY_LIMIT;
  return Number.isFinite(freeLimit) && freeLimit > 0 ? freeLimit : 0;
}

export async function getEntitlementState(userId) {
  const [subscription, usage] = await Promise.all([
    fetchSubscriptionRow(userId),
    getTodayUsage(userId)
  ]);
  const statusInfo = normalizeStripeStatus(subscription?.status);
  const limit = resolveLimit(statusInfo.plan);
  const count = usage?.count || 0;
  const remaining = limit > 0 ? Math.max(limit - count, 0) : null;

  const status = statusInfo;
  const currentPeriodEnd = subscription?.current_period_end || null;

  return {
    plan: status.plan,
    status: status.status,
    currentPeriodEnd,
    usageCount: count,
    usageLimit: limit > 0 ? limit : null,
    usageRemaining: remaining,
    stripeCustomerId: subscription?.stripe_customer_id || null,
    stripeSubscriptionId: subscription?.stripe_subscription_id || null
  };
}

export function canUseRealtime(plan, remaining) {
  if (plan === 'pro') return true;
  if (plan === 'grace') return remaining === null || (remaining ?? 0) > 0;
  return remaining === null || (remaining ?? 0) > 0;
}

export function normalizePlanForResponse(state) {
  return {
    plan: state.plan,
    status: state.status,
    current_period_end: state.currentPeriodEnd,
    daily_usage_limit: state.usageLimit,
    daily_usage_remaining: state.usageRemaining,
    daily_usage_count: state.usageCount
  };
}
