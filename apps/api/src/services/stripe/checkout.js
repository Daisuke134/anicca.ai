import { BILLING_CONFIG } from '../../config/environment.js';
import { getStripeClient } from './client.js';
import { ensureStripeCustomer } from '../subscriptionStore.js';

function requireReturnUrl(url, name) {
  if (!url) {
    throw new Error(`${name} is not configured`);
  }
  return url;
}

export async function createCheckoutSession({ userId, email }) {
  const stripe = getStripeClient();
  const customerId = await ensureStripeCustomer(userId, email);
  const priceId = BILLING_CONFIG.STRIPE_PRICE_PRO_MONTHLY;
  if (!priceId) {
    throw new Error('STRIPE_PRICE_PRO_MONTHLY is not configured');
  }
  const successUrl = requireReturnUrl(BILLING_CONFIG.CHECKOUT_RETURN_URL, 'CHECKOUT_RETURN_URL');
  const cancelUrl = successUrl; // 単一ページで状態メッセージを表示（LP側で処理）

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId
    },
    subscription_data: {
      metadata: {
        userId
      }
    }
  });
  return session;
}

export async function createPortalSession({ userId, email }) {
  const stripe = getStripeClient();
  const customerId = await ensureStripeCustomer(userId, email);
  const returnUrl = requireReturnUrl(BILLING_CONFIG.PORTAL_RETURN_URL, 'PORTAL_RETURN_URL');
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  return session;
}
