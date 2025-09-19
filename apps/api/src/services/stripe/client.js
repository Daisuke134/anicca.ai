import Stripe from 'stripe';
import { BILLING_CONFIG, IS_PRODUCTION } from '../../config/environment.js';

let stripeClient = null;

export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const secret = BILLING_CONFIG.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  stripeClient = new Stripe(secret, {
    apiVersion: '2024-06-20',
    appInfo: {
      name: 'Anicca Proxy',
      url: 'https://github.com/Daisuke134/anicca.ai',
      version: IS_PRODUCTION ? 'release' : 'development'
    }
  });
  return stripeClient;
}
