import { processRevenueCatEvent } from '../../services/revenuecat/webhookHandler.js';
import logger from '../../utils/logger.js';
import { BILLING_CONFIG } from '../../config/environment.js';

export default async function webhookRevenueCat(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // RevenueCat webhook認証: AuthorizationヘッダーまたはX-RevenueCat-Webhook-Signatureヘッダーを確認
    const authHeader = req.headers['authorization'];
    const signatureHeader = req.headers['x-revenuecat-webhook-signature'];
    
    let secret = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      secret = authHeader.replace('Bearer ', '');
    } else if (signatureHeader) {
      secret = signatureHeader;
    }

    if (!secret) {
      logger.warn('RevenueCat webhook: Missing authorization header');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (BILLING_CONFIG.REVENUECAT_WEBHOOK_SECRET && secret !== BILLING_CONFIG.REVENUECAT_WEBHOOK_SECRET) {
      logger.warn('RevenueCat webhook: Invalid webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // express.raw()でBufferとして受け取っているので、JSONにパース
    let event;
    if (Buffer.isBuffer(req.body)) {
      const bodyString = req.body.toString('utf8');
      event = JSON.parse(bodyString);
    } else {
      event = req.body;
    }

    if (!event || !event.event) {
      logger.warn('RevenueCat webhook: Invalid event payload', { body: event });
      return res.status(400).json({ error: 'Invalid payload' });
    }

    await processRevenueCatEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('RevenueCat webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

