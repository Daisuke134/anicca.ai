import { BILLING_CONFIG } from '../../config/environment.js';
import { getStripeClient } from './client.js';
import {
  recordStripeEvent,
  updateSubscriptionFromStripe,
  clearSubscription
} from '../subscriptionStore.js';

function getWebhookSecret() {
  const secret = BILLING_CONFIG.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

async function resolveUserIdFromCustomer(customerId) {
  if (!customerId) return null;
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer?.deleted) return null;
  return customer?.metadata?.userId || null;
}

async function resolveUserId(object) {
  return (
    object?.metadata?.userId ||
    (object?.customer ? await resolveUserIdFromCustomer(object.customer) : null)
  );
}

async function syncSubscriptionById(userId, customerId, subscriptionId) {
  if (!subscriptionId) {
    await clearSubscription(userId);
    return;
  }
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await updateSubscriptionFromStripe(userId, customerId, subscription);
}

async function handleSubscriptionObject(event, object) {
  const userId = await resolveUserId(object);
  if (!userId) return;
  const customerId = object?.customer;
  if (!customerId) return;
  const subscriptionId = object?.id;
  if (!subscriptionId) return;
  await syncSubscriptionById(userId, customerId, subscriptionId);
}

async function handleCheckoutSession(event, session) {
  const userId = await resolveUserId(session);
  if (!userId) return;
  const customerId = session.customer;
  if (!customerId) return;
  if (session.subscription) {
    await syncSubscriptionById(userId, customerId, session.subscription);
  }
}

async function handleInvoice(event, invoice) {
  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;
  const userId = await resolveUserId(invoice);
  if (!userId || !customerId) return;
  if (invoice.paid) {
    if (subscriptionId) {
      await syncSubscriptionById(userId, customerId, subscriptionId);
    }
  } else if (event.type === 'invoice.payment_failed') {
    if (subscriptionId) {
      await syncSubscriptionById(userId, customerId, subscriptionId);
    }
  }
}

async function handleSubscriptionDeleted(event, object) {
  const userId = await resolveUserId(object);
  if (!userId) return;
  await clearSubscription(userId);
}

async function handleChargeRefunded(event, charge) {
  const invoiceId = charge?.invoice;
  const chargeCustomerId = charge?.customer || null;
  let invoice = null;
  if (invoiceId) {
    const stripe = getStripeClient();
    invoice = typeof invoiceId === 'string'
      ? await stripe.invoices.retrieve(invoiceId)
      : invoiceId;
  }
  const userId = await resolveUserId(invoice || charge);
  if (!userId) return;
  const subscriptionId = invoice?.subscription || null;
  const customerId = chargeCustomerId || invoice?.customer || null;
  if (subscriptionId && customerId) {
    await syncSubscriptionById(userId, customerId, subscriptionId);
  } else {
    await clearSubscription(userId);
  }
}

export function constructStripeEvent(rawBody, signature) {
  const stripe = getStripeClient();
  const secret = getWebhookSecret();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function processStripeEvent(event) {
  const shouldProcess = await recordStripeEvent(event);
  if (!shouldProcess) {
    return;
  }
  const object = event.data?.object;
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSession(event, object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionObject(event, object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event, object);
      break;
    case 'charge.refunded':
      await handleChargeRefunded(event, object);
      break;
    case 'invoice.payment_failed':
    case 'invoice.paid':
      await handleInvoice(event, object);
      break;
    default:
      break;
  }
}
