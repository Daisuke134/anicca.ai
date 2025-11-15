import crypto from 'crypto';
import { BILLING_CONFIG } from '../../config/environment.js';
import { processRevenueCatEvent } from '../../services/revenuecat/webhookHandler.js';

function verifySignature(rawBody, signature) {
  const secret = BILLING_CONFIG.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) throw new Error('RevenueCat webhook secret not configured');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature || '';
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const signature = req.get('X-RevenueCat-Signature');
  try {
    if (!signature || !verifySignature(req.body, signature)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
    const payload = JSON.parse(req.body.toString());
    await processRevenueCatEvent(payload);
    return res.status(204).send('');
  } catch (error) {
    return res.status(400).json({ error: 'invalid payload' });
  }
}


