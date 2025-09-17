import { createCheckoutSession } from '../../services/stripe/checkout.js';
import logger from '../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = req.auth;
    if (!auth?.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const session = await createCheckoutSession({
      userId: auth.sub,
      email: auth.email || undefined
    });
    return res.json({ url: session.url });
  } catch (err) {
    logger.error('checkout-session error', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
