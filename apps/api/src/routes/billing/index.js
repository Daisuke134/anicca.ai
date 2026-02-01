import express from 'express';
import revenuecatWebhookRouter from './webhook/revenuecat.js';
import revenuecatSyncRouter from './revenuecat-sync.js';

const router = express.Router();

router.use('/webhook/revenuecat', revenuecatWebhookRouter);
router.use('/revenuecat/sync', revenuecatSyncRouter);

export default router;
