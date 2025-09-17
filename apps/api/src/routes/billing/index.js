import express from 'express';
import checkoutRouter from './checkout-session.js';
import portalRouter from './portal-session.js';
import stripeWebhookRouter from './webhook/stripe.js';

const router = express.Router();

router.use('/checkout-session', checkoutRouter);
router.use('/portal-session', portalRouter);
router.use('/webhook/stripe', stripeWebhookRouter);

export default router;
