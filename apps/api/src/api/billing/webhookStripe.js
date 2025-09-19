import logger from '../../utils/logger.js';
import { constructStripeEvent, processStripeEvent } from '../../services/stripe/webhookHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }
  try {
    const rawBody = req.body; // Buffer from express.raw
    const event = constructStripeEvent(rawBody, signature);
    await processStripeEvent(event);
    return res.status(204).send('');
  } catch (err) {
    logger.error('Stripe webhook error', err);
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
}
