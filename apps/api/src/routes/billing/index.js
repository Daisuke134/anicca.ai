import express from 'express';
import checkoutRouter from './checkout-session.js';
import portalRouter from './portal-session.js';
import stripeWebhookRouter from './webhook/stripe.js';
import revenuecatWebhookRouter from './webhook/revenuecat.js';
import revenuecatSyncRouter from './revenuecat-sync.js';

const router = express.Router();

router.use('/checkout-session', checkoutRouter);
router.use('/portal-session', portalRouter);
router.use('/webhook/stripe', stripeWebhookRouter);
router.use('/webhook/revenuecat', revenuecatWebhookRouter);
router.use('/revenuecat/sync', revenuecatSyncRouter);

export default router;
